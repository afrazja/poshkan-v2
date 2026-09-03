"use client";

import { useEffect, useState } from "react";
import { formatPercent, changeColor } from "@/lib/format";
import AreaChart, { type ChartPoint } from "./AreaChart";

const RANGES = [
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 180 },
  { key: "1Y", days: 365 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

interface PerfPoint {
  date: string;
  portfolio: number;
  spy: number | null;
}

// True performance history (% return) from daily snapshots vs the S&P 500.
export default function PerformanceCard({ accountId }: { accountId: string }) {
  const [range, setRange] = useState<RangeKey>("1M");
  const [points, setPoints] = useState<PerfPoint[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickedRange, setPickedRange] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/performance?accountId=${encodeURIComponent(accountId)}&range=${range}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        setPoints(j.points ?? []);
        setSince(j.since ?? null);
      })
      .catch(() => active && setPoints([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accountId, range]);

  const portfolio: ChartPoint[] = points.map((p) => ({ label: p.date, value: p.portfolio }));
  const spy: ChartPoint[] = points.map((p) => ({ label: p.date, value: p.spy ?? NaN }));
  const last = points[points.length - 1];

  // How much history exists at all. A range longer than this would draw the
  // same short window under a longer name — which is how a two-week chart ends
  // up labelled 1Y and disagreeing with every other site on the internet.
  const daysOfHistory = since
    ? Math.max(1, Math.round((Date.now() - Date.parse(`${since}T00:00:00Z`)) / 86_400_000))
    : 0;
  // Offer every range the data fills, plus the first one it doesn't, so the
  // whole history is always reachable from a single button.
  const lastEnabled = Math.max(0, RANGES.findIndex((r) => r.days >= daysOfHistory));
  const enabled = (i: number) => !since || i <= lastEnabled;

  // Land on the longest range that actually holds data, until the user picks.
  useEffect(() => {
    if (pickedRange || !since) return;
    const best = RANGES[lastEnabled]?.key;
    if (best && best !== range) setRange(best);
  }, [since, lastEnabled, pickedRange, range]);

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
          {RANGES.map((r, i) => {
            const on = enabled(i);
            return (
              <button
                key={r.key}
                disabled={!on}
                title={on ? undefined : `Only ${daysOfHistory} days of history so far`}
                onClick={() => {
                  setPickedRange(true);
                  setRange(r.key);
                }}
                className={`rounded px-2 py-0.5 text-xs ${
                  r.key === range
                    ? "bg-primary text-primary-foreground"
                    : on
                      ? "text-muted hover:bg-background"
                      : "cursor-not-allowed text-muted/35"
                }`}
              >
                {r.key}
              </button>
            );
          })}
        </div>
      </div>

      {/* Say what the axis actually covers, so it can never be mistaken for a
          longer window than the account has lived through. */}
      {since && points.length >= 2 && (
        <p className="mb-2 text-[11px] text-muted">
          {daysOfHistory} days of history · since {new Date(`${since}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {lastEnabled < RANGES.length - 1 && " · longer ranges unlock as the days accumulate"}
        </p>
      )}

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
        <>
          <AreaChart
            points={portfolio}
            benchmark={spy}
            height={200}
            formatValue={(v) => formatPercent(v)}
            formatAxisValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
            valueLabel="You"
            benchmarkLabel="S&P 500"
          />
          <p className="mt-2 text-[11px] text-muted">
            Time-weighted since {points[0]?.date}: deposits and added cash don&apos;t count as
            gains — only what your positions actually did.
          </p>
        </>
      )}
    </div>
  );
}
