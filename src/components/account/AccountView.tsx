"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Account, Position, WatchlistItem, Transaction } from "@/lib/types";
import { useQuotes } from "@/lib/useQuotes";
import { realizedPnl } from "@/lib/pnl";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  changeColor,
} from "@/lib/format";
import SymbolSearch from "@/components/SymbolSearch";
import Modal from "@/components/Modal";
import SymbolPanel from "./SymbolPanel";
import MetricChartModal from "./MetricChartModal";
import HoldingsTable from "./HoldingsTable";
import TransactionHistory from "./TransactionHistory";
import InsightsTab from "./InsightsTab";
import WatchlistTable from "./WatchlistTable";
import TradeModal from "./TradeModal";
import CashModal from "./CashModal";
import {
  addToWatchlistAction,
  removeFromWatchlistAction,
} from "@/app/dashboard/[accountId]/actions";

type Tab = "holdings" | "watchlist" | "history" | "insights";

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
  const [tab, setTab] = useState<Tab>("holdings");
  const [filter, setFilter] = useState("");

  const positions = initialPositions;
  const watchlist = initialWatchlist;
  const transactions = initialTransactions;

  // Symbols to keep priced live.
  const symbols = useMemo(() => {
    const s = new Set<string>();
    positions.forEach((p) => s.add(p.symbol.toUpperCase()));
    watchlist.forEach((w) => s.add(w.symbol.toUpperCase()));
    if (selected) s.add(selected.symbol.toUpperCase());
    if (tab === "insights") s.add("SPY"); // benchmark
    return Array.from(s);
  }, [positions, watchlist, selected, tab]);

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
  const realized = useMemo(() => realizedPnl(transactions), [transactions]);

  const todayPnl = positions.reduce((sum, p) => {
    const q = quotes[p.symbol.toUpperCase()];
    if (!q) return sum;
    return sum + Number(p.quantity) * (q.price - q.previousClose);
  }, 0);
  const prevHoldingsValue = positions.reduce((sum, p) => {
    const q = quotes[p.symbol.toUpperCase()];
    return sum + Number(p.quantity) * (q?.previousClose ?? Number(p.avg_cost));
  }, 0);
  const todayPnlPct = prevHoldingsValue > 0 ? (todayPnl / prevHoldingsValue) * 100 : 0;

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

  // Selecting a symbol (from search results or a table row) opens its detail popup.
  function selectSymbol(symbol: string, name?: string) {
    setSelected({ symbol, name: name ?? symbol });
  }

  const selectedQuote = selected ? quotes[selected.symbol.toUpperCase()] : undefined;
  const tradePrice = trade ? quotes[trade.symbol.toUpperCase()]?.price ?? 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="text-muted hover:text-foreground hover:underline">
            All accounts
          </Link>
          <span className="text-muted">/</span>
          <span className="font-semibold text-foreground">{account.name}</span>
        </nav>
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

      {/* Portfolio summary (always visible) */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-3xl font-bold">{formatCurrency(totalValue)}</div>
            <div className="text-xs capitalize text-muted">{account.type} account · total value</div>
          </div>
          <div className={`text-sm font-medium ${changeColor(todayPnl)}`}>
            {formatSignedCurrency(todayPnl)} ({formatPercent(todayPnlPct)}) today
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Buying power" value={formatCurrency(cash)} />
          <Stat
            label="Holdings value"
            value={formatCurrency(holdingsValue)}
            onChart={positions.length ? () => setMetricChart("holdings") : undefined}
          />
          <Stat
            label="Unrealized P&L"
            value={`${formatSignedCurrency(totalPnl)} (${formatPercent(totalPnlPct)})`}
            colorClass={changeColor(totalPnl)}
            onChart={positions.length ? () => setMetricChart("pnl") : undefined}
          />
          <Stat
            label="Realized P&L"
            value={formatSignedCurrency(realized)}
            colorClass={changeColor(realized)}
          />
        </div>
      </div>

      {/* Search (always available) */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <SymbolSearch
          size="lg"
          placeholder="Search a stock to buy, sell, or watch — e.g. AAPL, Tesla, NVDA"
          onSelect={(r) => selectSymbol(r.symbol, r.name)}
        />
      </div>

      {/* Selected symbol detail popup */}
      {selected && (
        <Modal title={selected.symbol} onClose={() => setSelected(null)} wide>
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
        </Modal>
      )}

      {/* Holdings / Watchlist / History tabs */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {(
              [
                { key: "holdings", label: "Holdings", count: positions.length },
                { key: "watchlist", label: "Watchlist", count: watchlist.length },
                { key: "history", label: "History", count: transactions.length },
                { key: "insights", label: "Insights" },
              ] as { key: Tab; label: string; count?: number }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setFilter("");
                }}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>

          {/* Small filter for the current table (not on Insights) */}
          {tab !== "insights" && (
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="M14 14l4 4" />
              </svg>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter symbol…"
                className="w-40 rounded-lg border border-border bg-input py-1.5 pl-8 pr-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
        </div>

        {tab === "holdings" && (
          <HoldingsTable
            positions={positions.filter((p) => p.symbol.toLowerCase().includes(filter.toLowerCase()))}
            quotes={quotes}
            onSelect={selectSymbol}
          />
        )}

        {tab === "watchlist" && (
          <WatchlistTable
            items={watchlist.filter((w) => w.symbol.toLowerCase().includes(filter.toLowerCase()))}
            quotes={quotes}
            onSelect={selectSymbol}
            onRemove={(symbol) => toggleWatch(symbol)}
          />
        )}

        {tab === "history" && (
          <TransactionHistory
            transactions={transactions.filter((t) =>
              (t.symbol ?? "").toLowerCase().includes(filter.toLowerCase())
            )}
          />
        )}

        {tab === "insights" && (
          <InsightsTab
            positions={positions}
            quotes={quotes}
            cash={cash}
            todayPnlPct={todayPnlPct}
            onSelect={(symbol) => selectSymbol(symbol)}
          />
        )}
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
