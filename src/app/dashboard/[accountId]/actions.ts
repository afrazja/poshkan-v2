"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getQuote } from "@/lib/marketdata";

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
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!input.quantity || input.quantity <= 0) return { error: "Quantity must be positive" };
  if (!input.limitPrice || input.limitPrice <= 0) return { error: "Enter a valid limit price" };

  const { error } = await supabase.from("orders").insert({
    account_id: input.accountId,
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    limit_price: input.limitPrice,
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

  const { error } = await supabase.rpc("execute_trade", {
    p_account_id: order.account_id,
    p_symbol: order.symbol,
    p_side: order.side,
    p_quantity: order.quantity,
    p_price: price,
  });
  if (error) {
    // Couldn't fill (e.g. insufficient cash/shares) — cancel so it stops retrying.
    await supabase.from("orders").update({ status: "canceled" }).eq("id", orderId).eq("status", "pending");
    revalidatePath(`/dashboard/${order.account_id}`);
    return { filled: false, error: error.message };
  }
  await supabase
    .from("orders")
    .update({ status: "filled", filled_at: new Date().toISOString(), filled_price: price })
    .eq("id", orderId)
    .eq("status", "pending");
  revalidatePath(`/dashboard/${order.account_id}`);
  return { filled: true, price };
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
