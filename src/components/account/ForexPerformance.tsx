"use client";

import { useEffect, useMemo, useState } from "react";
import type { FxPosition } from "@/lib/types";
import AreaChart, { type ChartPoint } from "./AreaChart";
import { ChartSkeleton } from "@/components/Skeleton";
import { formatCurrency, formatSignedCurrency, formatPercent, changeColor } from "@/lib/format";
import { pairName } from "@/lib/forex";

function axisCurrency(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  return a >= 1000 ? `${sign}$${Math.round(a).toLocaleString("en-US")}` : `${sign}$${a.toFixed(0)}`;
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(hrs < 10 ? 1 : 0)}h`;
  const days = hrs / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

export default function ForexPerformance({
  accountId,
  closed,
}: {
  accountId: string;
  closed: FxPosition[];
}) {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/equity-curve?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        setPoints(
          ((j.points ?? []) as { datetime: string; value: number }[]).map((p) => ({
            label: p.datetime,
            value: p.value,
          }))
        );
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accountId]);

  const s = useMemo(() => {
    const n = closed.length;
    const pnls = closed.map((p) => Number(p.pnl ?? 0));
    const wins = pnls.filter((x) => x > 0);
    const losses = pnls.filter((x) => x < 0);
    const total = pnls.reduce((a, b) => a + b, 0);
    const grossWin = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const winRate = n ? (wins.length / n) * 100 : 0;
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const expectancy = n ? total / n : 0;

    let best: FxPosition | null = null;
    let worst: FxPosition | null = null;
    for (const p of closed) {
      const v = Number(p.pnl ?? 0);
      if (best == null || v > Number(best.pnl ?? 0)) best = p;
      if (worst == null || v < Number(worst.pnl ?? 0)) worst = p;
    }

    const outcome: Record<string, number> = {};
    for (const p of closed) outcome[p.status] = (outcome[p.status] ?? 0) + 1;

    const holds = closed
      .filter((p) => p.opened_at && p.closed_at)
      .map((p) => new Date(p.closed_at as string).getTime() - new Date(p.opened_at).getTime())
      .filter((d) => d > 0);
    const avgHoldMs = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0;

    return { n, winRate, total, avgWin, avgLoss, profitFactor, expectancy, best, worst, outcome, avgHoldMs };
  }, [closed]);

  const hasHistory = points.length >= 2;
  if (s.n === 0 && !hasHistory && !loading) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold">Performance</h2>
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Your equity curve and trade stats will appear here once you have a closed trade and a day of
          history.
        </div>
      </section>
    );
  }

  const pf = s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Performance</h2>

      {/* Equity curve */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 text-sm font-semibold">Account value over time</div>
        {loading ? (
          <ChartSkeleton height={220} />
        ) : hasHistory ? (
          <AreaChart points={points} height={220} formatValue={formatCurrency} formatAxisValue={axisCurrency} />
        ) : (
          <div className="flex h-[220px] flex-col items-center justify-center gap-1 px-6 text-center text-sm text-muted">
            <span>Not enough history yet.</span>
            <span className="text-xs">A daily snapshot is recorded after each session — it fills in over time.</span>
          </div>
        )}
      </div>

      {/* Trade stats */}
      {s.n > 0 ? (
        <>
          {/* Two columns: this card lives in the desktop rail (1/3 width), where
              four-across tiles would be unreadably cramped. */}
          <div className="grid grid-cols-2 gap-2">
            <Card label="Realized P&L" value={formatSignedCurrency(s.total)} cls={changeColor(s.total)} />
            <Card label="Win rate" value={`${s.winRate.toFixed(0)}% (${s.n})`} />
            <Card label="Profit factor" value={pf} cls={s.profitFactor >= 1 ? "text-positive" : "text-negative"} />
            <Card label="Avg hold" value={s.avgHoldMs ? fmtDuration(s.avgHoldMs) : "—"} />
            <Card label="Avg win" value={formatSignedCurrency(s.avgWin)} cls="text-positive" />
            <Card label="Avg loss" value={formatSignedCurrency(-s.avgLoss)} cls="text-negative" />
            <Card label="Expectancy / trade" value={formatSignedCurrency(s.expectancy)} cls={changeColor(s.expectancy)} />
            <Card
              label="Outcomes"
              value={
                [
                  s.outcome.tp ? `${s.outcome.tp} TP` : "",
                  s.outcome.sl ? `${s.outcome.sl} SL` : "",
                  s.outcome.stopped ? `${s.outcome.stopped} stop` : "",
                  s.outcome.closed ? `${s.outcome.closed} manual` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }
            />
          </div>

          {(s.best || s.worst) && (
            <div className="grid grid-cols-1 gap-2">
              {s.best && (
                <TradeLine label="Best trade" p={s.best} />
              )}
              {s.worst && (
                <TradeLine label="Worst trade" p={s.worst} />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">No closed trades yet — stats appear after your first close.</p>
      )}
    </section>
  );
}

function Card({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 font-semibold ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

function TradeLine({ label, p }: { label: string; p: FxPosition }) {
  const v = Number(p.pnl ?? 0);
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
      <span className="text-muted">
        {label}: <span className="font-medium text-foreground">{pairName(p.symbol)} {p.direction === "LONG" ? "Long" : "Short"}</span>
      </span>
      <span className={`font-semibold ${changeColor(v)}`}>{formatSignedCurrency(v)}</span>
    </div>
  );
}
