"use client";

import { useEffect, useState } from "react";

// Candlestick mini-chart for one scanner signal: the bars around the moment it
// fired, with the trade plan drawn on top — entry, stop-loss, take-profit, and
// the risk (red) / reward (green) zones. Turns "LONG @ 1.0842, SL 1.0815" from
// four opaque numbers into a picture of why the setup made sense.

interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  symbol: string;
  interval: string; // the scanner's entry timeframe: "5min" | "15min" | "1h"
  direction: "LONG" | "SHORT";
  entry: number | null;
  stop: number | null;
  takeProfit: number | null;
  createdAt: string;
}

const fmtPx = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(5));

const W = 340;
const H = 150;
const PAD_R = 44; // room for the E / SL / TP labels
const PAD_Y = 8;

export default function SignalMiniChart({ symbol, interval, direction, entry, stop, takeProfit, createdAt }: Props) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [signalIndex, setSignalIndex] = useState(-1);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ohlc?symbol=${encodeURIComponent(symbol)}&interval=${interval}&around=${encodeURIComponent(createdAt)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "failed to load candles");
        setCandles(data.candles ?? []);
        setSignalIndex(data.signalIndex ?? -1);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, createdAt]);

  if (err) return <p className="px-2 py-3 text-[11px] text-muted">Chart unavailable ({err}).</p>;
  if (!candles) return <div className="skeleton h-[150px] w-full rounded-lg" aria-hidden />;
  if (candles.length < 5 || entry == null || stop == null || takeProfit == null) {
    return <p className="px-2 py-3 text-[11px] text-muted">Not enough price history around this signal.</p>;
  }

  // Scale: cover the candles AND the full trade plan, padded 5%.
  let lo = Math.min(stop, takeProfit, entry);
  let hi = Math.max(stop, takeProfit, entry);
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  const pad = (hi - lo) * 0.05 || hi * 0.001;
  lo -= pad;
  hi += pad;
  const y = (p: number) => PAD_Y + ((hi - p) / (hi - lo)) * (H - 2 * PAD_Y);

  const plotW = W - PAD_R;
  const step = plotW / candles.length;
  const bodyW = Math.max(2, Math.min(7, step * 0.6));
  const x = (i: number) => step * (i + 0.5);

  const zone = (a: number, b: number) => ({ top: y(Math.max(a, b)), h: Math.abs(y(a) - y(b)) });
  const risk = zone(entry, stop);
  const reward = zone(entry, takeProfit);

  const line = (price: number, cls: string, label: string) => (
    <g>
      <line x1={0} x2={plotW} y1={y(price)} y2={y(price)} className={cls} strokeWidth={1} strokeDasharray="4 3" />
      <text x={plotW + 3} y={y(price) + 3} className={`${cls} text-[8px]`} style={{ fontSize: 8 }} fill="currentColor" stroke="none">
        {label} {fmtPx(price)}
      </text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${direction} ${symbol}: price around the signal with entry, stop and target`}>
      {/* risk / reward zones */}
      <rect x={0} y={risk.top} width={plotW} height={risk.h} className="fill-rose-500/10" />
      <rect x={0} y={reward.top} width={plotW} height={reward.h} className="fill-emerald-500/10" />

      {/* candles */}
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const cls = up ? "stroke-emerald-500 fill-emerald-500" : "stroke-rose-500 fill-rose-500";
        const top = y(Math.max(c.open, c.close));
        const bh = Math.max(1, Math.abs(y(c.open) - y(c.close)));
        return (
          <g key={c.datetime} className={cls}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} />
            <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={bh} />
          </g>
        );
      })}

      {/* trade plan */}
      {line(stop, "stroke-rose-500 text-rose-500", "SL")}
      {line(takeProfit, "stroke-emerald-500 text-emerald-500", "TP")}
      {line(entry, "stroke-sky-500 text-sky-500", "E")}

      {/* signal marker: ▲ under the bar for LONG, ▼ above it for SHORT */}
      {signalIndex >= 0 && signalIndex < candles.length && (
        <path
          className={direction === "LONG" ? "fill-emerald-500" : "fill-rose-500"}
          d={
            direction === "LONG"
              ? `M ${x(signalIndex) - 4} ${y(candles[signalIndex].low) + 10} l 4 -6 l 4 6 z`
              : `M ${x(signalIndex) - 4} ${y(candles[signalIndex].high) - 10} l 4 6 l 4 -6 z`
          }
        />
      )}
    </svg>
  );
}
