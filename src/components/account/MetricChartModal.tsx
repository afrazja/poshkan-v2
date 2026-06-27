"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import AreaChart, { type ChartPoint } from "./AreaChart";
import { ChartSkeleton } from "@/components/Skeleton";
import { formatCurrency, formatSignedCurrency, formatPercent, changeColor } from "@/lib/format";

const RANGES = ["1M", "3M", "6M", "1Y"] as const;

function axisCurrency(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  return a >= 1000 ? `${sign}$${Math.round(a).toLocaleString("en-US")}` : `${sign}$${a.toFixed(0)}`;
}

export default function MetricChartModal({
  accountId,
  metric,
  title,
  onClose,
}: {
  accountId: string;
  metric: "holdings" | "pnl";
  title: string;
  onClose: () => void;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/holdings-history?accountId=${encodeURIComponent(accountId)}&range=${range}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        if (j.error) return setError(j.error);
        const arr = (metric === "pnl" ? j.pnl : j.holdings) ?? [];
        setPoints(arr.map((p: { datetime: string; value: number }) => ({ label: p.datetime, value: p.value })));
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accountId, range, metric]);

  const fmtValue = metric === "pnl" ? formatSignedCurrency : formatCurrency;
  const changePct =
    points.length >= 2 && points[0].value !== 0
      ? ((points[points.length - 1].value - points[0].value) / Math.abs(points[0].value)) * 100
      : 0;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-sm font-medium ${points.length >= 2 ? changeColor(changePct) : "text-muted"}`}>
          {points.length >= 2 ? `${formatPercent(changePct)} over ${range}` : ""}
        </span>
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
        <ChartSkeleton height={240} />
      ) : error ? (
        <div className="flex h-[240px] items-center justify-center text-sm text-muted">Chart unavailable</div>
      ) : points.length < 2 ? (
        <div className="flex h-[240px] flex-col items-center justify-center gap-1 px-6 text-center text-sm text-muted">
          <span>Not enough history yet.</span>
          <span className="text-xs">
            This chart tracks your account from the day you created it — it will fill in as the days pass.
          </span>
        </div>
      ) : (
        <AreaChart
          points={points}
          height={240}
          formatValue={fmtValue}
          formatAxisValue={axisCurrency}
          baseline={metric === "pnl" ? 0 : undefined}
        />
      )}
    </Modal>
  );
}
