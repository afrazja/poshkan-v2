"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Account, Position, WatchlistItem, Transaction, Order, FxPosition, FxOrder } from "@/lib/types";
import { FX_PAIRS, floatingPnl } from "@/lib/forex";
import ForexPanel from "./ForexPanel";
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
  cancelOrderAction,
  fillLimitOrderAction,
  renameAccountAction,
  deleteAccountAction,
} from "@/app/dashboard/[accountId]/actions";
import { formatNumber } from "@/lib/format";

type Tab = "holdings" | "watchlist" | "history" | "insights";

export default function AccountView({
  account,
  initialPositions,
  initialWatchlist,
  initialTransactions,
  initialOrders,
  initialFxPositions = [],
  initialFxOrders = [],
}: {
  account: Account;
  initialPositions: Position[];
  initialWatchlist: WatchlistItem[];
  initialTransactions: Transaction[];
  initialOrders: Order[];
  initialFxPositions?: FxPosition[];
  initialFxOrders?: FxOrder[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [trade, setTrade] = useState<{ side: "BUY" | "SELL"; symbol: string } | null>(null);
  const [cashModal, setCashModal] = useState<"DEPOSIT" | "RESET" | null>(null);
  const [manageModal, setManageModal] = useState<"rename" | "delete" | null>(null);
  const [renameValue, setRenameValue] = useState(account.name);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageBusy, setManageBusy] = useState(false);
  const [metricChart, setMetricChart] = useState<"holdings" | "pnl" | null>(null);
  const [tab, setTab] = useState<Tab>("holdings");

  // Restore the last tab the user had open on this account.
  useEffect(() => {
    const saved = localStorage.getItem(`poshkan-tab-${account.id}`);
    if (saved === "holdings" || saved === "watchlist" || saved === "history" || saved === "insights") {
      setTab(saved);
    }
  }, [account.id]);
  const [filter, setFilter] = useState("");

  const positions = initialPositions;
  const watchlist = initialWatchlist;
  const transactions = initialTransactions;
  const orders = initialOrders;
  const fxPositions = initialFxPositions;
  const isForex = account.type === "forex";

  // Symbols to keep priced live.
  const symbols = useMemo(() => {
    const s = new Set<string>();
    if (isForex) {
      FX_PAIRS.forEach((p) => s.add(p.symbol));
      fxPositions.filter((p) => p.status === "open").forEach((p) => s.add(p.symbol.toUpperCase()));
      return Array.from(s);
    }
    positions.forEach((p) => s.add(p.symbol.toUpperCase()));
    watchlist.forEach((w) => s.add(w.symbol.toUpperCase()));
    orders.forEach((o) => s.add(o.symbol.toUpperCase()));
    if (selected) s.add(selected.symbol.toUpperCase());
    if (tab === "insights") s.add("SPY"); // benchmark
    return Array.from(s);
  }, [positions, watchlist, orders, selected, tab, isForex, fxPositions]);

  const { data: quotes = {} } = useQuotes(symbols);

  // Auto-fill pending limit orders when the live price crosses the limit.
  // (Runs while the account page is open; a guard prevents double-firing.)
  const fillingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const o of orders) {
      const q = quotes[o.symbol.toUpperCase()];
      if (!q) continue;
      const meets =
        o.side === "BUY" ? q.price <= Number(o.limit_price) : q.price >= Number(o.limit_price);
      if (meets && !fillingRef.current.has(o.id)) {
        fillingRef.current.add(o.id);
        // Only refresh when the server actually filled — refreshing on a declined
        // fill (stale client quote) would re-run this effect in a tight loop.
        fillLimitOrderAction(o.id)
          .then((r) => {
            if (r.filled || r.error) router.refresh();
            else fillingRef.current.delete(o.id);
          })
          .catch(() => fillingRef.current.delete(o.id));
      }
    }
  }, [orders, quotes, router]);

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

  // Forex aggregates (equity = free cash + margin in use + floating P&L).
  const fxOpen = fxPositions.filter((p) => p.status === "open");
  const fxMargin = fxOpen.reduce((s, p) => s + Number(p.margin), 0);
  const fxFloating = fxOpen.reduce((s, p) => {
    const q = quotes[p.symbol.toUpperCase()];
    return s + (q ? floatingPnl(p.direction, Number(p.units), Number(p.open_rate), q.price, p.symbol) : 0);
  }, 0);
  const fxRealized = fxPositions
    .filter((p) => p.status !== "open")
    .reduce((s, p) => s + Number(p.pnl ?? 0), 0);
  const fxEquity = cash + fxMargin + fxFloating;

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

  const [watchBusy, setWatchBusy] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  async function toggleWatch(symbol: string) {
    setWatchBusy(symbol);
    if (inWatchlist(symbol)) {
      await removeFromWatchlistAction(account.id, symbol);
    } else {
      await addToWatchlistAction(account.id, symbol);
    }
    router.refresh();
    setWatchBusy(null);
  }

  // Selecting a symbol (from search results or a table row) opens its detail popup.
  function selectSymbol(symbol: string, name?: string) {
    setSelected({ symbol, name: name ?? symbol });
  }

  async function cancelOrder(id: string) {
    setCanceling(id);
    await cancelOrderAction(id, account.id);
    router.refresh();
  }

  async function doRename() {
    setManageError(null);
    setManageBusy(true);
    const res = await renameAccountAction(account.id, renameValue);
    setManageBusy(false);
    if (res.error) return setManageError(res.error);
    setManageModal(null);
    router.refresh();
  }

  async function doDelete() {
    setManageError(null);
    setManageBusy(true);
    const res = await deleteAccountAction(account.id);
    setManageBusy(false);
    if (res.error) return setManageError(res.error);
    router.push("/dashboard");
    router.refresh();
  }

  // Download the current tab's table (holdings, watchlist, or history) as CSV.
  function exportCsv() {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    let header: string;
    let lines: string[];
    let suffix: string;

    if (tab === "holdings") {
      header = "symbol,shares,avg_cost,current_price,day_change_pct,market_value,unrealized_pnl,unrealized_pnl_pct";
      lines = positions.map((p) => {
        const q = quotes[p.symbol.toUpperCase()];
        const qty = Number(p.quantity);
        const avg = Number(p.avg_cost);
        const price = q?.price ?? avg;
        const mktValue = qty * price;
        const pnl = mktValue - qty * avg;
        const pnlPct = avg > 0 ? ((price - avg) / avg) * 100 : 0;
        return [
          p.symbol, qty, avg.toFixed(4), price.toFixed(4),
          (q?.percentChange ?? 0).toFixed(2), mktValue.toFixed(2), pnl.toFixed(2), pnlPct.toFixed(2),
        ].map(esc).join(",");
      });
      suffix = "holdings";
    } else if (tab === "watchlist") {
      header = "symbol,current_price,day_change_pct";
      lines = watchlist.map((w) => {
        const q = quotes[w.symbol.toUpperCase()];
        return [w.symbol, q ? q.price.toFixed(4) : "", (q?.percentChange ?? 0).toFixed(2)]
          .map(esc).join(",");
      });
      suffix = "watchlist";
    } else {
      header = "date,action,symbol,quantity,price,cash_change";
      lines = transactions.map((t) =>
        [t.created_at, t.side, t.symbol ?? "", t.quantity, t.price, t.cash_delta].map(esc).join(",")
      );
      suffix = "history";
    }

    const blob = new Blob([`${header}\n${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${account.name.replace(/[^a-z0-9-_ ]/gi, "")}-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const exportableRows =
    tab === "holdings" ? positions.length : tab === "watchlist" ? watchlist.length : tab === "history" ? transactions.length : 0;

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
            onClick={() => setCashModal("RESET")}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-card"
          >
            Reset
          </button>
          <button
            onClick={() => {
              setRenameValue(account.name);
              setManageError(null);
              setManageModal("rename");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-card"
          >
            Rename
          </button>
          <button
            onClick={() => {
              setManageError(null);
              setManageModal("delete");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-card hover:text-negative"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Portfolio summary (always visible) */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-3xl font-bold">{formatCurrency(isForex ? fxEquity : totalValue)}</div>
            <div className="text-xs capitalize text-muted">
              {account.type} account · {isForex ? "equity" : "total value"}
            </div>
          </div>
          {isForex ? (
            <div className={`text-sm font-medium ${changeColor(fxFloating)}`}>
              {formatSignedCurrency(fxFloating)} floating P&L
            </div>
          ) : (
            <div className={`text-sm font-medium ${changeColor(todayPnl)}`}>
              {formatSignedCurrency(todayPnl)} ({formatPercent(todayPnlPct)}) today
            </div>
          )}
        </div>
        <div className={`mt-5 grid grid-cols-2 gap-4 ${isForex ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5"}`}>
          {isForex ? (
            <>
              <Stat label="Free cash" value={formatCurrency(cash)} onAdd={() => setCashModal("DEPOSIT")} />
              <Stat label="Margin in use" value={formatCurrency(fxMargin)} />
              <Stat
                label="Floating P&L"
                value={formatSignedCurrency(fxFloating)}
                colorClass={changeColor(fxFloating)}
              />
              <Stat
                label="Realized P&L"
                value={formatSignedCurrency(fxRealized)}
                colorClass={changeColor(fxRealized)}
              />
            </>
          ) : (
            <>
              <Stat label="Buying power" value={formatCurrency(cash)} onAdd={() => setCashModal("DEPOSIT")} />
              <Stat
                label="Holdings value"
                value={formatCurrency(holdingsValue)}
                onChart={positions.length ? () => setMetricChart("holdings") : undefined}
              />
              <Stat
                label="Today's P&L"
                value={`${formatSignedCurrency(todayPnl)} (${formatPercent(todayPnlPct)})`}
                colorClass={changeColor(todayPnl)}
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
            </>
          )}
        </div>
      </div>

      {/* Forex accounts: pair picker + leveraged positions instead of search/tabs */}
      {isForex && (
        <ForexPanel
          accountId={account.id}
          cash={cash}
          positions={fxPositions}
          quotes={quotes}
          orders={initialFxOrders}
          leverage={account.leverage}
        />
      )}

      {/* Search (always available) */}
      {!isForex && (
      <div className="rounded-2xl border border-border bg-card p-4">
        <SymbolSearch
          size="lg"
          assetType={account.type}
          placeholder={
            account.type === "crypto"
              ? "Search a cryptocurrency to buy, sell, or watch — e.g. BTC-USD, Ethereum"
              : "Search a stock to buy, sell, or watch — e.g. AAPL, Tesla, NVDA"
          }
          onSelect={(r) => selectSymbol(r.symbol, r.name)}
        />
      </div>
      )}

      {/* Selected symbol detail popup */}
      {!isForex && selected && (
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
            watchPending={watchBusy === selected.symbol}
          />
        </Modal>
      )}

      {/* Pending limit orders */}
      {!isForex && orders.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Pending limit orders</h2>
          <div className="space-y-2">
            {orders.map((o) => {
              const q = quotes[o.symbol.toUpperCase()];
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <div>
                    <span className={o.side === "BUY" ? "font-semibold text-positive" : "font-semibold text-negative"}>
                      {o.side}
                    </span>{" "}
                    <span className="font-medium">
                      {formatNumber(Number(o.quantity))} {o.symbol}
                    </span>{" "}
                    <span className="text-muted">@ {formatCurrency(Number(o.limit_price))} limit</span>
                    {q && <span className="ml-2 text-xs text-muted">now {formatCurrency(q.price)}</span>}
                  </div>
                  <button
                    onClick={() => cancelOrder(o.id)}
                    disabled={canceling === o.id}
                    className="shrink-0 text-xs text-muted hover:text-negative disabled:opacity-50"
                  >
                    {canceling === o.id ? "Cancelling…" : "Cancel"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Orders fill automatically while this account page is open.
          </p>
        </div>
      )}

      {/* Holdings / Watchlist / History tabs */}
      {!isForex && (
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
                  try {
                    localStorage.setItem(`poshkan-tab-${account.id}`, t.key);
                  } catch {}
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
            <div className="flex items-center gap-2">
              {exportableRows > 0 && (
                <button
                  onClick={exportCsv}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-card hover:text-foreground"
                >
                  ⬇ Export CSV
                </button>
              )}
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
            pendingSymbol={watchBusy}
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
            accountId={account.id}
            positions={positions}
            quotes={quotes}
            cash={cash}
            todayPnlPct={todayPnlPct}
            onSelect={(symbol) => selectSymbol(symbol)}
          />
        )}
      </section>
      )}

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
      {manageModal === "rename" && (
        <Modal title="Rename account" onClose={() => setManageModal(null)}>
          <div className="space-y-4">
            {manageError && <p className="text-sm text-negative">{manageError}</p>}
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={doRename}
              disabled={manageBusy || !renameValue.trim()}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {manageBusy ? "Saving…" : "Save name"}
            </button>
          </div>
        </Modal>
      )}
      {manageModal === "delete" && (
        <Modal title="Delete this account?" onClose={() => setManageModal(null)}>
          <div className="space-y-4">
            {manageError && <p className="text-sm text-negative">{manageError}</p>}
            <p className="text-sm">
              <strong>{account.name}</strong> and all of its holdings, watchlist, orders, and
              transaction history will be <strong className="text-negative">permanently deleted</strong>.
              This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setManageModal(null)}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-background"
              >
                Keep account
              </button>
              <button
                onClick={doDelete}
                disabled={manageBusy}
                className="flex-1 rounded-lg bg-negative py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {manageBusy ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </Modal>
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
  onAdd,
}: {
  label: string;
  value: string;
  colorClass?: string;
  onChart?: () => void;
  onAdd?: () => void;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        {onAdd && (
          <button
            onClick={onAdd}
            aria-label="Add cash"
            title="Add cash"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-sm leading-none text-muted transition hover:border-primary hover:text-primary"
          >
            +
          </button>
        )}
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
