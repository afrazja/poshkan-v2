"use client";

import { useEffect, useState } from "react";
import { formatPercent, changeColor } from "@/lib/format";
import AreaChart, { type ChartPoint } from "./AreaChart";

const RANGES = ["1M", "3M", "6M", "1Y"] as const;

interface PerfPoint {
  date: string;
  portfolio: number;
  spy: number | null;
}

// True performance history (% return) from daily snapshots vs the S&P 500.
export default function PerformanceCard({ accountId }: { accountId: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("3M");
  const [points, setPoints] = useState<PerfPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/performance?accountId=${encodeURIComponent(accountId)}&range=${range}`)
      .then((r) => r.json())
      .then((j) => active && setPoints(j.points ?? []))
      .catch(() => active && setPoints([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accountId, range]);

  const portfolio: ChartPoint[] = points.map((p) => ({ label: p.date, value: p.portfolio }));
  const spy: ChartPoint[] = points.map((p) => ({ label: p.date, value: p.spy ?? NaN }));
  const last = points[points.length - 1];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Performance vs S&P 500</h3>
          <div className="mt-0.5 flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-positive" />
              <span className={last ? changeColor(last.portfolio) : "text-muted"}>
                You {last ? formatPercent(last.portfolio) : ""}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded border-b-2 border-dashed border-primary" />
              <span className="text-primary">
                S&P 500 {last?.spy != null ? formatPercent(last.spy) : ""}
              </span>
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-0.5 text-xs ${
                r === range ? "bg-primary text-primary-foreground" : "text-muted hover:bg-background"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-muted">Loading…</div>
      ) : points.length < 2 ? (
        <div className="flex h-[200px] flex-col items-center justify-center gap-1 px-6 text-center text-xs text-muted">
          <span>Not enough history yet.</span>
          <span>
            A snapshot of this account&apos;s value is recorded every night — this chart draws
            itself as the days accumulate.
          </span>
        </div>
      ) : (
        <AreaChart
          points={portfolio}
          benchmark={spy}
          height={200}
          formatValue={(v) => formatPercent(v)}
          formatAxisValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
          valueLabel="You"
          benchmarkLabel="S&P 500"
        />
      )}
    </div>
  );
}
