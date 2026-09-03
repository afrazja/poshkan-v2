"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Account, Position, WatchlistItem, Transaction, Order, FxPosition, FxOrder, FxTpLevel } from "@/lib/types";
import { FX_PAIRS, floatingPnl } from "@/lib/forex";
import ForexPanel from "./ForexPanel";
import ForexPerformance from "./ForexPerformance";
import ScannerIcon from "@/components/ScannerIcon";
import EquitySpark from "./EquitySpark";
import { TextSkeleton } from "@/components/Skeleton";
import LeveragePanel from "./LeveragePanel";
import StockShowcase from "./StockShowcase";
import TradeCoach from "./TradeCoach";
import MarketStatusBadge from "./MarketStatusBadge";
import QuoteFreshness from "./QuoteFreshness";
import { summarizeFreshness } from "@/lib/quote-freshness";
import AiScanner, { type AutoSettings } from "./AiScanner";
import { useQuotes } from "@/lib/useQuotes";
import { useSymbolSparks } from "@/lib/useSymbolSparks";
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
import ShareCardModal from "@/components/ShareCardModal";
import {
  addToWatchlistAction,
  removeFromWatchlistAction,
  cancelOrderAction,
  fillLimitOrderAction,
} from "@/app/dashboard/[accountId]/actions";
import { formatNumber } from "@/lib/format";

type Tab = "ideas" | "holdings" | "watchlist" | "history";

export default function AccountView({
  account,
  initialPositions,
  initialWatchlist,
  initialTransactions,
  initialOrders,
  initialFxPositions = [],
  initialFxOrders = [],
  initialFxTpLevels = [],
  autoSettings,
  aiInstruction = null,
}: {
  account: Account;
  initialPositions: Position[];
  initialWatchlist: WatchlistItem[];
  initialTransactions: Transaction[];
  initialOrders: Order[];
  initialFxPositions?: FxPosition[];
  initialFxOrders?: FxOrder[];
  initialFxTpLevels?: FxTpLevel[];
  autoSettings?: AutoSettings;
  aiInstruction?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [trade, setTrade] = useState<{ side: "BUY" | "SELL"; symbol: string; fromPanel?: boolean } | null>(
    null
  );
  const [cashModal, setCashModal] = useState<"DEPOSIT" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [scannerModal, setScannerModal] = useState<
    "ai" | null
  >(null);
  const aiActive = !!autoSettings?.enabled;
  const [metricChart, setMetricChart] = useState<"holdings" | "pnl" | null>(null);
  // Insights reads the portfolio as a whole, so it belongs to the summary at
  // the top rather than sitting behind a tab beside the tables.
  const [insightsOpen, setInsightsOpen] = useState(false);
  // Nothing owned yet means nothing to show on Holdings, so a new stock
  // account opens on Ideas. Computed from props, so the server and the first
  // client render agree.
  const [tab, setTab] = useState<Tab>(
    account.type === "stocks" && initialPositions.length === 0 ? "ideas" : "holdings"
  );

  // Restore the last tab the user had open on this account.
  useEffect(() => {
    const saved = localStorage.getItem(`poshkan-tab-${account.id}`);
    if (saved === "ideas" || saved === "holdings" || saved === "watchlist" || saved === "history") {
      setTab(saved);
    }
  }, [account.id]);
  // Ideas is a phone-only tab, so a wide screen must never sit on it — the
  // panel is hidden there and the tab would look empty. Runs after mount, so
  // the first render still matches what the server sent.
  useEffect(() => {
    if (tab !== "ideas") return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const snapBack = () => {
      if (wide.matches) setTab("holdings");
    };
    snapBack();
    wide.addEventListener("change", snapBack);
    return () => wide.removeEventListener("change", snapBack);
  }, [tab]);
  const [filter, setFilter] = useState("");

  const positions = initialPositions;
  const watchlist = initialWatchlist;
  const transactions = initialTransactions;
  const orders = initialOrders;
  const fxPositions = initialFxPositions;
  const isForex = account.type === "forex";
  const isStocks = account.type === "stocks";
  // An empty stock account gives the wide column to the showcase: there is no
  // portfolio to read yet. It hands the width back the moment one is bought,
  // because an eight-column holdings table is unreadable at a third of the page.
  const leadWithIdeas = isStocks && positions.length === 0;

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
    fxPositions.filter((p) => p.status === "open").forEach((p) => s.add(p.symbol.toUpperCase()));
    if (selected) s.add(selected.symbol.toUpperCase());
    if (insightsOpen) s.add("SPY"); // benchmark
    return Array.from(s);
  }, [positions, watchlist, orders, selected, insightsOpen, isForex, fxPositions]);

  const { data: quotes = {}, isPending: quotesPending } = useQuotes(symbols);
  // Row sparklines for holdings + watchlist (skip on forex — pairs use the panel).
  const sparkSymbols = useMemo(
    () => (isForex ? [] : [...positions.map((p) => p.symbol), ...watchlist.map((w) => w.symbol)]),
    [isForex, positions, watchlist]
  );
  const rowSparks = useSymbolSparks(sparkSymbols);

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

  // While quotes are on their first load, P&L figures compute to $0.00 from the
  // cost-basis fallbacks — show "…" instead of rendering zeros as if real.
  const quotesLoading = quotesPending && positions.length > 0;
  const fxQuotesLoading = quotesPending && fxOpen.length > 0;

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
          <span className="text-base font-bold tracking-tight text-foreground">{account.name}</span>
        </nav>
        <div className="flex gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-card"
          >
            Share
          </button>
        </div>
      </div>

      {/* Active scanners on this account — tap to configure/disable in place */}
      {aiActive && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Active scanners</span>
          {(
            [
              [aiActive, "ai", "AI Scanner"],
            ] as [boolean, "ai", string][]
          ).map(
            ([active, kind, label]) =>
              active && (
                <button
                  key={kind}
                  onClick={() => setScannerModal(kind)}
                  className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400"
                >
                  <ScannerIcon kind={kind} size={12} /> {label}
                </button>
              )
          )}
        </div>
      )}

      {/* Portfolio summary (always visible) */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-5">
            <div>
              <div className="text-3xl font-bold">
                {/* Until live quotes land, holdings are valued at cost — a real-looking
                    number that then silently jumps tens of percent. Skeleton instead. */}
                {quotesLoading || fxQuotesLoading ? (
                  <TextSkeleton className="w-44" />
                ) : (
                  formatCurrency(isForex ? fxEquity : totalValue + fxMargin + fxFloating)
                )}
              </div>
              <div className="flex items-center gap-2 text-xs capitalize text-muted">
                <span>
                  {account.type} account · {isForex ? "equity" : "total value"}
                </span>
                <MarketStatusBadge market={account.type} />
                <QuoteFreshness {...summarizeFreshness(quotes)} />
              </div>
            </div>
            <EquitySpark accountId={account.id} />
          </div>
          {isForex ? (
            <div className={`text-sm font-medium ${fxQuotesLoading ? "text-muted" : changeColor(fxFloating)}`}>
              {fxQuotesLoading ? <TextSkeleton className="w-16" /> : formatSignedCurrency(fxFloating)} floating P&L
            </div>
          ) : (
            <div className={`text-sm font-medium ${quotesLoading ? "text-muted" : changeColor(todayPnl)}`}>
              {quotesLoading ? <TextSkeleton className="w-28" /> : `${formatSignedCurrency(todayPnl)} (${formatPercent(todayPnlPct)})`} today
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
                value={fxQuotesLoading ? <TextSkeleton className="w-16" /> : formatSignedCurrency(fxFloating)}
                colorClass={fxQuotesLoading ? "text-muted" : changeColor(fxFloating)}
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
                value={quotesLoading ? <TextSkeleton className="w-20" /> : formatCurrency(holdingsValue)}
                onChart={positions.length ? () => setMetricChart("holdings") : undefined}
              />
              <Stat
                label="Today's P&L"
                value={
                  quotesLoading
                    ? <TextSkeleton className="w-24" />
                    : `${formatSignedCurrency(todayPnl)} (${formatPercent(todayPnlPct)})`
                }
                colorClass={quotesLoading ? "text-muted" : changeColor(todayPnl)}
              />
              <Stat
                label="Unrealized P&L · vs cost"
                value={
                  quotesLoading
                    ? <TextSkeleton className="w-24" />
                    : costBasis > 0
                      ? `${formatSignedCurrency(totalPnl + fxFloating)} (${formatPercent(totalPnlPct)})`
                      : formatSignedCurrency(totalPnl + fxFloating)
                }
                colorClass={quotesLoading ? "text-muted" : changeColor(totalPnl + fxFloating)}
                onChart={positions.length ? () => setMetricChart("pnl") : undefined}
              />
              <Stat
                label="Realized P&L"
                value={formatSignedCurrency(realized + fxRealized)}
                colorClass={changeColor(realized + fxRealized)}
              />
            </>
          )}
        </div>

        {/* Insights reads the whole portfolio — how concentrated it is, what it
            is really a bet on — so it belongs to this summary rather than to a
            tab sitting beside the tables, where nobody found it. */}
        {!isForex && positions.length > 0 && (
          <div className="mt-5 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setInsightsOpen((v) => !v)}
              aria-expanded={insightsOpen}
              className="flex w-full items-center justify-between gap-2 text-sm font-medium text-muted transition hover:text-foreground"
            >
              <span>
                Insights <span className="font-normal">· what this portfolio is really made of</span>
              </span>
              <span aria-hidden className="text-xs">
                {insightsOpen ? "▴ Hide" : "▾ Show"}
              </span>
            </button>
            {insightsOpen && (
              <div className="mt-4">
                <InsightsTab
                  accountId={account.id}
                  positions={positions}
                  quotes={quotes}
                  cash={cash}
                  todayPnlPct={todayPnlPct}
                  onSelect={(symbol) => selectSymbol(symbol)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Forex accounts: two columns on desktop — pair picker + positions in the
          main column, performance + coach in the rail, so trading and results
          are visible side by side. Mobile keeps the familiar stacked order. */}
      {isForex && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <ForexPanel
              accountId={account.id}
              cash={cash}
              positions={fxPositions}
              quotes={quotes}
              orders={initialFxOrders}
              tpLevels={initialFxTpLevels}
            />
          </div>
          <div className="min-w-0 space-y-6 lg:col-span-1">
            <ForexPerformance accountId={account.id} closed={fxPositions.filter((p) => p.status !== "open")} />
            <TradeCoach positions={fxPositions} cash={cash} />
          </div>
        </div>
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
            onBuy={() => setTrade({ side: "BUY", symbol: selected.symbol, fromPanel: true })}
            onSell={() => setTrade({ side: "SELL", symbol: selected.symbol, fromPanel: true })}
            onToggleWatch={() => toggleWatch(selected.symbol)}
            watchPending={watchBusy === selected.symbol}
          />
        </Modal>
      )}

      {/* Desktop: two columns — tables/insights in the main column, the trading
          rail (long/short + pending orders) on the right. Mobile: stacks in the
          familiar order (leverage → orders → tabs). */}
      {!isForex && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div
          className={`min-w-0 space-y-6 ${
            leadWithIdeas ? "lg:order-1 lg:col-span-2" : "lg:order-2 lg:col-span-1"
          }`}
        >
      {/* A stock account gives this column to the showcase instead of leverage:
          a beginner opening an empty account needs somewhere to start, not a
          margin ticket. Crypto keeps the long/short panel. */}
      {isStocks ? (
        <>
          {/* Desktop only — on a phone this same showcase is the Ideas tab. */}
          <div className="hidden lg:block">
            <StockShowcase onSelect={selectSymbol} />
          </div>
          {/* Never strand a position: if this account still holds leveraged
              trades from before, it keeps the panel to close them. */}
          {fxPositions.some((p) => p.status === "open") && (
            <LeveragePanel
              accountId={account.id}
              accountType={account.type}
              cash={cash}
              positions={fxPositions}
              quotes={quotes}
            />
          )}
        </>
      ) : (
        <LeveragePanel
          accountId={account.id}
          accountType={account.type}
          cash={cash}
          positions={fxPositions}
          quotes={quotes}
        />
      )}

      <TradeCoach positions={fxPositions} cash={cash} />

      {/* Pending limit orders */}
      {orders.length > 0 && (
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
        </div>

        <div
          className={`min-w-0 ${
            leadWithIdeas ? "lg:order-2 lg:col-span-1" : "lg:order-1 lg:col-span-2"
          }`}
        >
      {/* Holdings / Watchlist / History tabs */}
      <section id="account-tabs" className="scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {(
              [
                ...(isStocks ? [{ key: "ideas" as Tab, label: "Ideas", phoneOnly: true }] : []),
                { key: "holdings", label: "Holdings", count: positions.length },
                { key: "watchlist", label: "Watchlist", count: watchlist.length },
                { key: "history", label: "History", count: transactions.length },
              ] as { key: Tab; label: string; count?: number; phoneOnly?: boolean }[]
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
                  t.phoneOnly ? "lg:hidden" : ""
                } ${tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {t.label}
                {t.count ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>

          {/* Small filter for the current table (not on Insights) */}
          {tab !== "ideas" && (
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

        {/* Phone only: on a narrow screen the right-hand column stacks on top,
            so the showcase pushed holdings below a full screen of scrolling.
            Here it is a tab instead. The desktop copy lives in that column. */}
        {tab === "ideas" && (
          <div className="lg:hidden">
            <StockShowcase onSelect={selectSymbol} />
          </div>
        )}

        {tab === "holdings" && (
          <HoldingsTable
            positions={positions.filter((p) => p.symbol.toLowerCase().includes(filter.toLowerCase()))}
            quotes={quotes}
            sparks={rowSparks}
            accountType={account.type}
            onSelect={selectSymbol}
          />
        )}

        {tab === "watchlist" && (
          <WatchlistTable
            items={watchlist.filter((w) => w.symbol.toLowerCase().includes(filter.toLowerCase()))}
            quotes={quotes}
            sparks={rowSparks}
            onSelect={selectSymbol}
            onBuy={(symbol) => setTrade({ side: "BUY", symbol })}
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

      </section>
        </div>
      </div>
      )}

      {trade && (
        <TradeModal
          accountId={account.id}
          symbol={trade.symbol}
          side={trade.side}
          price={tradePrice}
          cash={cash}
          maxShares={heldFor(trade.symbol)}
          showChart={!trade.fromPanel}
          onClose={() => setTrade(null)}
        />
      )}
      {cashModal && (
        <CashModal accountId={account.id} mode={cashModal} onClose={() => setCashModal(null)} />
      )}
      {shareOpen && <ShareCardModal accountId={account.id} onClose={() => setShareOpen(false)} />}
      {scannerModal === "ai" && (
        <Modal title={`${account.name} · scanner`} onClose={() => setScannerModal(null)} wide>
          <AiScanner
            accountId={account.id}
            accountType={account.type}
            autoSettings={autoSettings}
            aiInstruction={aiInstruction}
            aiSymbols={account.ai_symbols}
            defaultOpen
          />
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
  value: React.ReactNode;
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
