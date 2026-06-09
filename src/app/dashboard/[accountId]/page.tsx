import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountView from "@/components/account/AccountView";
import type { Account, Position, WatchlistItem, Transaction, Order } from "@/lib/types";

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

  return (
    <AccountView
      account={account as Account}
      initialPositions={(positions ?? []) as Position[]}
      initialWatchlist={(watchlist ?? []) as WatchlistItem[]}
      initialTransactions={(transactions ?? []) as Transaction[]}
      initialOrders={(orders ?? []) as Order[]}
    />
  );
}
