"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";
import AreaChart, { type ChartPoint } from "./AreaChart";

const RANGES = ["1M", "3M", "6M", "1Y"] as const;

function axisValue(v: number): string {
  if (Math.abs(v) >= 1000) return `$${Math.round(v).toLocaleString("en-US")}`;
  return `$${v.toFixed(0)}`;
}

export default function AccountValueChart({ accountId }: { accountId: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/account-history?accountId=${encodeURIComponent(accountId)}&range=${range}`)
      .then((res) => res.json())
      .then((j) => {
        if (!active) return;
        if (j.error) setError(j.error);
        else
          setPoints(
            (j.points ?? []).map((p: { datetime: string; value: number }) => ({
              label: p.datetime,
              value: p.value,
            }))
          );
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accountId, range]);

  const changePct = useMemo(() => {
    if (points.length < 2) return 0;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    return first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  }, [points]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Portfolio value</h2>
          {points.length >= 2 && (
            <span className={`text-xs font-medium ${changeColor(changePct)}`}>
              {formatPercent(changePct)} over {range}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
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
      ) : error ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-muted">
          Performance unavailable
        </div>
      ) : points.length < 2 ? (
        <div className="flex h-[200px] items-center justify-center px-6 text-center text-xs text-muted">
          Your performance line will fill in as your portfolio value changes day to day.
        </div>
      ) : (
        <AreaChart points={points} height={200} formatValue={formatCurrency} formatAxisValue={axisValue} />
      )}
    </div>
  );
}
