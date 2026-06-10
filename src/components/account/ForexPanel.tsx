"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FxPosition, FxOrder, Quote } from "@/lib/types";
import { formatCurrency, formatSignedCurrency, formatPercent, changeColor } from "@/lib/format";
import {
  FX_PAIRS,
  FX_LOTS,
  FX_LEVERAGE,
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
  fillFxOrderAction,
} from "@/app/dashboard/[accountId]/actions";
import Modal from "@/components/Modal";
import PriceChart from "./PriceChart";

export default function ForexPanel({
  accountId,
  cash,
  positions,
  quotes,
  orders = [],
}: {
  accountId: string;
  cash: number;
  positions: FxPosition[];
  quotes: Record<string, Quote>;
  orders?: FxOrder[];
}) {
  const router = useRouter();
  const [trade, setTrade] = useState<string | null>(null); // pair symbol
  const [closing, setClosing] = useState<string | null>(null);
  const [editSltp, setEditSltp] = useState<FxPosition | null>(null);

  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status !== "open").slice(0, 10);
  const pendingOrders = orders.filter((o) => o.status === "pending");

  // Live auto-close while the page is open (cron covers the rest of the time).
  // The server re-verifies with a fresh rate, so a stale quote can't force a close.
  const autoRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of open) {
      const q = quotes[p.symbol.toUpperCase()];
      if (!q?.price || autoRef.current.has(p.id)) continue;
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
    await cancelFxOrderAction(id, accountId);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Pair picker */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Currency pairs</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FX_PAIRS.map((p) => {
            const q = quotes[p.symbol];
            return (
              <button
                key={p.symbol}
                onClick={() => setTrade(p.symbol)}
                className="rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/60"
              >
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-sm">{q ? formatRate(q.price) : "…"}</div>
                <div className={`text-xs ${changeColor(q?.percentChange ?? 0)}`}>
                  {q ? formatPercent(q.percentChange) : ""}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Tap a pair to go long (buy) or short (sell) with {FX_LEVERAGE}:1 leverage.
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
                  <button
                    onClick={() => cancelOrder(o.id)}
                    className="shrink-0 text-xs text-muted hover:text-negative"
                  >
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open positions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Open positions{open.length ? ` (${open.length})` : ""}</h2>
        {open.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No open positions. Pick a pair above to place your first trade.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
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
                  const fl = rate ? floatingPnl(p.direction, Number(p.units), Number(p.open_rate), rate) : null;
                  const pp = rate ? pips(p.direction, Number(p.open_rate), rate) : null;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-semibold">{pairName(p.symbol)}</td>
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
        )}
      </section>

      {/* Closed positions */}
      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Closed positions</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Pair</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 text-right font-medium">Units</th>
                  <th className="px-4 py-3 text-right font-medium">Open → Close</th>
                  <th className="px-4 py-3 text-right font-medium">P&L</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold">{pairName(p.symbol)}</td>
                    <td className="px-4 py-3 text-muted">{p.direction === "LONG" ? "Long" : "Short"}</td>
                    <td className="px-4 py-3 text-right">{Number(p.units).toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatRate(Number(p.open_rate))} → {p.close_rate ? formatRate(Number(p.close_rate)) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${changeColor(Number(p.pnl ?? 0))}`}>
                      {formatSignedCurrency(Number(p.pnl ?? 0))}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "stopped" && (
                        <span className="rounded-md bg-negative/15 px-2 py-0.5 text-xs font-medium text-negative">
                          Stopped out
                        </span>
                      )}
                      {p.status === "sl" && (
                        <span className="rounded-md bg-negative/15 px-2 py-0.5 text-xs font-medium text-negative">
                          SL hit
                        </span>
                      )}
                      {p.status === "tp" && (
                        <span className="rounded-md bg-positive/15 px-2 py-0.5 text-xs font-medium text-positive">
                          TP hit
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
          onClose={() => setEditSltp(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit stop-loss / take-profit on an open position.
function SlTpModal({
  accountId,
  position,
  rate,
  onClose,
}: {
  accountId: string;
  position: FxPosition;
  rate?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sl, setSl] = useState(position.stop_loss != null ? String(position.stop_loss) : "");
  const [tp, setTp] = useState(position.take_profit != null ? String(position.take_profit) : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLong = position.direction === "LONG";

  async function save() {
    setError(null);
    const slNum = sl.trim() ? Number(sl) : null;
    const tpNum = tp.trim() ? Number(tp) : null;
    if (rate) {
      const err = sltpError(position.direction, rate, slNum, tpNum);
      if (err) return setError(err);
    }
    setLoading(true);
    const res = await setFxSlTpAction({
      positionId: position.id,
      accountId,
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
    <Modal title={`SL / TP — ${pairName(position.symbol)}`} onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {error}
          </div>
        )}
        <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-muted">
            {position.direction === "LONG" ? "Long" : "Short"} {Number(position.units).toLocaleString("en-US")} ·
            opened {formatRate(Number(position.open_rate))}
          </span>
          <span className="font-semibold">{rate ? formatRate(rate) : "…"}</span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Stop-loss</label>
          <input type="number" min="0" step="any" value={sl} onChange={(e) => setSl(e.target.value)}
            placeholder={isLong ? "Below current rate…" : "Above current rate…"} className={inputClass} />
          <p className="mt-1 text-xs text-muted">Closes the position to cap your loss. Leave empty for none.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Take-profit</label>
          <input type="number" min="0" step="any" value={tp} onChange={(e) => setTp(e.target.value)}
            placeholder={isLong ? "Above current rate…" : "Below current rate…"} className={inputClass} />
          <p className="mt-1 text-xs text-muted">Locks in your gain automatically. Leave empty for none.</p>
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
  const [units, setUnits] = useState(10_000); // default mini lot
  const [custom, setCustom] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [execMode, setExecMode] = useState<"MARKET" | "PENDING">("MARKET");
  const [entryRate, setEntryRate] = useState("");
  const [expiry, setExpiry] = useState<number | null>(null); // hours; null = GTC
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rate: number; margin: number; pending?: boolean } | null>(null);

  const rate = quote?.price ?? 0;
  const effUnits = custom ? Number(custom) || 0 : units;
  // Pending orders price at the chosen entry rate; market orders at the live rate.
  const execRate = execMode === "PENDING" ? Number(entryRate) || rate : rate;
  const notional = effUnits * execRate;
  const margin = execRate > 0 ? marginFor(effUnits, execRate) : 0;
  const affordable = margin > 0 && margin <= cash;

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
        entryRate: entry,
        stopLoss: slNum,
        takeProfit: tpNum,
        expiresHours: expiry,
      });
      setLoading(false);
      if (res.error) return setError(res.error);
      setDone({ rate: entry, margin: marginFor(effUnits, entry), pending: true });
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
      stopLoss: slNum,
      takeProfit: tpNum,
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
                <label className="mb-1 block text-xs font-medium text-muted">Expires</label>
                <select
                  value={expiry ?? ""}
                  onChange={(e) => setExpiry(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Never (GTC)</option>
                  <option value="24">In 1 day</option>
                  <option value="168">In 1 week</option>
                </select>
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
            </div>
          </div>

          {/* Order summary */}
          <div className="space-y-1.5 rounded-lg border border-border bg-background p-3 text-sm">
            <Row label="Notional value" value={rate ? formatCurrency(notional) : "…"} />
            <Row label={`Margin required (${FX_LEVERAGE}:1)`} value={rate ? formatCurrency(margin) : "…"} bold />
            <Row label="Pip value" value={`${formatCurrency(pipValue(effUnits))} / pip`} />
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
