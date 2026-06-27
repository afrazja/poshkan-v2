import { createClient } from "@/lib/supabase/server";
import { getQuotes } from "@/lib/marketdata";
import AccountsGrid from "@/components/accounts/AccountsGrid";
import AlertsCard from "@/components/accounts/AlertsCard";
import GettingStarted from "@/components/accounts/GettingStarted";
import WelcomeHero from "@/components/accounts/WelcomeHero";
import type { Account, Position, Alert, Quote } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: positions } = await supabase
    .from("positions")
    .select("account_id, symbol, quantity, avg_cost");

  // Open forex margin counts toward a forex account's value.
  const { data: fxOpen } = await supabase
    .from("fx_positions")
    .select("account_id, margin")
    .eq("status", "open");

  // Price alerts (table may not exist until upgrades.sql is run — degrades to none).
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });

  // Getting-started checklist flags (each query is a cheap existence check).
  const [{ data: anyTrade }, { data: anyJournal }, { data: anyReview }] = await Promise.all([
    supabase.from("transactions").select("id").in("side", ["BUY", "SELL"]).limit(1),
    supabase.from("journal_entries").select("id").limit(1),
    supabase.from("ai_reviews").select("id").limit(1),
  ]);
  const checks = {
    hasAccount: (accounts?.length ?? 0) > 0,
    hasTrade: (anyTrade?.length ?? 0) > 0,
    hasJournal: (anyJournal?.length ?? 0) > 0,
    hasAlert: (alerts?.length ?? 0) > 0,
    hasAiReview: (anyReview?.length ?? 0) > 0,
  };

  // Live market value per account (batched quotes, server-side cache).
  const posRows = (positions ?? []) as Pick<Position, "account_id" | "symbol" | "quantity" | "avg_cost">[];
  let quotes: Record<string, Quote> = {};
  const symbols = Array.from(new Set(posRows.map((p) => p.symbol.toUpperCase())));
  if (symbols.length) {
    try {
      quotes = await getQuotes(symbols);
    } catch {
      // quotes unavailable — fall back to cost basis below
    }
  }

  const summary: Record<string, { marketValue: number; holdings: number }> = {};
  for (const p of posRows) {
    const s = (summary[p.account_id] ??= { marketValue: 0, holdings: 0 });
    const q = quotes[p.symbol.toUpperCase()];
    s.marketValue += Number(p.quantity) * (q?.price ?? Number(p.avg_cost));
    s.holdings += 1;
  }
  for (const f of fxOpen ?? []) {
    const s = (summary[f.account_id] ??= { marketValue: 0, holdings: 0 });
    s.marketValue += Number(f.margin);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Your accounts</h1>
        <p className="text-sm text-muted">
          Each account is an independent paper-trading portfolio.
        </p>
      </div>
      {checks.hasAccount ? <GettingStarted checks={checks} /> : <WelcomeHero />}
      <AlertsCard alerts={(alerts ?? []) as Alert[]} />
      <AccountsGrid accounts={(accounts ?? []) as Account[]} summary={summary} />
    </div>
  );
}
