"use client";

import { useEffect, useState } from "react";
import type { FxPosition } from "@/lib/types";
import { pairName, formatRate, floatingPnl, pips } from "@/lib/forex";
import { formatSignedCurrency, changeColor } from "@/lib/format";
import Modal from "@/components/Modal";
import CandleChart, { type OhlcPoint, type LevelLine } from "./CandleChart";
import { ChartSkeleton } from "@/components/Skeleton";

const RANGES = [
  { label: "1D", interval: "15min", outputsize: 96 },
  { label: "1W", interval: "1h", outputsize: 120 },
  { label: "1M", interval: "1day", outputsize: 30 },
] as const;

export default function PositionChartModal({
  position,
  rate,
  onClose,
}: {
  position: FxPosition;
  rate?: number;
  onClose: () => void;
}) {
  const [rangeIdx, setRangeIdx] = useState(1); // default 1W
  const [candles, setCandles] = useState<OhlcPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightErr, setInsightErr] = useState<string | null>(null);

  useEffect(() => {
    const r = RANGES[rangeIdx];
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/ohlc?symbol=${encodeURIComponent(position.symbol)}&interval=${r.interval}&outputsize=${r.outputsize}`)
      .then((res) => res.json())
      .then((j) => {
        if (!active) return;
        if (j.error) setError(j.error);
        else setCandles(j.candles ?? []);
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [position.symbol, rangeIdx]);

  const isOpen = position.status === "open";
  const entry = Number(position.open_rate);
  const sl = position.stop_loss != null ? Number(position.stop_loss) : null;
  const tp = position.take_profit != null ? Number(position.take_profit) : null;
  const closeRate = position.close_rate != null ? Number(position.close_rate) : null;
  const current = isOpen ? rate : (closeRate ?? undefined);

  const fmt = (n: number) => formatRate(n, position.symbol);

  const levels: LevelLine[] = [
    { price: entry, label: `Entry ${fmt(entry)}`, color: "var(--primary)" },
    ...(sl != null ? [{ price: sl, label: `SL ${fmt(sl)}`, color: "var(--negative)" }] : []),
    ...(tp != null ? [{ price: tp, label: `TP ${fmt(tp)}`, color: "var(--positive)" }] : []),
    ...(current != null
      ? [{ price: current, label: `${isOpen ? "Now" : "Exit"} ${fmt(current)}`, color: "var(--muted)", dashed: true }]
      : []),
  ];

  // Reward:risk implied by the plan (entry → stop vs entry → target).
  const risk = sl != null ? Math.abs(entry - sl) : null;
  const reward = tp != null ? Math.abs(tp - entry) : null;
  const rr = risk && reward && risk > 0 ? reward / risk : null;

  const pnl =
    isOpen && current != null
      ? floatingPnl(position.direction, Number(position.units), entry, current, position.symbol)
      : Number(position.pnl ?? 0);
  const pp = current != null ? pips(position.direction, entry, current, position.symbol) : null;

  async function loadInsight() {
    setInsightLoading(true);
    setInsightErr(null);
    try {
      const res = await fetch("/api/forex/position-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: position.symbol,
          direction: position.direction,
          units: Number(position.units),
          entry,
          stopLoss: sl,
          takeProfit: tp,
          status: position.status,
          closeRate,
        }),
      });
      const j = await res.json();
      if (j.error) setInsightErr(j.error);
      else setInsight(j.text);
    } catch (e) {
      setInsightErr(String(e));
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <Modal
      title={`${pairName(position.symbol)} — ${position.direction === "LONG" ? "Long" : "Short"} ${Number(position.units).toLocaleString("en-US")}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Entry" value={fmt(entry)} />
          <Stat label={isOpen ? "Now" : "Exit"} value={current != null ? fmt(current) : "…"} />
          <Stat
            label={isOpen ? "Floating P&L" : "P&L"}
            value={formatSignedCurrency(pnl)}
            cls={changeColor(pnl)}
          />
          <Stat
            label="Pips"
            value={pp != null ? `${pp >= 0 ? "+" : ""}${pp.toFixed(1)}` : "…"}
            cls={pp != null ? changeColor(pp) : ""}
          />
          <Stat label="Reward : Risk" value={rr != null ? `${rr.toFixed(2)} : 1` : "—"} />
          <Stat label="SL / TP" value={`${sl != null ? fmt(sl) : "—"} / ${tp != null ? fmt(tp) : "—"}`} />
        </div>

        <div className="flex justify-end gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={`rounded px-2 py-0.5 text-xs ${
                i === rangeIdx ? "bg-primary text-primary-foreground" : "text-muted hover:bg-background"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <ChartSkeleton height={260} />
        ) : error ? (
          <div className="flex items-center justify-center px-6 text-center text-xs text-muted" style={{ height: 260 }}>
            {/credit|limit|run out/i.test(error)
              ? "Daily market-data limit reached. Try again tomorrow."
              : "Chart unavailable."}
          </div>
        ) : (
          <CandleChart candles={candles} levels={levels} height={260} formatValue={fmt} />
        )}

        <p className="text-xs text-muted">
          <span style={{ color: "var(--primary)" }}>━ entry</span> ·{" "}
          <span style={{ color: "var(--negative)" }}>━ stop-loss</span> ·{" "}
          <span style={{ color: "var(--positive)" }}>━ take-profit</span> ·{" "}
          <span className="text-muted">┄ {isOpen ? "current" : "exit"}</span>
          {rr != null && ` — the plan targets ${rr.toFixed(2)}:1 reward-to-risk.`}
        </p>
        <p className="text-center text-[11px] text-muted">Scroll or pinch to zoom · drag to pan</p>

        <div className="rounded-lg border border-border bg-background p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">🤖 AI strategy read</span>
            {!insight && !insightLoading && (
              <button
                type="button"
                onClick={loadInsight}
                className="text-xs font-medium text-primary hover:underline"
              >
                Explain this trade
              </button>
            )}
          </div>
          {insightLoading ? (
            <p className="text-xs text-muted">Analyzing the setup…</p>
          ) : insightErr ? (
            <p className="text-xs text-muted">
              {/limit|credit|run out/i.test(insightErr)
                ? "AI limit reached — try again later."
                : "Couldn't generate the analysis."}
            </p>
          ) : insight ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">{insight}</p>
          ) : (
            <p className="text-xs text-muted">
              Tap “Explain this trade” for an AI read of the setup, why the stop and target sit where
              they do, and what to watch.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-semibold ${cls ?? ""}`}>{value}</div>
    </div>
  );
}
