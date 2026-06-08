import { createClient } from "@/lib/supabase/server";
import AccountsGrid from "@/components/accounts/AccountsGrid";
import type { Account, Position } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: positions } = await supabase
    .from("positions")
    .select("account_id, quantity, avg_cost");

  // Cost-basis summary per account (no API calls here — live value is in the account view).
  const summary: Record<string, { invested: number; holdings: number }> = {};
  for (const p of (positions ?? []) as Pick<Position, "account_id" | "quantity" | "avg_cost">[]) {
    const s = (summary[p.account_id] ??= { invested: 0, holdings: 0 });
    s.invested += Number(p.quantity) * Number(p.avg_cost);
    s.holdings += 1;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Your accounts</h1>
        <p className="text-sm text-muted">
          Each account is an independent paper-trading portfolio.
        </p>
      </div>
      <AccountsGrid accounts={(accounts ?? []) as Account[]} summary={summary} />
    </div>
  );
}
