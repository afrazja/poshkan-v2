"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";

interface Candle {
  datetime: string;
  close: number;
}

const RANGES = [
  { label: "1M", interval: "1day", outputsize: 22 },
  { label: "3M", interval: "1day", outputsize: 66 },
  { label: "6M", interval: "1day", outputsize: 130 },
  { label: "1Y", interval: "1week", outputsize: 52 },
] as const;

const W = 600;
const H = 150;
const PAD = 8;

export default function PriceChart({ symbol }: { symbol: string }) {
  const [rangeIdx, setRangeIdx] = useState(1); // default 3M
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = RANGES[rangeIdx];
    let active = true;
    setLoading(true);
    setError(null);
    fetch(
      `/api/timeseries?symbol=${encodeURIComponent(symbol)}&interval=${r.interval}&outputsize=${r.outputsize}`
    )
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
  }, [symbol, rangeIdx]);

  const { linePath, areaPath, periodChangePct, up } = useMemo(() => {
    const closes = candles.map((c) => c.close).filter((n) => Number.isFinite(n));
    if (closes.length < 2) {
      return { linePath: "", areaPath: "", periodChangePct: 0, up: true };
    }
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const n = closes.length;

    const pts = closes.map((close, i) => {
      const x = PAD + (i / (n - 1)) * (W - 2 * PAD);
      const y = PAD + (1 - (close - min) / range) * (H - 2 * PAD);
      return [x, y] as const;
    });

    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[n - 1][0].toFixed(1)} ${H - PAD} L${pts[0][0].toFixed(1)} ${H - PAD} Z`;
    const changePct = ((closes[n - 1] - closes[0]) / closes[0]) * 100;

    return { linePath: line, areaPath: area, periodChangePct: changePct, up: changePct >= 0 };
  }, [candles]);

  const stroke = up ? "var(--positive)" : "var(--negative)";
  const gradientId = `grad-${symbol.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-medium ${changeColor(periodChangePct)}`}>
          {candles.length >= 2 ? `${formatPercent(periodChangePct)} · ${RANGES[rangeIdx].label}` : ""}
        </span>
        <div className="flex gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={`rounded px-2 py-0.5 text-xs ${
                i === rangeIdx ? "bg-primary text-primary-foreground" : "text-muted hover:bg-card"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[150px] w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            Loading chart…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            Chart unavailable
          </div>
        ) : candles.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            Not enough data
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
              d={linePath}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {candles.length >= 2 && (
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{formatCurrency(candles[0].close)}</span>
          <span>{formatCurrency(candles[candles.length - 1].close)}</span>
        </div>
      )}
    </div>
  );
}
