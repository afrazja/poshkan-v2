"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FxPosition, FxOrder, FxTpLevel, Quote, NewsItem } from "@/lib/types";
import { formatCurrency, formatSignedCurrency, formatPercent, changeColor } from "@/lib/format";
import {
  FX_PAIRS,
  FX_LOTS,
  TRADE_LEVERAGE_OPTIONS,
  pairName,
  marginFor,
  pipValue,
  floatingPnl,
  pips,
  formatRate,
  sltpError,
  autoCloseReason,
} from "@/lib/forex";
import {
  openFxPositionAction,
  closeFxPositionAction,
  setFxSlTpAction,
  autoCloseFxPositionAction,
  placeFxOrderAction,
  cancelFxOrderAction,
  editFxOrderAction,
  fillFxOrderAction,
  setFxTakeProfitLevelsAction,
  fillFxTpLevelsAction,
} from "@/app/dashboard/[accountId]/actions";
import Modal from "@/components/Modal";
import PriceChart from "./PriceChart";
import PositionChartModal from "./PositionChartModal";
import SourceBadge from "./SourceBadge";

// Pending "At rate…" entry orders: lets users set a better entry at a pullback
// level instead of chasing market. Set false to hide (market-only forex).
const ALLOW_PENDING_FX = true;

// Effective leverage of a forex position = USD notional ÷ reserved margin.
// marginFor(…, 1, …) returns the 1× notional, so notional ÷ margin = leverage.
function fxLevOf(p: FxPosition): number {
  const m = Number(p.margin);
  return m > 0 ? Math.max(1, Math.round(marginFor(Number(p.units), Number(p.open_rate), 1, p.symbol) / m)) : 0;
}

export default function ForexPanel({
  accountId,
  cash,
  positions,
  quotes,
  orders = [],
  tpLevels = [],
}: {
  accountId: string;
  cash: number;
  positions: FxPosition[];
  quotes: Record<string, Quote>;
  orders?: FxOrder[];
  tpLevels?: FxTpLevel[];
}) {
  const router = useRouter();
  const [trade, setTrade] = useState<string | null>(null); // pair to open a position on
  const [selectedPair, setSelectedPair] = useState<string>(FX_PAIRS[0].symbol);
  const [detail, setDetail] = useState<string | null>(null); // pair chart/news popup
  const [closing, setClosing] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [editSltp, setEditSltp] = useState<FxPosition | null>(null);
  const [chartPos, setChartPos] = useState<FxPosition | null>(null);
  const [editOrder, setEditOrder] = useState<FxOrder | null>(null);
  const [expandedFx, setExpandedFx] = useState<string | null>(null);
  const [pairQuery, setPairQuery] = useState("");

  const query = pairQuery.trim().toLowerCase();
  const visiblePairs = query
    ? FX_PAIRS.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.label.toLowerCase().includes(query) ||
          p.symbol.toLowerCase().includes(query)
      )
    : FX_PAIRS;

  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status !== "open").slice(0, 30);
  const pendingOrders = orders.filter((o) => o.status === "pending");

  // Live auto-close while the page is open (cron covers the rest of the time).
  // The server re-verifies with a fresh rate, so a stale quote can't force a close.
  const autoRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of open) {
      if (autoRef.current.has(p.id)) continue;
      // Timed auto-close: close at market once the timer passes (server fetches
      // its own rate, so no quote is needed here).
      if (p.auto_close_at && new Date(p.auto_close_at).getTime() <= Date.now()) {
        autoRef.current.add(p.id);
        closeFxPositionAction(p.id, accountId)
          .then((r) => {
            if (!r.error) router.refresh();
            else autoRef.current.delete(p.id);
          })
          .catch(() => autoRef.current.delete(p.id));
        continue;
      }
      const q = quotes[p.symbol.toUpperCase()];
      if (!q?.price) continue;
      if (!autoCloseReason(p, q.price)) continue;
      autoRef.current.add(p.id);
      // Refresh only on a confirmed close — refreshing on a server-declined
      // close (stale client rate) would loop this effect.
      autoCloseFxPositionAction(p.id, accountId)
        .then((r) => {
          if (r.closed) router.refresh();
          else autoRef.current.delete(p.id);
        })
        .catch(() => autoRef.current.delete(p.id));
    }
  }, [open, quotes, accountId, router]);

  async function closePosition(id: string) {
    setClosing(id);
    await closeFxPositionAction(id, accountId);
    setClosing(null);
    router.refresh();
  }

  // Live scaled-take-profit fills while the page is open (cron covers the rest).
  const tpRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of open) {
      if (tpRef.current.has(p.id)) continue;
      const mine = tpLevels.filter((l) => l.position_id === p.id && l.status === "pending");
      if (mine.length === 0) continue;
      const q = quotes[p.symbol.toUpperCase()];
      if (!q?.price) continue;
      const isLong = p.direction === "LONG";
      const triggered = mine.some((l) => (isLong ? q.price >= Number(l.price) : q.price <= Number(l.price)));
      if (!triggered) continue;
      tpRef.current.add(p.id);
      fillFxTpLevelsAction(p.id, accountId)
        .then((r) => {
          if (r.filled > 0) router.refresh();
          tpRef.current.delete(p.id);
        })
        .catch(() => tpRef.current.delete(p.id));
    }
  }, [open, tpLevels, quotes, accountId, router]);

  // Live entry-order fills while the page is open (cron covers the rest).
  const fillRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const o of pendingOrders) {
      const q = quotes[o.symbol.toUpperCase()];
      if (!q?.price || fillRef.current.has(o.id)) continue;
      const expired = o.expires_at && new Date(o.expires_at).getTime() <= Date.now();
      const meets =
        o.trigger_when === "AT_OR_BELOW" ? q.price <= Number(o.entry_rate) : q.price >= Number(o.entry_rate);
      if (!expired && !meets) continue;
      fillRef.current.add(o.id);
      fillFxOrderAction(o.id, accountId)
        .then((r) => {
          if (r.filled || r.error || expired) router.refresh();
          else fillRef.current.delete(o.id);
        })
        .catch(() => fillRef.current.delete(o.id));
    }
  }, [pendingOrders, quotes, accountId, router]);

  async function cancelOrder(id: string) {
    setCanceling(id);
    await cancelFxOrderAction(id, accountId);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Pair picker */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Currency pairs</h2>
          <div className="flex items-center gap-2">
            <input
              value={pairQuery}
              onChange={(e) => setPairQuery(e.target.value)}
              placeholder="Search (e.g. JPY)…"
              className="w-40 rounded-lg border border-border bg-input px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => setTrade(selectedPair)}
              className="whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              + Open position
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {visiblePairs.map((p) => {
            const quote = quotes[p.symbol];
            return (
              <div key={p.symbol} className="relative">
                <button
                  onClick={() => setSelectedPair(p.symbol)}
                  className={`w-full rounded-xl border bg-background p-3 text-left transition hover:border-primary/60 ${
                    selectedPair === p.symbol ? "border-primary ring-1 ring-primary/30" : "border-border"
                  }`}
                >
                  <div className="pr-6 font-semibold">{p.name}</div>
                  <div className="mt-1 text-sm">{quote ? formatRate(quote.price, p.symbol) : "…"}</div>
                  <div className={`text-xs ${changeColor(quote?.percentChange ?? 0)}`}>
                    {quote ? formatPercent(quote.percentChange) : ""}
                  </div>
                </button>
                <button
                  onClick={() => setDetail(p.symbol)}
                  aria-label={`${p.name} chart & news`}
                  title="Chart & news"
                  className="absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-sm text-muted hover:bg-card hover:text-foreground"
                >
                  ⓘ
                </button>
              </div>
            );
          })}
          {visiblePairs.length === 0 && (
            <p className="col-span-full py-2 text-sm text-muted">No pairs match “{pairQuery}”.</p>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Tap a pair to select it (ⓘ for its chart &amp; news). Use “+ Open position” to trade the
          selected pair ({pairName(selectedPair)}) — choose leverage (1–10×) per trade.
        </p>
      </div>

      {/* Pending entry orders */}
      {pendingOrders.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Pending entry orders</h2>
          <div className="space-y-2">
            {pendingOrders.map((o) => {
              const q = quotes[o.symbol.toUpperCase()];
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <div>
                    <span className={o.direction === "LONG" ? "font-semibold text-positive" : "font-semibold text-negative"}>
                      {o.direction === "LONG" ? "Long" : "Short"}
                    </span>{" "}
                    <span className="font-medium">
                      {Number(o.units).toLocaleString("en-US")} {pairName(o.symbol)}
                    </span>{" "}
                    <span className="text-muted">@ {formatRate(Number(o.entry_rate))} entry</span>
                    {q && <span className="ml-2 text-xs text-muted">now {formatRate(q.price)}</span>}
                    {o.expires_at && (
                      <span className="ml-2 text-xs text-muted">
                        · expires {new Date(o.expires_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => setEditOrder(o)}
                      className="text-xs text-muted hover:text-primary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => cancelOrder(o.id)}
                      disabled={canceling === o.id}
                      className="text-xs text-muted hover:text-negative disabled:opacity-50"
                    >
                      {canceling === o.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open positions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Open positions{open.length ? ` (${open.length})` : ""}</h2>
        {open.length > 0 && (
          <p className="mb-3 -mt-2 text-xs text-muted">
            Tap a pair name to see its chart with your entry, stop-loss, and take-profit.
          </p>
        )}
        {open.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No open positions. Pick a pair above to place your first trade.
          </div>
        ) : (
          <>
          {/* Mobile: position cards */}
          <div className="space-y-2 sm:hidden">
            {open.map((p) => {
              const q = quotes[p.symbol.toUpperCase()];
              const rate = q?.price;
              const fl = rate ? floatingPnl(p.direction, Number(p.units), Number(p.open_rate), rate, p.symbol) : null;
              const pp = rate ? pips(p.direction, Number(p.open_rate), rate, p.symbol) : null;
              const isExpanded = expandedFx === p.id;
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card">
                  {/* Collapsed header — tap the row to expand (pair name still opens the chart) */}
                  <div
                    onClick={() => setExpandedFx(isExpanded ? null : p.id)}
                    className="flex cursor-pointer items-center justify-between p-3"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChartPos(p);
                        }}
                        className="font-semibold hover:underline"
                        title="View chart"
                      >
                        {pairName(p.symbol)}
                      </button>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          p.direction === "LONG" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
                        }`}
                      >
                        {p.direction === "LONG" ? "Long" : "Short"}
                      </span>
                      <SourceBadge source={p.source} />
                    </div>
                    <span className="flex items-center gap-2">
                      <span className={`font-medium ${fl != null ? changeColor(fl) : ""}`}>
                        {fl != null ? formatSignedCurrency(fl) : "…"}
                      </span>
                      <span className={`text-lg leading-none text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                        ›
                      </span>
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-3 pt-2">
                      <div className="text-xs text-muted">
                        {Number(p.units).toLocaleString("en-US")} units · {formatRate(Number(p.open_rate))} →{" "}
                        {rate ? formatRate(rate) : "…"}
                        {pp != null && (
                          <span className={`ml-1 ${changeColor(pp)}`}>
                            ({pp >= 0 ? "+" : ""}
                            {pp.toFixed(1)} pips)
                          </span>
                        )}
                        <span className="ml-1">· {fxLevOf(p)}× lev</span>
                        {p.auto_close_at && <span className="ml-1">· ⏱ {autoCloseLabel(p.auto_close_at)}</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">Opened {fmtDateTime(p.opened_at)}</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => setEditSltp(p)}
                          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-background"
                        >
                          {p.stop_loss != null || p.take_profit != null
                            ? `SL ${p.stop_loss != null ? formatRate(Number(p.stop_loss)) : "—"} / TP ${p.take_profit != null ? formatRate(Number(p.take_profit)) : "—"}`
                            : "Set SL / TP"}
                        </button>
                        <button
                          onClick={() => closePosition(p.id)}
                          disabled={closing === p.id}
                          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-background disabled:opacity-50"
                        >
                          {closing === p.id ? "Closing…" : "Close"}
                        </button>
                      </div>
                      {(p.stop_loss != null || p.take_profit != null) && (
                        <div className="mt-1 text-right">
                          <SlTpPnl p={p} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Pair</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 text-right font-medium">Units</th>
                  <th className="px-4 py-3 text-right font-medium">Open rate</th>
                  <th className="px-4 py-3 text-right font-medium">Rate now</th>
                  <th className="px-4 py-3 text-right font-medium">Pips</th>
                  <th className="px-4 py-3 text-right font-medium">P&L</th>
                  <th className="px-4 py-3 text-right font-medium">Margin</th>
                  <th className="px-4 py-3 text-right font-medium">SL / TP</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {open.map((p) => {
                  const q = quotes[p.symbol.toUpperCase()];
                  const rate = q?.price;
                  const fl = rate ? floatingPnl(p.direction, Number(p.units), Number(p.open_rate), rate, p.symbol) : null;
                  const pp = rate ? pips(p.direction, Number(p.open_rate), rate, p.symbol) : null;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-semibold">
                        <button
                          type="button"
                          onClick={() => setChartPos(p)}
                          className="hover:underline"
                          title="View chart"
                        >
                          {pairName(p.symbol)}
                        </button>
                        {p.auto_close_at && (
                          <span className="block text-xs font-normal text-muted">⏱ {autoCloseLabel(p.auto_close_at)}</span>
                        )}
                        <span className="block text-xs font-normal text-muted">Opened {fmtDateTime(p.opened_at)}</span>
                        <span className="block text-xs font-normal text-muted">
                          {fxLevOf(p)}× lev
                          <SourceBadge source={p.source} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                            p.direction === "LONG" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
                          }`}
                        >
                          {p.direction === "LONG" ? "Long" : "Short"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{Number(p.units).toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-right">{formatRate(Number(p.open_rate))}</td>
                      <td className="px-4 py-3 text-right">{rate ? formatRate(rate) : "…"}</td>
                      <td className={`px-4 py-3 text-right ${pp != null ? changeColor(pp) : ""}`}>
                        {pp != null ? `${pp >= 0 ? "+" : ""}${pp.toFixed(1)}` : "…"}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${fl != null ? changeColor(fl) : ""}`}>
                        {fl != null ? formatSignedCurrency(fl) : "…"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">{formatCurrency(Number(p.margin))}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditSltp(p)}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-background"
                          title="Set stop-loss / take-profit"
                        >
                          {p.stop_loss != null || p.take_profit != null ? (
                            <>
                              <span className="text-negative">
                                {p.stop_loss != null ? formatRate(Number(p.stop_loss)) : "—"}
                              </span>
                              {" / "}
                              <span className="text-positive">
                                {p.take_profit != null ? formatRate(Number(p.take_profit)) : "—"}
                              </span>
                            </>
                          ) : (
                            "Set"
                          )}
                        </button>
                        {(p.stop_loss != null || p.take_profit != null) && (
                          <div className="mt-0.5">
                            <SlTpPnl p={p} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => closePosition(p.id)}
                          disabled={closing === p.id}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-50"
                        >
                          {closing === p.id ? "Closing…" : "Close"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* Closed positions */}
      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Closed positions</h2>
          {/* Mobile: closed-position cards */}
          <div className="space-y-2 sm:hidden">
            {closed.map((p) => {
              const pp = p.close_rate
                ? pips(p.direction, Number(p.open_rate), Number(p.close_rate), p.symbol)
                : null;
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      <button
                        type="button"
                        onClick={() => setChartPos(p)}
                        className="hover:underline"
                        title="View chart"
                      >
                        {pairName(p.symbol)}
                      </button>{" "}
                      <span className="text-xs font-normal text-muted">
                        {p.direction === "LONG" ? "Long" : "Short"} {Number(p.units).toLocaleString("en-US")}
                      </span>
                    </span>
                    <span className={`font-medium ${changeColor(Number(p.pnl ?? 0))}`}>
                      {formatSignedCurrency(Number(p.pnl ?? 0))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>
                      {formatRate(Number(p.open_rate))} → {p.close_rate ? formatRate(Number(p.close_rate)) : "—"}
                      {pp != null && (
                        <span className={`ml-1 ${changeColor(pp)}`}>
                          ({pp >= 0 ? "+" : ""}
                          {pp.toFixed(1)} pips)
                        </span>
                      )}
                    </span>
                    <FxOutcome status={p.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {fmtDateTime(p.opened_at)} → {fmtDateTime(p.closed_at)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Pair</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 text-right font-medium">Units</th>
                  <th className="px-4 py-3 text-right font-medium">Open → Close</th>
                  <th className="px-4 py-3 text-right font-medium">Pips</th>
                  <th className="px-4 py-3 text-right font-medium">P&L</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                  <th className="px-4 py-3 font-medium">Closed</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => {
                  const pp = p.close_rate
                    ? pips(p.direction, Number(p.open_rate), Number(p.close_rate), p.symbol)
                    : null;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-semibold">
                        <button
                          type="button"
                          onClick={() => setChartPos(p)}
                          className="hover:underline"
                          title="View chart"
                        >
                          {pairName(p.symbol)}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted">{p.direction === "LONG" ? "Long" : "Short"}</td>
                      <td className="px-4 py-3 text-right">{Number(p.units).toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-right text-muted">
                        {formatRate(Number(p.open_rate))} → {p.close_rate ? formatRate(Number(p.close_rate)) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right ${pp != null ? changeColor(pp) : "text-muted"}`}>
                        {pp != null ? `${pp >= 0 ? "+" : ""}${pp.toFixed(1)}` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${changeColor(Number(p.pnl ?? 0))}`}>
                        {formatSignedCurrency(Number(p.pnl ?? 0))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{fmtDateTime(p.opened_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{fmtDateTime(p.closed_at)}</td>
                      <td className="px-4 py-3"><FxOutcome status={p.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail && (
        <FxPairDetailModal
          symbol={detail}
          quote={quotes[detail.toUpperCase()]}
          onOpenPosition={() => {
            setSelectedPair(detail);
            setTrade(detail);
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}
      {trade && (
        <FxTradeModal
          accountId={accountId}
          symbol={trade}
          quote={quotes[trade]}
          cash={cash}
          onClose={() => setTrade(null)}
        />
      )}
      {editSltp && (
        <SlTpModal
          accountId={accountId}
          position={editSltp}
          rate={quotes[editSltp.symbol.toUpperCase()]?.price}
          levels={tpLevels.filter((l) => l.position_id === editSltp.id && l.status === "pending")}
          onClose={() => setEditSltp(null)}
        />
      )}
      {chartPos && (
        <PositionChartModal
          position={chartPos}
          rate={quotes[chartPos.symbol.toUpperCase()]?.price}
          onClose={() => setChartPos(null)}
        />
      )}
      {editOrder && (
        <EditFxOrderModal
          accountId={accountId}
          order={editOrder}
          rate={quotes[editOrder.symbol.toUpperCase()]?.price}
          onClose={() => setEditOrder(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit a still-pending entry order's rate / stop-loss / take-profit.
function EditFxOrderModal({
  accountId,
  order,
  rate,
  onClose,
}: {
  accountId: string;
  order: FxOrder;
  rate?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const isLong = order.direction === "LONG";
  const [entry, setEntry] = useState(String(order.entry_rate));
  const [sl, setSl] = useState(order.stop_loss != null ? String(order.stop_loss) : "");
  const [tp, setTp] = useState(order.take_profit != null ? String(order.take_profit) : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setError(null);
    const entryNum = Number(entry);
    if (!entryNum || entryNum <= 0) return setError("Enter a valid entry rate.");
    const slNum = sl.trim() ? Number(sl) : null;
    const tpNum = tp.trim() ? Number(tp) : null;
    const err = sltpError(order.direction, entryNum, slNum, tpNum);
    if (err) return setError(err.replace("current rate", "entry rate"));
    setLoading(true);
    const res = await editFxOrderAction({
      orderId: order.id,
      accountId,
      entryRate: entryNum,
      stopLoss: slNum,
      takeProfit: tpNum,
    });
    setLoading(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onClose();
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <Modal title={`Edit order — ${pairName(order.symbol)}`} onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {error}
          </div>
        )}
        <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-muted">
            {isLong ? "Long" : "Short"} {Number(order.units).toLocaleString("en-US")} units
          </span>
          <span className="font-semibold">live {rate ? formatRate(rate, order.symbol) : "…"}</span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Entry rate</label>
          <input
            type="number"
            min="0"
            step="any"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">Opens automatically when the rate reaches this level.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Stop-loss</label>
            <input
              type="number"
              min="0"
              step="any"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder={isLong ? "Below entry…" : "Above entry…"}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Take-profit</label>
            <input
              type="number"
              min="0"
              step="any"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder={isLong ? "Above entry…" : "Below entry…"}
              className={inputClass}
            />
          </div>
        </div>
        <button
          onClick={save}
          disabled={loading}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Edit stop-loss / take-profit on an open position.
function SlTpModal({
  accountId,
  position,
  rate,
  levels,
  onClose,
}: {
  accountId: string;
  position: FxPosition;
  rate?: number;
  levels: FxTpLevel[];
  onClose: () => void;
}) {
  const router = useRouter();
  const units = Number(position.units);
  const [sl, setSl] = useState(position.stop_loss != null ? String(position.stop_loss) : "");
  const [tp, setTp] = useState(position.take_profit != null ? String(position.take_profit) : "");
  // Scaled take-profit rows: price + % of the position to close at that price.
  const [tpRows, setTpRows] = useState<{ price: string; pct: string }[]>(
    levels.map((l) => ({
      price: String(l.price),
      pct: String(Math.round((Number(l.close_units) / units) * 100)),
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLong = position.direction === "LONG";
  const useScaled = tpRows.length > 0;

  // Translate the SL/TP price levels into a dollar threshold from the open rate.
  const slLoss =
    sl.trim() && Number(sl) > 0
      ? floatingPnl(position.direction, units, Number(position.open_rate), Number(sl), position.symbol)
      : null;
  const tpGain =
    !useScaled && tp.trim() && Number(tp) > 0
      ? floatingPnl(position.direction, units, Number(position.open_rate), Number(tp), position.symbol)
      : null;

  function addRow() {
    setTpRows((r) => [...r, { price: "", pct: "" }]);
  }
  function updateRow(i: number, patch: Partial<{ price: string; pct: string }>) {
    setTpRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeRow(i: number) {
    setTpRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    setError(null);
    const slNum = sl.trim() ? Number(sl) : null;
    const tpNum = useScaled ? null : tp.trim() ? Number(tp) : null;

    // Build the scaled levels (price + units derived from %).
    const scaledLevels: { price: number; units: number }[] = [];
    if (useScaled) {
      let totalPct = 0;
      for (const row of tpRows) {
        const price = Number(row.price);
        const pct = Number(row.pct);
        if (!price || price <= 0 || !pct || pct <= 0) {
          return setError("Each take-profit level needs a price and a percentage.");
        }
        totalPct += pct;
        scaledLevels.push({ price, units: Math.round(units * (pct / 100) * 100) / 100 });
      }
      if (totalPct > 100) return setError("Your take-profit percentages add up to more than 100%.");
    }

    if (rate) {
      const err = sltpError(position.direction, rate, slNum, tpNum);
      if (err) return setError(err);
    }

    setLoading(true);
    const slRes = await setFxSlTpAction({
      positionId: position.id,
      accountId,
      stopLoss: slNum,
      takeProfit: tpNum,
    });
    if (slRes.error) {
      setLoading(false);
      return setError(slRes.error);
    }
    // Set scaled levels (or clear them when not used).
    const tpRes = await setFxTakeProfitLevelsAction({
      positionId: position.id,
      accountId,
      levels: scaledLevels,
    });
    setLoading(false);
    if (tpRes.error) return setError(tpRes.error);
    router.refresh();
    onClose();
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <Modal title={`SL / TP — ${pairName(position.symbol)}`} onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {error}
          </div>
        )}
        <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-muted">
            {position.direction === "LONG" ? "Long" : "Short"} {units.toLocaleString("en-US")} ·
            opened {formatRate(Number(position.open_rate), position.symbol)}
          </span>
          <span className="font-semibold">{rate ? formatRate(rate, position.symbol) : "…"}</span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Stop-loss</label>
          <input type="number" min="0" step="any" value={sl} onChange={(e) => setSl(e.target.value)}
            placeholder={isLong ? "Below current rate…" : "Above current rate…"} className={inputClass} />
          <p className="mt-1 text-xs text-muted">
            Closes the position to cap your loss. Leave empty for none.
            {slLoss != null && (
              <>
                {" "}
                <span className={`font-semibold ${changeColor(slLoss)}`}>
                  ≈ {formatSignedCurrency(slLoss)} at this price
                </span>
              </>
            )}
          </p>
        </div>

        {!useScaled && (
          <div>
            <label className="mb-1 block text-sm font-medium">Take-profit</label>
            <input type="number" min="0" step="any" value={tp} onChange={(e) => setTp(e.target.value)}
              placeholder={isLong ? "Above current rate…" : "Below current rate…"} className={inputClass} />
            <p className="mt-1 text-xs text-muted">
              Closes the whole position at one price. Leave empty for none.
              {tpGain != null && (
                <>
                  {" "}
                  <span className={`font-semibold ${changeColor(tpGain)}`}>
                    ≈ {formatSignedCurrency(tpGain)} at this price
                  </span>
                </>
              )}
            </p>
          </div>
        )}

        {/* Scaled take-profit (scale out) */}
        <div className="rounded-lg border border-border p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">Scaled take-profit</span>
            {useScaled && (
              <button onClick={() => setTpRows([])} className="text-xs text-muted hover:text-negative">
                Clear
              </button>
            )}
          </div>
          <p className="mb-2 text-xs text-muted">
            Close part of the position at each price — e.g. 50% at one target, the rest higher.
          </p>
          {tpRows.map((row, i) => {
            const rowUnits = (units * (Number(row.pct) || 0)) / 100;
            const rowGain =
              Number(row.price) > 0 && rowUnits > 0
                ? floatingPnl(position.direction, rowUnits, Number(position.open_rate), Number(row.price), position.symbol)
                : null;
            return (
              <div key={i} className="mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" step="any" value={row.price}
                    onChange={(e) => updateRow(i, { price: e.target.value })}
                    placeholder="Price" className={`${inputClass} flex-1`}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="1" max="100" step="1" value={row.pct}
                      onChange={(e) => updateRow(i, { pct: e.target.value })}
                      placeholder="%" className="w-16 rounded-lg border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
                    />
                    <span className="text-xs text-muted">%</span>
                  </div>
                  <button onClick={() => removeRow(i)} className="text-muted hover:text-negative" aria-label="Remove level">
                    ✕
                  </button>
                </div>
                {rowGain != null && (
                  <p className={`mt-0.5 text-xs font-medium ${changeColor(rowGain)}`}>
                    ≈ {formatSignedCurrency(rowGain)} on this step
                  </p>
                )}
              </div>
            );
          })}
          <button onClick={addRow} className="text-xs font-medium text-primary hover:underline">
            + Add level
          </button>
          {useScaled && <p className="mt-2 text-xs text-muted">Scaled take-profit replaces the single take-profit above.</p>}
        </div>

        <button
          onClick={save}
          disabled={loading}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save levels"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function FxTradeModal({
  accountId,
  symbol,
  quote,
  cash,
  onClose,
}: {
  accountId: string;
  symbol: string;
  quote?: Quote;
  cash: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [lev, setLev] = useState<number>(1);
  const [units, setUnits] = useState(10_000); // default mini lot
  const [custom, setCustom] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [execMode, setExecMode] = useState<"MARKET" | "PENDING">("MARKET");
  const [entryRate, setEntryRate] = useState("");
  const [expiryUnit, setExpiryUnit] = useState<"gtc" | "min" | "hour" | "day">("gtc");
  const [expiryAmount, setExpiryAmount] = useState("40");
  // Timed auto-close for a market position (off = stays open until you close it).
  const [autoCloseUnit, setAutoCloseUnit] = useState<"off" | "min" | "hour">("off");
  const [autoCloseAmount, setAutoCloseAmount] = useState("5");

  // Chosen expiry as minutes from now (null = good-til-canceled).
  const expiryMinutes =
    expiryUnit === "gtc"
      ? null
      : (Number(expiryAmount) || 0) > 0
        ? Number(expiryAmount) * (expiryUnit === "min" ? 1 : expiryUnit === "hour" ? 60 : 1440)
        : null;
  const autoCloseMinutes =
    autoCloseUnit === "off"
      ? null
      : (Number(autoCloseAmount) || 0) > 0
        ? Number(autoCloseAmount) * (autoCloseUnit === "min" ? 1 : 60)
        : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rate: number; margin: number; pending?: boolean } | null>(null);

  const rate = quote?.price ?? 0;
  const effUnits = custom ? Number(custom) || 0 : units;
  // Pending orders price at the chosen entry rate; market orders at the live rate.
  const execRate = execMode === "PENDING" ? Number(entryRate) || rate : rate;
  const notional = effUnits * execRate;
  const margin = execRate > 0 ? marginFor(effUnits, execRate, lev, symbol) : 0;
  const affordable = margin > 0 && margin <= cash;

  // Dollar threshold at the SL/TP levels (from the order's entry rate).
  const slLossOpen =
    sl.trim() && Number(sl) > 0 && execRate > 0
      ? floatingPnl(direction, effUnits, execRate, Number(sl), symbol)
      : null;
  const tpGainOpen =
    tp.trim() && Number(tp) > 0 && execRate > 0
      ? floatingPnl(direction, effUnits, execRate, Number(tp), symbol)
      : null;

  async function submit() {
    setError(null);
    if (effUnits <= 0) return setError("Enter a position size.");
    if (!affordable) return setError("Not enough free cash for the required margin.");
    const slNum = sl.trim() ? Number(sl) : null;
    const tpNum = tp.trim() ? Number(tp) : null;

    if (execMode === "PENDING") {
      const entry = Number(entryRate) || 0;
      if (entry <= 0) return setError("Enter an entry rate.");
      const pendErr = sltpError(direction, entry, slNum, tpNum);
      if (pendErr) return setError(pendErr.replace("current rate", "entry rate"));
      setLoading(true);
      const res = await placeFxOrderAction({
        accountId,
        symbol,
        direction,
        units: effUnits,
        leverage: lev,
        entryRate: entry,
        stopLoss: slNum,
        takeProfit: tpNum,
        expiresMinutes: expiryMinutes,
      });
      setLoading(false);
      if (res.error) return setError(res.error);
      setDone({ rate: entry, margin: marginFor(effUnits, entry, lev, symbol), pending: true });
      router.refresh();
      return;
    }

    if (rate) {
      const sltpErr = sltpError(direction, rate, slNum, tpNum);
      if (sltpErr) return setError(sltpErr);
    }
    setLoading(true);
    const res = await openFxPositionAction({
      accountId,
      symbol,
      direction,
      units: effUnits,
      leverage: lev,
      stopLoss: slNum,
      takeProfit: tpNum,
      autoCloseMinutes,
    });
    setLoading(false);
    if (res.error) return setError(res.error);
    setDone({ rate: res.rate ?? rate, margin: res.margin ?? margin });
    router.refresh();
  }

  return (
    <Modal title={`Trade ${pairName(symbol)}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm">
            {done.pending ? (
              <>
                Entry order placed: <strong>{direction === "LONG" ? "Long" : "Short"}</strong>{" "}
                <strong>{effUnits.toLocaleString("en-US")}</strong> {pairName(symbol)} at{" "}
                <strong>{formatRate(done.rate)}</strong>. It opens automatically when the rate
                reaches your level (~{formatCurrency(done.margin)} margin at fill).
              </>
            ) : (
              <>
                Opened <strong>{direction === "LONG" ? "Long" : "Short"}</strong>{" "}
                <strong>{effUnits.toLocaleString("en-US")}</strong> {pairName(symbol)} at{" "}
                <strong>{formatRate(done.rate)}</strong> — {formatCurrency(done.margin)} margin reserved.
              </>
            )}
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}

          {/* Direction */}
          <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
            {(
              [
                { key: "LONG", label: "Buy / Long ▲" },
                { key: "SHORT", label: "Sell / Short ▼" },
              ] as const
            ).map((d) => (
              <button
                key={d.key}
                onClick={() => setDirection(d.key)}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                  direction === d.key
                    ? d.key === "LONG"
                      ? "bg-positive text-white"
                      : "bg-negative text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Execution: now at market, or pending at a chosen rate */}
          {ALLOW_PENDING_FX && (
            <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
              {(
                [
                  { key: "MARKET", label: "Market — now" },
                  { key: "PENDING", label: "At rate…" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  onClick={() => {
                    setExecMode(m.key);
                    // Pre-fill ~20 pips below the live rate (a valid limit entry to edit).
                    if (m.key === "PENDING" && !entryRate && rate) setEntryRate((rate - 0.002).toFixed(5));
                  }}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                    execMode === m.key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
            <span className="text-muted">Live rate</span>
            <span className="font-semibold">{rate ? formatRate(rate) : "…"}</span>
          </div>

          {execMode === "PENDING" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Entry rate</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={entryRate}
                  onChange={(e) => setEntryRate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Expires in</label>
                <div className="flex gap-1">
                  {expiryUnit !== "gtc" && (
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={expiryAmount}
                      onChange={(e) => setExpiryAmount(e.target.value)}
                      className="w-16 rounded-lg border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                  <select
                    value={expiryUnit}
                    onChange={(e) => setExpiryUnit(e.target.value as typeof expiryUnit)}
                    className="flex-1 rounded-lg border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="gtc">Never (GTC)</option>
                    <option value="min">Minutes</option>
                    <option value="hour">Hours</option>
                    <option value="day">Days</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <PriceChart symbol={symbol} height={150} />

          {/* Lot size */}
          <div>
            <label className="mb-1 block text-sm font-medium">Position size</label>
            <div className="flex gap-1">
              {FX_LOTS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => {
                    setUnits(l.units);
                    setCustom("");
                  }}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    !custom && units === l.units
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {l.label}
                  <span className="block text-[10px] opacity-75">{l.units.toLocaleString("en-US")}</span>
                </button>
              ))}
            </div>
            <input
              type="number"
              min="0"
              step="any"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom units…"
              className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Leverage — chosen per trade */}
          <div>
            <label className="mb-1 block text-sm font-medium">Leverage</label>
            <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
              {TRADE_LEVERAGE_OPTIONS.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setLev(x)}
                  className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                    lev === x ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  {x}×
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">1× = no leverage (full margin). Higher = bigger position, bigger swings.</p>
          </div>

          {/* Risk management (optional) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Stop-loss (optional)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                placeholder={direction === "LONG" ? "Below rate…" : "Above rate…"}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {slLossOpen != null && (
                <p className={`mt-0.5 text-xs font-medium ${changeColor(slLossOpen)}`}>
                  ≈ {formatSignedCurrency(slLossOpen)}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Take-profit (optional)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                placeholder={direction === "LONG" ? "Above rate…" : "Below rate…"}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {tpGainOpen != null && (
                <p className={`mt-0.5 text-xs font-medium ${changeColor(tpGainOpen)}`}>
                  ≈ {formatSignedCurrency(tpGainOpen)}
                </p>
              )}
            </div>
          </div>

          {/* Timed auto-close (market orders only) */}
          {execMode === "MARKET" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Auto-close after (optional)</label>
              <div className="flex gap-1">
                {autoCloseUnit !== "off" && (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={autoCloseAmount}
                    onChange={(e) => setAutoCloseAmount(e.target.value)}
                    className="w-16 rounded-lg border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                )}
                <select
                  value={autoCloseUnit}
                  onChange={(e) => setAutoCloseUnit(e.target.value as typeof autoCloseUnit)}
                  className="flex-1 rounded-lg border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="off">Don&apos;t auto-close</option>
                  <option value="min">Minutes</option>
                  <option value="hour">Hours</option>
                </select>
              </div>
              <p className="mt-1 text-xs text-muted">
                Closes the position at market when the timer runs out — banking whatever the P&amp;L is then.
              </p>
            </div>
          )}

          {/* Order summary */}
          <div className="space-y-1.5 rounded-lg border border-border bg-background p-3 text-sm">
            <Row label="Notional value" value={rate ? formatCurrency(notional) : "…"} />
            <Row label={`Margin required (${lev}:1)`} value={rate ? formatCurrency(margin) : "…"} bold />
            <Row label="Pip value" value={`${formatCurrency(pipValue(effUnits, symbol, rate))} / pip`} />
            <Row label="Free cash" value={formatCurrency(cash)} />
          </div>

          <button
            onClick={submit}
            disabled={loading || !rate || effUnits <= 0 || !affordable}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${
              direction === "LONG" ? "bg-positive" : "bg-negative"
            }`}
          >
            {loading
              ? execMode === "PENDING"
                ? "Placing…"
                : "Opening…"
              : execMode === "PENDING"
                ? `Place ${direction === "LONG" ? "long" : "short"} entry order`
                : `Open ${direction === "LONG" ? "long" : "short"} · ${effUnits.toLocaleString("en-US")} units`}
          </button>
          <p className="text-center text-xs text-muted">
            Auto-closes (stop-out) if the loss reaches your reserved margin.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

// Pair detail popup: chart + news. Opening a position is only via its button.
function FxPairDetailModal({
  symbol,
  quote,
  onOpenPosition,
  onClose,
}: {
  symbol: string;
  quote?: Quote;
  onOpenPosition: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={pairName(symbol)} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold">{quote ? formatRate(quote.price, symbol) : "…"}</div>
          <div className={`text-sm ${changeColor(quote?.percentChange ?? 0)}`}>
            {quote ? formatPercent(quote.percentChange) : ""}
          </div>
        </div>
        <PriceChart symbol={symbol} height={200} />
        <FxNews symbol={symbol} />
        <button
          onClick={onOpenPosition}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          + Open position
        </button>
      </div>
    </Modal>
  );
}

function FxNews({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => active && setNews(j.news ?? []))
      .catch(() => active && setNews([]));
    return () => {
      active = false;
    };
  }, [symbol]);

  if (news === null) return <p className="text-xs text-muted">Loading news…</p>;
  if (news.length === 0) return <p className="text-xs text-muted">No recent news for this pair.</p>;
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">News</h4>
      <div className="space-y-2">
        {news.slice(0, 5).map((n) => (
          <a
            key={n.link}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-border bg-background px-3 py-2 transition hover:border-primary/50"
          >
            <div className="text-sm font-medium leading-snug">{n.title}</div>
            <div className="mt-0.5 text-xs text-muted">
              {n.publisher}
              {n.publishedAt ? ` · ${fmtDateTime(n.publishedAt)}` : ""}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// Date + time for the trade history, e.g. "Jun 23, 9:42 AM".
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Outcome label for a closed position.
function FxOutcome({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    closed: { label: "Closed", cls: "bg-muted/15 text-muted" },
    stopped: { label: "Stopped out", cls: "bg-negative/15 text-negative" },
    sl: { label: "SL hit", cls: "bg-negative/15 text-negative" },
    tp: { label: "TP hit", cls: "bg-positive/15 text-positive" },
  };
  const o = map[status] ?? { label: status, cls: "bg-muted/15 text-muted" };
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${o.cls}`}>{o.label}</span>;
}

// The $ profit/loss a position would realize if its SL or TP is hit.
function SlTpPnl({ p }: { p: FxPosition }) {
  const at = (level: number | null) =>
    level == null
      ? null
      : floatingPnl(p.direction, Number(p.units), Number(p.open_rate), Number(level), p.symbol);
  const sl = at(p.stop_loss);
  const tp = at(p.take_profit);
  if (sl == null && tp == null) return null;
  return (
    <span className="text-xs">
      {sl != null && <span className={changeColor(sl)}>SL {formatSignedCurrency(sl)}</span>}
      {sl != null && tp != null && <span className="text-muted"> · </span>}
      {tp != null && <span className={changeColor(tp)}>TP {formatSignedCurrency(tp)}</span>}
    </span>
  );
}

// "closes in 4m" / "closes in 1h 5m" countdown for a timed auto-close.
function autoCloseLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closing…";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `closes in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `closes in ${h}h${m ? ` ${m}m` : ""}`;
}
