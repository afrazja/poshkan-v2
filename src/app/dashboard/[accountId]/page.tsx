import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountView from "@/components/account/AccountView";
import { getSmcData } from "./smc-actions";
import type { Account, Position, WatchlistItem, Transaction, Order, FxPosition, FxOrder, FxTpLevel } from "@/lib/types";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (!account) notFound();

  const { data: positions } = await supabase
    .from("positions")
    .select("*")
    .eq("account_id", accountId);

  const { data: watchlist } = await supabase
    .from("watchlist")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  // Pending limit orders (table may not exist yet if orders.sql hasn't been run).
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Forex positions (table may not exist until forex.sql is run — degrades to none).
  const { data: fxPositions } = await supabase
    .from("fx_positions")
    .select("*")
    .eq("account_id", accountId)
    .order("opened_at", { ascending: false });

  const { data: fxOrders } = await supabase
    .from("fx_orders")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Pending scaled take-profit levels (table may not exist yet — degrades to none).
  const { data: fxTpLevels } = await supabase
    .from("fx_tp_levels")
    .select("id, position_id, price, close_units, status, fx_positions!inner(account_id)")
    .eq("fx_positions.account_id", accountId)
    .eq("status", "pending");

  // SMC strategy scanner — available to all users on crypto accounts (free for now).
  const smcAllowed = account.type === "crypto";
  const smc = smcAllowed ? await getSmcData(accountId) : null;

  return (
    <AccountView
      account={account as Account}
      initialPositions={(positions ?? []) as Position[]}
      initialWatchlist={(watchlist ?? []) as WatchlistItem[]}
      initialTransactions={(transactions ?? []) as Transaction[]}
      initialOrders={(orders ?? []) as Order[]}
      initialFxPositions={(fxPositions ?? []) as FxPosition[]}
      initialFxOrders={(fxOrders ?? []) as FxOrder[]}
      initialFxTpLevels={(fxTpLevels ?? []) as unknown as FxTpLevel[]}
      smcAllowed={smcAllowed}
      smcSettings={smc?.settings ?? null}
      smcSignals={smc?.signals ?? []}
    />
  );
}
