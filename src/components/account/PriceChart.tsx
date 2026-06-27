"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";
import AreaChart, { type ChartPoint } from "./AreaChart";
import { ChartSkeleton } from "@/components/Skeleton";

interface Candle {
  datetime: string;
  close: number;
}

const RANGES = [
  { label: "1D", interval: "5min", outputsize: 78 },
  { label: "1M", interval: "1day", outputsize: 22 },
  { label: "3M", interval: "1day", outputsize: 66 },
  { label: "6M", interval: "1day", outputsize: 130 },
  { label: "1Y", interval: "1week", outputsize: 52 },
] as const;

function axisPrice(v: number): string {
  if (Math.abs(v) >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
}

// Time-of-day labels for the intraday (1D) view.
function formatTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function PriceChart({ symbol, height = 220 }: { symbol: string; height?: number }) {
  const [rangeIdx, setRangeIdx] = useState(2); // default 3M
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = RANGES[rangeIdx];
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/timeseries?symbol=${encodeURIComponent(symbol)}&interval=${r.interval}&outputsize=${r.outputsize}`)
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

  const points: ChartPoint[] = useMemo(
    () => candles.map((c) => ({ label: c.datetime, value: c.close })),
    [candles]
  );
  const changePct =
    points.length >= 2 ? ((points[points.length - 1].value - points[0].value) / points[0].value) * 100 : 0;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${points.length >= 2 ? changeColor(changePct) : "text-muted"}`}>
            {points.length >= 2 ? `${formatPercent(changePct)} · ${RANGES[rangeIdx].label}` : ""}
          </span>
          <a
            href={`/chart/${encodeURIComponent(symbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
            title="Open the full TradingView chart in a new tab"
          >
            ↗ Advanced
          </a>
        </div>
        <div className="flex flex-wrap gap-1">
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

      {loading ? (
        <ChartSkeleton height={height} />
      ) : error ? (
        <div className="flex items-center justify-center px-6 text-center text-xs text-muted" style={{ height }}>
          {/credit|limit|run out/i.test(error)
            ? "Daily market-data limit reached. Charts will be available again tomorrow."
            : "Chart unavailable."}
        </div>
      ) : (
        <AreaChart
          points={points}
          height={height}
          formatValue={formatCurrency}
          formatAxisValue={axisPrice}
          formatLabel={RANGES[rangeIdx].label === "1D" ? formatTime : undefined}
        />
      )}
    </div>
  );
}
