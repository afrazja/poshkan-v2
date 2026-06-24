"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getQuote, getQuotes } from "@/lib/marketdata";
import { assetTypeError } from "@/lib/assets";
import { marginFor, sltpError, autoCloseReason } from "@/lib/forex";

// Server-side guard: does this symbol belong in this account's asset class?
async function checkAccountAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  symbol: string
): Promise<string | null> {
  const { data } = await supabase.from("accounts").select("type").eq("id", accountId).single();
  if (!data) return "Account not found";
  return assetTypeError(data.type, symbol);
}

// Execute a BUY or SELL. Price is fetched LIVE on the server — never trusted
// from the client — then passed to the atomic execute_trade RPC.
export async function executeTradeAction(input: {
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
}): Promise<{ price?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.quantity || input.quantity <= 0) return { error: "Quantity must be positive" };

  // Enforce the account's asset class when adding exposure (sells always allowed).
  if (input.side === "BUY") {
    const typeErr = await checkAccountAsset(supabase, input.accountId, input.symbol);
    if (typeErr) return { error: typeErr };
  }

  let price: number;
  try {
    const quote = await getQuote(input.symbol);
    price = quote.price;
    if (!price || price <= 0) return { error: "Could not get a valid price" };
  } catch (e) {
    return { error: `Price fetch failed: ${(e as Error).message}` };
  }

  const { error } = await supabase.rpc("execute_trade", {
    p_account_id: input.accountId,
    p_symbol: input.symbol.toUpperCase(),
    p_side: input.side,
    p_quantity: input.quantity,
    p_price: price,
  });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/${input.accountId}`);
  return { price };
}

// Place a pending limit order. It fills later when the live price crosses the
// limit (checked client-side while the account is open).
export async function placeLimitOrderAction(input: {
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  timeInForce?: "DAY" | "GTC";
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!input.quantity || input.quantity <= 0) return { error: "Quantity must be positive" };
  if (!input.limitPrice || input.limitPrice <= 0) return { error: "Enter a valid limit price" };

  if (input.side === "BUY") {
    const typeErr = await checkAccountAsset(supabase, input.accountId, input.symbol);
    if (typeErr) return { error: typeErr };
  }

  const { error } = await supabase.from("orders").insert({
    account_id: input.accountId,
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    limit_price: input.limitPrice,
    time_in_force: input.timeInForce === "DAY" ? "DAY" : "GTC",
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}

export async function cancelOrderAction(orderId: string, accountId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: "canceled" })
    .eq("id", orderId)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${accountId}`);
  return {};
}

// Fill a pending limit order IF the live price still satisfies it. Re-fetches the
// price server-side (never trusts the client) and runs the same atomic trade RPC.
export async function fillLimitOrderAction(
  orderId: string
): Promise<{ filled: boolean; price?: number; error?: string }> {
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("status", "pending")
    .single();
  if (!order) return { filled: false };

  let price: number;
  try {
    price = (await getQuote(order.symbol)).price;
  } catch {
    return { filled: false };
  }
  const meetsLimit =
    order.side === "BUY" ? price <= Number(order.limit_price) : price >= Number(order.limit_price);
  if (!meetsLimit) return { filled: false };

  // CLAIM the order atomically BEFORE trading, so a concurrent fill (cron or
  // another tab) can't execute the same order twice. Whoever flips the status
  // wins; everyone else sees zero updated rows and backs off.
  const { data: claimed } = await supabase
    .from("orders")
    .update({ status: "filled", filled_at: new Date().toISOString(), filled_price: price })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return { filled: false };

  const { error } = await supabase.rpc("execute_trade", {
    p_account_id: order.account_id,
    p_symbol: order.symbol,
    p_side: order.side,
    p_quantity: order.quantity,
    p_price: price,
  });
  if (error) {
    // Trade failed (e.g. insufficient cash/shares) — mark canceled so it stops retrying.
    await supabase.from("orders").update({ status: "canceled" }).eq("id", orderId);
    revalidatePath(`/dashboard/${order.account_id}`);
    return { filled: false, error: error.message };
  }
  revalidatePath(`/dashboard/${order.account_id}`);
  return { filled: true, price };
}

// Forex: open a leveraged long/short pair position (margin reserved from cash).
export async function openFxPositionAction(input: {
  accountId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  units: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  autoCloseMinutes?: number | null;
}): Promise<{ rate?: number; margin?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.units || input.units <= 0) return { error: "Units must be positive" };

  const { data: account } = await supabase
    .from("accounts")
    .select("type, leverage")
    .eq("id", input.accountId)
    .single();
  if (!account) return { error: "Account not found" };
  if (account.type !== "forex") return { error: "Forex positions require a forex account" };
  const typeErr = assetTypeError(account.type, input.symbol);
  if (typeErr) return { error: typeErr };

  let rate: number;
  try {
    rate = (await getQuote(input.symbol)).price;
    if (!rate || rate <= 0) return { error: "Could not get a valid rate" };
  } catch (e) {
    return { error: `Rate fetch failed: ${(e as Error).message}` };
  }

  const sl = input.stopLoss ?? null;
  const tp = input.takeProfit ?? null;
  const sltpErr = sltpError(input.direction, rate, sl, tp);
  if (sltpErr) return { error: sltpErr };

  const margin = marginFor(input.units, rate, (account as { leverage?: number }).leverage, input.symbol);
  const { data: newId, error } = await supabase.rpc("fx_open", {
    p_account_id: input.accountId,
    p_symbol: input.symbol.toUpperCase(),
    p_direction: input.direction,
    p_units: input.units,
    p_rate: rate,
    p_margin: margin,
    p_stop_loss: sl,
    p_take_profit: tp,
  });
  if (error) return { error: error.message };
  // Optional timed auto-close (best-effort; needs forex-timed-close.sql).
  if (input.autoCloseMinutes && input.autoCloseMinutes > 0 && newId) {
    await supabase.rpc("fx_set_auto_close", { p_position_id: newId, p_minutes: Math.round(input.autoCloseMinutes) });
  }
  revalidatePath(`/dashboard/${input.accountId}`);
  return { rate, margin };
}

// Forex: close an open position at the live rate.
export async function closeFxPositionAction(
  positionId: string,
  accountId: string
): Promise<{ pnl?: number; error?: string }> {
  const supabase = await createClient();
  const { data: pos } = await supabase
    .from("fx_positions")
    .select("symbol")
    .eq("id", positionId)
    .eq("status", "open")
    .single();
  if (!pos) return { error: "Position not found" };

  let rate: number;
  try {
    rate = (await getQuote(pos.symbol)).price;
    if (!rate || rate <= 0) return { error: "Could not get a valid rate" };
  } catch (e) {
    return { error: `Rate fetch failed: ${(e as Error).message}` };
  }

  const { data, error } = await supabase.rpc("fx_close", {
    p_position_id: positionId,
    p_rate: rate,
    p_reason: "closed",
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${accountId}`);
  return { pnl: data as number };
}

// Forex: place a pending entry order — open a position when the rate reaches a
// level. trigger_when is derived server-side from the live rate at placement
// (limit entry vs stop/breakout entry).
export async function placeFxOrderAction(input: {
  accountId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  units: number;
  entryRate: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  expiresMinutes?: number | null; // null = GTC
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!input.units || input.units <= 0) return { error: "Units must be positive" };
  if (!input.entryRate || input.entryRate <= 0) return { error: "Enter a valid entry rate" };

  const { data: account } = await supabase
    .from("accounts")
    .select("type")
    .eq("id", input.accountId)
    .single();
  if (!account || account.type !== "forex") return { error: "Forex orders require a forex account" };

  let rate: number;
  try {
    rate = (await getQuote(input.symbol)).price;
    if (!rate || rate <= 0) return { error: "Could not get a valid rate" };
  } catch (e) {
    return { error: `Rate fetch failed: ${(e as Error).message}` };
  }
  // Reject entries within half a pip of the live rate (use a market order there).
  if (Math.abs(input.entryRate - rate) / rate < 0.00005) {
    return { error: "Entry rate is the current rate — use a market order instead." };
  }

  // SL/TP must make sense relative to the ENTRY rate (where the position opens).
  const sl = input.stopLoss ?? null;
  const tp = input.takeProfit ?? null;
  const sltpErr = sltpError(input.direction, input.entryRate, sl, tp);
  if (sltpErr) return { error: sltpErr };

  const { error } = await supabase.from("fx_orders").insert({
    account_id: input.accountId,
    symbol: input.symbol.toUpperCase(),
    direction: input.direction,
    units: input.units,
    entry_rate: input.entryRate,
    trigger_when: input.entryRate < rate ? "AT_OR_BELOW" : "AT_OR_ABOVE",
    stop_loss: sl,
    take_profit: tp,
    expires_at:
      input.expiresMinutes && input.expiresMinutes > 0
        ? new Date(Date.now() + input.expiresMinutes * 60_000).toISOString()
        : null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}

export async function cancelFxOrderAction(orderId: string, accountId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fx_orders")
    .update({ status: "canceled" })
    .eq("id", orderId)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${accountId}`);
  return {};
}

// Forex: edit a still-pending entry order's rate / SL / TP. trigger_when is
// recomputed from the live rate (so moving the entry across price flips it).
export async function editFxOrderAction(input: {
  orderId: string;
  accountId: string;
  entryRate: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!input.entryRate || input.entryRate <= 0) return { error: "Enter a valid entry rate" };

  const { data: o } = await supabase
    .from("fx_orders")
    .select("symbol, direction")
    .eq("id", input.orderId)
    .eq("status", "pending")
    .maybeSingle();
  if (!o) return { error: "Order not found or no longer pending" };

  let rate: number;
  try {
    rate = (await getQuote(o.symbol)).price;
    if (!rate || rate <= 0) return { error: "Could not get a valid rate" };
  } catch (e) {
    return { error: `Rate fetch failed: ${(e as Error).message}` };
  }
  if (Math.abs(input.entryRate - rate) / rate < 0.00005) {
    return { error: "Entry rate is the current rate — use a market order instead." };
  }

  const sl = input.stopLoss ?? null;
  const tp = input.takeProfit ?? null;
  const sltpErr = sltpError(o.direction as "LONG" | "SHORT", input.entryRate, sl, tp);
  if (sltpErr) return { error: sltpErr };

  const { error } = await supabase
    .from("fx_orders")
    .update({
      entry_rate: input.entryRate,
      trigger_when: input.entryRate < rate ? "AT_OR_BELOW" : "AT_OR_ABOVE",
      stop_loss: sl,
      take_profit: tp,
    })
    .eq("id", input.orderId)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}

// Forex: fill a pending entry order IF the live rate still satisfies its trigger
// (used by the live page check; the cron does the same with the admin client).
export async function fillFxOrderAction(
  orderId: string,
  accountId: string
): Promise<{ filled: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("fx_orders")
    .select("*")
    .eq("id", orderId)
    .eq("status", "pending")
    .single();
  if (!o) return { filled: false };

  if (o.expires_at && new Date(o.expires_at).getTime() <= Date.now()) {
    await supabase.from("fx_orders").update({ status: "expired" }).eq("id", orderId).eq("status", "pending");
    revalidatePath(`/dashboard/${accountId}`);
    return { filled: false };
  }

  let rate: number;
  try {
    rate = (await getQuote(o.symbol)).price;
    if (!rate || rate <= 0) return { filled: false };
  } catch {
    return { filled: false };
  }
  const meets =
    o.trigger_when === "AT_OR_BELOW" ? rate <= Number(o.entry_rate) : rate >= Number(o.entry_rate);
  if (!meets) return { filled: false };

  // CLAIM the order atomically BEFORE opening, so the cron and this path can't
  // both open a position for the same order.
  const { data: claimed } = await supabase
    .from("fx_orders")
    .update({ status: "filled", filled_at: new Date().toISOString(), filled_rate: rate })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return { filled: false };

  const { data: acct } = await supabase
    .from("accounts")
    .select("leverage")
    .eq("id", o.account_id)
    .single();

  const { error } = await supabase.rpc("fx_open", {
    p_account_id: o.account_id,
    p_symbol: o.symbol,
    p_direction: o.direction,
    p_units: Number(o.units),
    p_rate: rate,
    p_margin: marginFor(Number(o.units), rate, (acct as { leverage?: number } | null)?.leverage, o.symbol),
    p_stop_loss: o.stop_loss,
    p_take_profit: o.take_profit,
  });
  if (error) {
    // Can't open (insufficient margin, or SL/TP invalidated by a gap) — cancel.
    await supabase.from("fx_orders").update({ status: "canceled" }).eq("id", orderId);
    revalidatePath(`/dashboard/${accountId}`);
    return { filled: false, error: error.message };
  }
  revalidatePath(`/dashboard/${accountId}`);
  return { filled: true };
}

// Forex: set or clear stop-loss / take-profit on an open position.
export async function setFxSlTpAction(input: {
  positionId: string;
  accountId: string;
  stopLoss: number | null;
  takeProfit: number | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: pos } = await supabase
    .from("fx_positions")
    .select("symbol, direction")
    .eq("id", input.positionId)
    .eq("status", "open")
    .single();
  if (!pos) return { error: "Position not found" };

  let rate: number;
  try {
    rate = (await getQuote(pos.symbol)).price;
    if (!rate || rate <= 0) return { error: "Could not get a valid rate" };
  } catch (e) {
    return { error: `Rate fetch failed: ${(e as Error).message}` };
  }
  const err = sltpError(pos.direction as "LONG" | "SHORT", rate, input.stopLoss, input.takeProfit);
  if (err) return { error: err };

  const { error } = await supabase.rpc("fx_set_sltp", {
    p_position_id: input.positionId,
    p_rate: rate,
    p_stop_loss: input.stopLoss,
    p_take_profit: input.takeProfit,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}

// Forex: auto-close an open position if stop-out / SL / TP currently holds.
// The reason is re-derived server-side from a fresh rate — never trusted from
// the client, and the RPC's status='open' guard makes double-fires harmless.
export async function autoCloseFxPositionAction(
  positionId: string,
  accountId: string
): Promise<{ closed: boolean; reason?: string }> {
  const supabase = await createClient();
  const { data: pos } = await supabase
    .from("fx_positions")
    .select("symbol, direction, units, open_rate, margin, stop_loss, take_profit")
    .eq("id", positionId)
    .eq("status", "open")
    .single();
  if (!pos) return { closed: false };

  let rate: number;
  try {
    rate = (await getQuote(pos.symbol)).price;
    if (!rate || rate <= 0) return { closed: false };
  } catch {
    return { closed: false };
  }
  const reason = autoCloseReason(pos as Parameters<typeof autoCloseReason>[0], rate);
  if (!reason) return { closed: false };

  const { error } = await supabase.rpc("fx_close", {
    p_position_id: positionId,
    p_rate: rate,
    p_reason: reason,
  });
  if (error) return { closed: false };
  revalidatePath(`/dashboard/${accountId}`);
  return { closed: true, reason };
}

// Forex: set scaled take-profit levels on a position. levels = [{price, units}].
// Validation (profit-side, total <= position size) happens in the RPC.
export async function setFxTakeProfitLevelsAction(input: {
  positionId: string;
  accountId: string;
  levels: { price: number; units: number }[];
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fx_set_tp_levels", {
    p_position_id: input.positionId,
    p_levels: input.levels,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}

// Forex: fill any triggered TP levels on a position (live page check; cron does
// the same when the page is closed). Rate is re-derived server-side; each level
// is claimed atomically so the two paths can't double-close.
export async function fillFxTpLevelsAction(
  positionId: string,
  accountId: string
): Promise<{ filled: number }> {
  const supabase = await createClient();
  const { data: pos } = await supabase
    .from("fx_positions")
    .select("symbol, direction")
    .eq("id", positionId)
    .eq("status", "open")
    .single();
  if (!pos) return { filled: 0 };

  const { data: levels } = await supabase
    .from("fx_tp_levels")
    .select("id, price, close_units")
    .eq("position_id", positionId)
    .eq("status", "pending");
  if (!levels || levels.length === 0) return { filled: 0 };

  let rate: number;
  try {
    rate = (await getQuote(pos.symbol)).price;
    if (!rate || rate <= 0) return { filled: 0 };
  } catch {
    return { filled: 0 };
  }

  const isLong = pos.direction === "LONG";
  const triggered = levels
    .filter((l) => (isLong ? rate >= Number(l.price) : rate <= Number(l.price)))
    .sort((a, b) => (isLong ? Number(a.price) - Number(b.price) : Number(b.price) - Number(a.price)));

  let filled = 0;
  for (const l of triggered) {
    const { data: claimed } = await supabase
      .from("fx_tp_levels")
      .update({ status: "filled", filled_at: new Date().toISOString() })
      .eq("id", l.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    const { error } = await supabase.rpc("fx_close_partial", {
      p_position_id: positionId,
      p_close_units: Number(l.close_units),
      p_rate: rate,
      p_reason: "tp",
    });
    if (!error) filled++;
  }
  if (filled > 0) revalidatePath(`/dashboard/${accountId}`);
  return { filled };
}

// Web-push subscriptions (one per device/browser).
export async function savePushSubscriptionAction(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { onConflict: "endpoint" }
    );
  if (error) return { error: error.message };
  return {};
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return {};
}

// Trade journal: record the WHY behind a trade.
export async function createJournalEntryAction(input: {
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  note: string;
}): Promise<{ error?: string }> {
  const note = input.note.trim();
  if (!note) return {};
  if (note.length > 2000) return { error: "Note is too long" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("journal_entries").insert({
    user_id: user.id,
    account_id: input.accountId,
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    note,
  });
  if (error) return { error: error.message };
  return {};
}

// AI coach: Claude reviews the user's journaled reasoning against outcomes.
export async function reviewJournalAction(): Promise<{ review?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "ANTHROPIC_API_KEY is not configured on the server." };
  }

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("symbol, side, quantity, price, note, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!entries?.length) {
    return { error: "No journal entries yet — add a note the next time you trade." };
  }

  // Per-user guardrail: a daily quota + skip if nothing changed since the last
  // review. Protects the shared API budget from one user spamming the button.
  // Best-effort: if the ai_reviews table isn't migrated yet, reviews stay open.
  const DAILY_LIMIT = 5;
  const newestEntryAt = entries[0].created_at;
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("ai_reviews")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfDay.toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) {
      return { error: `You've used all ${DAILY_LIMIT} AI reviews for today. They reset at midnight UTC.` };
    }
    const { data: last } = await supabase
      .from("ai_reviews")
      .select("last_entry_at")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastEntryAt = last?.[0]?.last_entry_at;
    if (lastEntryAt && new Date(newestEntryAt).getTime() <= new Date(lastEntryAt).getTime()) {
      return {
        error: "No new journaled trades since your last review. Add a note on your next trade, then review again.",
      };
    }
  } catch {
    // ai_reviews table not migrated — proceed without the quota
  }

  // Current prices so Claude can judge how each thesis is playing out.
  const symbols = Array.from(new Set(entries.map((e) => e.symbol.toUpperCase())));
  let quotes: Record<string, { price: number }> = {};
  try {
    quotes = await getQuotes(symbols);
  } catch {
    // proceed without live prices
  }

  const rows = entries.map((e) => ({
    date: e.created_at.slice(0, 10),
    side: e.side,
    symbol: e.symbol,
    quantity: Number(e.quantity),
    price_at_trade: Number(e.price),
    price_now: quotes[e.symbol.toUpperCase()]?.price ?? null,
    reasoning: e.note,
  }));

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system:
        "You are a trading coach reviewing a paper-trading student's journal. Each entry has the trade, the student's stated reasoning, and how the price has moved since. Evaluate the QUALITY OF REASONING, not just outcomes (good reasoning can lose; bad reasoning can win). Identify patterns across entries: which kinds of theses work for them, recurring mistakes (FOMO, no exit plan, vague theses), and one concrete habit to practice next. Be direct, specific, and encouraging. Reference their actual trades. Respond in concise markdown, under 400 words. This is paper trading practice — no real-money disclaimers needed.",
      messages: [
        {
          role: "user",
          content: `Here is my trade journal (newest first):\n\n${JSON.stringify(rows, null, 2)}\n\nReview my trading reasoning.`,
        },
      ],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    // Record usage (drives the daily quota + dedup). Best-effort.
    try {
      await supabase.from("ai_reviews").insert({ user_id: user.id, last_entry_at: newestEntryAt });
    } catch {
      // ignore if the table isn't migrated
    }
    return { review: text || "(empty review)" };
  } catch (e) {
    return { error: `AI review failed: ${(e as Error).message}` };
  }
}

// Personal API tokens for the Claude/MCP integration. The plaintext token is
// returned ONCE at creation; only its SHA-256 hash is stored.
export async function createApiTokenAction(
  name: string
): Promise<{ token?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const trimmed = name.trim() || "Claude";
  if (trimmed.length > 60) return { error: "Name is too long" };

  const { randomBytes, createHash } = await import("node:crypto");
  const token = `pk_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await supabase.from("api_tokens").insert({
    user_id: user.id,
    name: trimmed,
    token_hash: tokenHash,
  });
  if (error) return { error: error.message };
  return { token };
}

export async function listApiTokensAction(): Promise<{
  tokens?: { id: string; name: string; created_at: string; last_used_at: string | null }[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, name, created_at, last_used_at")
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  return { tokens: data ?? [] };
}

export async function revokeApiTokenAction(tokenId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("api_tokens").delete().eq("id", tokenId);
  if (error) return { error: error.message };
  return {};
}

// Account management.
// Forex: change an account's leverage. Affects NEW positions only — open
// positions keep the margin they already reserved.
export async function setAccountLeverageAction(
  accountId: string,
  leverage: number
): Promise<{ error?: string }> {
  if (!leverage || leverage < 1 || leverage > 1000) return { error: "Invalid leverage" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ leverage: Math.round(leverage) })
    .eq("id", accountId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${accountId}`);
  return {};
}

export async function renameAccountAction(accountId: string, name: string): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a name" };
  if (trimmed.length > 60) return { error: "Name is too long" };
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({ name: trimmed }).eq("id", accountId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${accountId}`);
  revalidatePath("/dashboard");
  return {};
}

// Permanently deletes the account; positions, transactions, watchlist, orders,
// and snapshots cascade in the database.
export async function deleteAccountAction(accountId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", accountId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

// Price alerts (per user, not per account).
export async function createAlertAction(input: {
  symbol: string;
  condition: "ABOVE" | "BELOW";
  targetPrice: number;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.targetPrice || input.targetPrice <= 0) return { error: "Enter a valid target price" };
  const { error } = await supabase.from("alerts").insert({
    user_id: user.id,
    symbol: input.symbol.toUpperCase(),
    condition: input.condition,
    target_price: input.targetPrice,
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

export async function deleteAlertAction(alertId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("alerts").delete().eq("id", alertId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

export async function addToWatchlistAction(accountId: string, symbol: string) {
  const supabase = await createClient();
  const typeErr = await checkAccountAsset(supabase, accountId, symbol);
  if (typeErr) return { error: typeErr };
  const { error } = await supabase
    .from("watchlist")
    .insert({ account_id: accountId, symbol: symbol.toUpperCase() });
  // Ignore duplicate-key errors (already on the list).
  if (error && !error.message.includes("duplicate")) return { error: error.message };
  revalidatePath(`/dashboard/${accountId}`);
  return {};
}

export async function removeFromWatchlistAction(accountId: string, symbol: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("account_id", accountId)
    .eq("symbol", symbol.toUpperCase());
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${accountId}`);
  return {};
}

export async function adjustCashAction(input: {
  accountId: string;
  mode: "DEPOSIT" | "RESET";
  amount: number;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_cash", {
    p_account_id: input.accountId,
    p_mode: input.mode,
    p_amount: input.amount || 0,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}
