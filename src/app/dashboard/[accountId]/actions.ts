"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getQuote } from "@/lib/marketdata";
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
}): Promise<{ rate?: number; margin?: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.units || input.units <= 0) return { error: "Units must be positive" };

  const { data: account } = await supabase
    .from("accounts")
    .select("type")
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

  const margin = marginFor(input.units, rate);
  const { error } = await supabase.rpc("fx_open", {
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
  expiresHours?: number | null; // null = GTC
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
    expires_at: input.expiresHours
      ? new Date(Date.now() + input.expiresHours * 3_600_000).toISOString()
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

  const { error } = await supabase.rpc("fx_open", {
    p_account_id: o.account_id,
    p_symbol: o.symbol,
    p_direction: o.direction,
    p_units: Number(o.units),
    p_rate: rate,
    p_margin: marginFor(Number(o.units), rate),
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

// Account management.
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
