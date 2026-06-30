import { createClient } from "@/lib/supabase/server";
import HistoryView from "@/components/history/HistoryView";
import type { Transaction, FxPosition } from "@/lib/types";

export const metadata = { title: "History · Poshkan" };

export default async function HistoryPage() {
  const supabase = await createClient();

  // RLS scopes every query below to the signed-in user's own accounts.
  const { data: accountsRaw } = await supabase
    .from("accounts")
    .select("id, name, type")
    .order("created_at", { ascending: true });
  const accounts = (accountsRaw ?? []) as { id: string; name: string; type: string }[];
  const ids = accounts.map((a) => a.id);

  let transactions: Transaction[] = [];
  let positions: FxPosition[] = [];
  if (ids.length) {
    const [{ data: tx }, { data: fx }] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .in("account_id", ids)
        .order("created_at", { ascending: false })
        .limit(500),
      // fx_positions powers leveraged long/short on every account type.
      supabase
        .from("fx_positions")
        .select("*")
        .in("account_id", ids)
        .order("opened_at", { ascending: false })
        .limit(500),
    ]);
    transactions = (tx ?? []) as Transaction[];
    positions = (fx ?? []) as FxPosition[];
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">
          Every trade and transaction across all your accounts, newest first.
        </p>
      </div>
      <HistoryView accounts={accounts} transactions={transactions} positions={positions} />
    </div>
  );
}
