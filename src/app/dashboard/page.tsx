import { createClient } from "@/lib/supabase/server";
import { getQuotes } from "@/lib/marketdata";
import { realizedPnl } from "@/lib/pnl";
import { floatingPnl } from "@/lib/forex";
import AccountsGrid from "@/components/accounts/AccountsGrid";
import AlertsCard from "@/components/accounts/AlertsCard";
import GettingStarted from "@/components/accounts/GettingStarted";
import WelcomeHero from "@/components/accounts/WelcomeHero";
import type { Account, Position, Alert, Quote, Transaction } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: positions } = await supabase
    .from("positions")
    .select("account_id, symbol, quantity, avg_cost");

  // Forex/leveraged positions: open → margin + floating P&L; closed → realized P&L.
  const { data: fxAll } = await supabase
    .from("fx_positions")
    .select("account_id, symbol, direction, units, open_rate, pnl, margin, status");

  // Transaction ledger → realized P&L for spot (stocks/crypto) holdings.
  const { data: txns } = await supabase
    .from("transactions")
    .select("account_id, side, symbol, quantity, price, created_at");

  // Price alerts (table may not exist until upgrades.sql is run — degrades to none).
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false });

  // Getting-started checklist flags (each query is a cheap existence check).
  const { data: anyTrade } = await supabase
    .from("transactions")
    .select("id")
    .in("side", ["BUY", "SELL"])
    .limit(1);
  const checks = {
    hasAccount: (accounts?.length ?? 0) > 0,
    hasTrade: (anyTrade?.length ?? 0) > 0,
    hasAlert: (alerts?.length ?? 0) > 0,
  };

  // Live market value per account (batched quotes, server-side cache).
  const posRows = (positions ?? []) as Pick<Position, "account_id" | "symbol" | "quantity" | "avg_cost">[];
  const fxRows = (fxAll ?? []) as Array<{
    account_id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    units: number;
    open_rate: number;
    pnl: number | null;
    margin: number;
    status: string;
  }>;
  const fxOpenRows = fxRows.filter((f) => f.status === "open");

  let quotes: Record<string, Quote> = {};
  const symbols = Array.from(
    new Set([
      ...posRows.map((p) => p.symbol.toUpperCase()),
      ...fxOpenRows.map((f) => f.symbol.toUpperCase()),
    ])
  );
  if (symbols.length) {
    try {
      quotes = await getQuotes(symbols);
    } catch {
      // quotes unavailable — fall back to cost basis below
    }
  }

  type Sum = { marketValue: number; holdings: number; unrealized: number; realized: number };
  const summary: Record<string, Sum> = {};
  const ensure = (id: string): Sum =>
    (summary[id] ??= { marketValue: 0, holdings: 0, unrealized: 0, realized: 0 });

  // Spot holdings: market value + unrealized P&L vs average cost.
  for (const p of posRows) {
    const s = ensure(p.account_id);
    const q = quotes[p.symbol.toUpperCase()];
    const price = q?.price ?? Number(p.avg_cost);
    s.marketValue += Number(p.quantity) * price;
    s.unrealized += Number(p.quantity) * (price - Number(p.avg_cost));
    s.holdings += 1;
  }

  // Leveraged/forex: open → margin (value) + floating P&L; closed → realized P&L.
  for (const f of fxOpenRows) {
    const s = ensure(f.account_id);
    s.marketValue += Number(f.margin);
    const q = quotes[f.symbol.toUpperCase()];
    if (q?.price) {
      s.unrealized += floatingPnl(f.direction, Number(f.units), Number(f.open_rate), q.price, f.symbol);
    }
  }
  for (const f of fxRows) {
    if (f.status !== "open") ensure(f.account_id).realized += Number(f.pnl ?? 0);
  }

  // Spot realized P&L reconstructed from each account's ledger.
  const txByAccount: Record<string, Transaction[]> = {};
  for (const t of (txns ?? []) as unknown as Array<Transaction & { account_id: string }>) {
    (txByAccount[t.account_id] ??= []).push(t);
  }
  for (const [id, list] of Object.entries(txByAccount)) {
    ensure(id).realized += realizedPnl(list);
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
