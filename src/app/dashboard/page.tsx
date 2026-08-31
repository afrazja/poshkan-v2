import { createClient } from "@/lib/supabase/server";
import { getQuotes } from "@/lib/marketdata";
import { realizedPnl } from "@/lib/pnl";
import { floatingPnl } from "@/lib/forex";
import AccountsGrid from "@/components/accounts/AccountsGrid";
import { MARKET_GROUPS } from "@/components/accounts/nocturne";
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
  // Anything actually running: a live custom strategy, or the AI scanner flag
  // on the account itself (RLS scopes both to the owner).
  const { data: liveStrategies } = await supabase
    .from("custom_strategies")
    .select("id")
    .eq("status", "live")
    .limit(1);
  const checks = {
    hasAccount: (accounts?.length ?? 0) > 0,
    hasTrade: (anyTrade?.length ?? 0) > 0,
    hasScanner:
      (liveStrategies?.length ?? 0) > 0 ||
      ((accounts ?? []) as Array<{ auto_trade_enabled?: boolean | null }>).some((a) => !!a.auto_trade_enabled),
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

  type Sum = {
    marketValue: number;
    holdings: number;
    fxOpen: number; // open leveraged/forex positions — not spot, but still "in the market"
    unrealized: number;
    realized: number;
    todayPnl: number;
    prevValue: number; // spot holdings valued at yesterday's close, for today's %
  };
  const summary: Record<string, Sum> = {};
  const ensure = (id: string): Sum =>
    (summary[id] ??= { marketValue: 0, holdings: 0, fxOpen: 0, unrealized: 0, realized: 0, todayPnl: 0, prevValue: 0 });

  // Spot holdings: market value + unrealized P&L vs average cost + today's move.
  for (const p of posRows) {
    const s = ensure(p.account_id);
    const q = quotes[p.symbol.toUpperCase()];
    const price = q?.price ?? Number(p.avg_cost);
    s.marketValue += Number(p.quantity) * price;
    s.unrealized += Number(p.quantity) * (price - Number(p.avg_cost));
    s.holdings += 1;
    if (q?.price && q.previousClose) {
      s.todayPnl += Number(p.quantity) * (q.price - q.previousClose);
      s.prevValue += Number(p.quantity) * q.previousClose;
    }
  }

  // Leveraged/forex: open → margin (value) + floating P&L; closed → realized P&L.
  for (const f of fxOpenRows) {
    const s = ensure(f.account_id);
    s.marketValue += Number(f.margin);
    s.fxOpen += 1;
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

  // Portfolio band totals, reduced here so the client component only renders
  // them. "Cash available" is the money NOT in the market — the dollar figure
  // and its share of the portfolio, not the deployed inverse.
  const accountRows = (accounts ?? []) as Account[];
  const band = accountRows.reduce(
    (b, a) => {
      const s = summary[a.id];
      const open = (s?.holdings ?? 0) + (s?.fxOpen ?? 0);
      b.totalValue += Number(a.cash_balance) + (s?.marketValue ?? 0);
      b.cashAvailable += Number(a.cash_balance);
      b.todayPnl += s?.todayPnl ?? 0;
      b.prevValue += s?.prevValue ?? 0;
      b.unrealized += s?.unrealized ?? 0;
      b.realized += s?.realized ?? 0;
      b.openPositions += open;
      if (open > 0) b.activeAccounts += 1;
      return b;
    },
    {
      totalValue: 0,
      cashAvailable: 0,
      todayPnl: 0,
      prevValue: 0,
      unrealized: 0,
      realized: 0,
      openPositions: 0,
      totalAccounts: accountRows.length,
      activeAccounts: 0,
    }
  );

  // Stocks, then Crypto, then Forex — each with its members and subtotal.
  // Market order is the page's only ordering, so nothing is left to sort
  // client-side. The trailing bucket catches any account whose type falls
  // outside the three known markets, so it can never silently vanish.
  const valueOf = (a: Account) => Number(a.cash_balance) + (summary[a.id]?.marketValue ?? 0);
  const known = new Set(MARKET_GROUPS.map((g) => g.key as string));
  const groups = [
    ...MARKET_GROUPS.map((g) => ({
      key: g.key as string,
      label: g.label,
      members: accountRows.filter((a) => a.type === g.key),
    })),
    { key: "other", label: "Other", members: accountRows.filter((a) => !known.has(a.type)) },
  ]
    .filter((g) => g.members.length > 0)
    .map((g) => ({
      key: g.key,
      label: g.label,
      ids: g.members.map((a) => a.id),
      subtotal: g.members.reduce((sum, a) => sum + valueOf(a), 0),
    }));

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
      <AccountsGrid accounts={accountRows} summary={summary} band={band} groups={groups} />
    </div>
  );
}
