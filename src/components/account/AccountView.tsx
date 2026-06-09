"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Account, Position, WatchlistItem, Transaction } from "@/lib/types";
import { useQuotes } from "@/lib/useQuotes";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  changeColor,
} from "@/lib/format";
import SymbolSearch from "@/components/SymbolSearch";
import SymbolPanel from "./SymbolPanel";
import MetricChartModal from "./MetricChartModal";
import HoldingsTable from "./HoldingsTable";
import TransactionHistory from "./TransactionHistory";
import WatchlistTable from "./WatchlistTable";
import TradeModal from "./TradeModal";
import CashModal from "./CashModal";
import {
  addToWatchlistAction,
  removeFromWatchlistAction,
} from "@/app/dashboard/[accountId]/actions";

type Tab = "summary" | "holdings" | "watchlist" | "history";

export default function AccountView({
  account,
  initialPositions,
  initialWatchlist,
  initialTransactions,
}: {
  account: Account;
  initialPositions: Position[];
  initialWatchlist: WatchlistItem[];
  initialTransactions: Transaction[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [trade, setTrade] = useState<{ side: "BUY" | "SELL"; symbol: string } | null>(null);
  const [cashModal, setCashModal] = useState<"DEPOSIT" | "RESET" | null>(null);
  const [metricChart, setMetricChart] = useState<"holdings" | "pnl" | null>(null);
  const [tab, setTab] = useState<Tab>("summary");

  const positions = initialPositions;
  const watchlist = initialWatchlist;
  const transactions = initialTransactions;

  // Symbols to keep priced live.
  const symbols = useMemo(() => {
    const s = new Set<string>();
    positions.forEach((p) => s.add(p.symbol.toUpperCase()));
    watchlist.forEach((w) => s.add(w.symbol.toUpperCase()));
    if (selected) s.add(selected.symbol.toUpperCase());
    return Array.from(s);
  }, [positions, watchlist, selected]);

  const { data: quotes = {} } = useQuotes(symbols);

  // Portfolio aggregates.
  const holdingsValue = positions.reduce((sum, p) => {
    const q = quotes[p.symbol.toUpperCase()];
    return sum + Number(p.quantity) * (q?.price ?? Number(p.avg_cost));
  }, 0);
  const costBasis = positions.reduce(
    (sum, p) => sum + Number(p.quantity) * Number(p.avg_cost),
    0
  );
  const cash = Number(account.cash_balance);
  const totalValue = cash + holdingsValue;
  const totalPnl = holdingsValue - costBasis;
  const totalPnlPct = costBasis > 0 ? (totalPnl / costBasis) * 100 : 0;

  const todayPnl = positions.reduce((sum, p) => {
    const q = quotes[p.symbol.toUpperCase()];
    if (!q) return sum;
    return sum + Number(p.quantity) * (q.price - q.previousClose);
  }, 0);

  const heldFor = (symbol: string) =>
    Number(positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase())?.quantity ?? 0);
  const inWatchlist = (symbol: string) =>
    watchlist.some((w) => w.symbol.toUpperCase() === symbol.toUpperCase());

  async function toggleWatch(symbol: string) {
    if (inWatchlist(symbol)) {
      await removeFromWatchlistAction(account.id, symbol);
    } else {
      await addToWatchlistAction(account.id, symbol);
    }
    router.refresh();
  }

  const selectedQuote = selected ? quotes[selected.symbol.toUpperCase()] : undefined;
  const tradePrice = trade ? quotes[trade.symbol.toUpperCase()]?.price ?? 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground">
          ← All accounts
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setCashModal("DEPOSIT")}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-card"
          >
            Add cash
          </button>
          <button
            onClick={() => setCashModal("RESET")}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-card"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Account header (always visible) */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-border bg-card p-5">
        <div>
          <h1 className="text-xl font-bold">{account.name}</h1>
          <span className="text-xs capitalize text-muted">{account.type} account</span>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{formatCurrency(totalValue)}</div>
          <div className="text-xs text-muted">total account value</div>
        </div>
      </div>

      {/* Search (always available) */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="mb-2 block text-sm font-semibold">
          Search a stock to buy, sell, or add to your watchlist
        </label>
        <SymbolSearch
          size="lg"
          placeholder="Try a symbol or name — e.g. AAPL, Tesla, NVDA"
          onSelect={(r) => setSelected({ symbol: r.symbol, name: r.name })}
        />
      </div>

      {/* Selected symbol panel */}
      {selected && (
        <SymbolPanel
          symbol={selected.symbol}
          name={selected.name}
          liveQuote={selectedQuote}
          heldShares={heldFor(selected.symbol)}
          inWatchlist={inWatchlist(selected.symbol)}
          onBuy={() => setTrade({ side: "BUY", symbol: selected.symbol })}
          onSell={() => setTrade({ side: "SELL", symbol: selected.symbol })}
          onToggleWatch={() => toggleWatch(selected.symbol)}
        />
      )}

      {/* Summary / Holdings / Watchlist / History tabs */}
      <section>
        <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { key: "summary", label: "Summary" },
              { key: "holdings", label: "Holdings", count: positions.length },
              { key: "watchlist", label: "Watchlist", count: watchlist.length },
              { key: "history", label: "History", count: transactions.length },
            ] as { key: Tab; label: string; count?: number }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {tab === "summary" && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Buying power" value={formatCurrency(cash)} />
              <Stat
                label="Holdings value"
                value={formatCurrency(holdingsValue)}
                onChart={positions.length ? () => setMetricChart("holdings") : undefined}
              />
              <Stat
                label="Today's P&L"
                value={formatSignedCurrency(todayPnl)}
                colorClass={changeColor(todayPnl)}
              />
              <Stat
                label="Total P&L"
                value={`${formatSignedCurrency(totalPnl)} (${formatPercent(totalPnlPct)})`}
                colorClass={changeColor(totalPnl)}
                onChart={positions.length ? () => setMetricChart("pnl") : undefined}
              />
            </div>
          </div>
        )}

        {tab === "holdings" && (
          <HoldingsTable
            positions={positions}
            quotes={quotes}
            onSelect={(symbol) => setSelected({ symbol, name: symbol })}
          />
        )}

        {tab === "watchlist" && (
          <WatchlistTable
            items={watchlist}
            quotes={quotes}
            onSelect={(symbol) => setSelected({ symbol, name: symbol })}
            onRemove={(symbol) => toggleWatch(symbol)}
          />
        )}

        {tab === "history" && <TransactionHistory transactions={transactions} />}
      </section>

      {trade && (
        <TradeModal
          accountId={account.id}
          symbol={trade.symbol}
          side={trade.side}
          price={tradePrice}
          cash={cash}
          maxShares={heldFor(trade.symbol)}
          onClose={() => setTrade(null)}
        />
      )}
      {cashModal && (
        <CashModal accountId={account.id} mode={cashModal} onClose={() => setCashModal(null)} />
      )}
      {metricChart && (
        <MetricChartModal
          accountId={account.id}
          metric={metricChart}
          title={metricChart === "holdings" ? "Holdings value over time" : "Total profit / loss over time"}
          onClose={() => setMetricChart(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  colorClass,
  onChart,
}: {
  label: string;
  value: string;
  colorClass?: string;
  onChart?: () => void;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        {onChart && (
          <button
            onClick={onChart}
            aria-label={`Show ${label} chart`}
            title={`Show ${label} chart`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition hover:bg-background hover:text-primary"
          >
            <ChartGlyph />
          </button>
        )}
        <span className={`font-semibold ${colorClass ?? ""}`}>{value}</span>
      </div>
    </div>
  );
}

function ChartGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2v12h12" opacity="0.5" />
      <path d="M4.5 10.5l3-3 2.5 2 3.5-4.5" />
    </svg>
  );
}
