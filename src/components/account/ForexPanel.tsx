"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FxPosition, Quote } from "@/lib/types";
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
} from "@/lib/forex";
import { openFxPositionAction, closeFxPositionAction } from "@/app/dashboard/[accountId]/actions";
import Modal from "@/components/Modal";
import PriceChart from "./PriceChart";

export default function ForexPanel({
  accountId,
  cash,
  positions,
  quotes,
}: {
  accountId: string;
  cash: number;
  positions: FxPosition[];
  quotes: Record<string, Quote>;
}) {
  const router = useRouter();
  const [trade, setTrade] = useState<string | null>(null); // pair symbol
  const [closing, setClosing] = useState<string | null>(null);

  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status !== "open").slice(0, 10);

  async function closePosition(id: string) {
    setClosing(id);
    await closeFxPositionAction(id, accountId);
    setClosing(null);
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
    </div>
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rate: number; margin: number } | null>(null);

  const rate = quote?.price ?? 0;
  const effUnits = custom ? Number(custom) || 0 : units;
  const notional = effUnits * rate;
  const margin = rate > 0 ? marginFor(effUnits, rate) : 0;
  const affordable = margin > 0 && margin <= cash;

  async function submit() {
    setError(null);
    if (effUnits <= 0) return setError("Enter a position size.");
    if (!affordable) return setError("Not enough free cash for the required margin.");
    setLoading(true);
    const res = await openFxPositionAction({ accountId, symbol, direction, units: effUnits });
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
            Opened <strong>{direction === "LONG" ? "Long" : "Short"}</strong>{" "}
            <strong>{effUnits.toLocaleString("en-US")}</strong> {pairName(symbol)} at{" "}
            <strong>{formatRate(done.rate)}</strong> — {formatCurrency(done.margin)} margin reserved.
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

          <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
            <span className="text-muted">Live rate</span>
            <span className="font-semibold">{rate ? formatRate(rate) : "…"}</span>
          </div>

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
              ? "Opening…"
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
