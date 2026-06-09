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
