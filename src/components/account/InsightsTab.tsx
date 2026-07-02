"use client";

import { useMemo, useState } from "react";
import type { Position, Quote } from "@/lib/types";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";
import PerformanceCard from "./PerformanceCard";

const COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899",
  "#14b8a6", "#ef4444", "#6366f1", "#84cc16", "#06b6d4",
];
const OTHER_COLOR = "#94a3b8";

export default function InsightsTab({
  accountId,
  positions,
  quotes,
  cash,
  todayPnlPct,
  onSelect,
}: {
  accountId: string;
  positions: Position[];
  quotes: Record<string, Quote>;
  cash: number;
  todayPnlPct: number;
  onSelect: (symbol: string) => void;
}) {
  const [showOther, setShowOther] = useState(false);
  const rows = useMemo(() => {
    return positions.map((p) => {
      const q = quotes[p.symbol.toUpperCase()];
      const price = q?.price ?? Number(p.avg_cost);
      const value = Number(p.quantity) * price;
      const avg = Number(p.avg_cost);
      const pnlPct = avg > 0 ? ((price - avg) / avg) * 100 : 0;
      return { symbol: p.symbol, value, pnlPct };
    });
  }, [positions, quotes]);

  const holdingsValue = rows.reduce((s, r) => s + r.value, 0);
  const totalValue = holdingsValue + cash;

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        Buy some holdings to see allocation, performance, and benchmark insights.
      </div>
    );
  }

  const alloc = [...rows]
    .sort((a, b) => b.value - a.value)
    .map((r) => ({
      label: r.symbol,
      value: r.value,
      pct: totalValue > 0 ? (r.value / totalValue) * 100 : 0,
    }));
  // Group the sub-1% tail into a single "Other" row so the list answers
  // "where is my money concentrated?" without 25 rows of pocket change.
  // Grouping a tail of one would be sillier than just showing it.
  let majors = alloc.filter((s) => s.pct >= 1);
  let tail = alloc.filter((s) => s.pct < 1);
  if (majors.length === 0 || tail.length === 1) {
    majors = alloc;
    tail = [];
  }
  const segments = majors.map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));
  const otherValue = tail.reduce((s, r) => s + r.value, 0);
  const otherPct = tail.reduce((s, r) => s + r.pct, 0);
  const cashPct = totalValue > 0 ? (cash / totalValue) * 100 : 0;

  const byPerf = [...rows].sort((a, b) => b.pnlPct - a.pnlPct);
  const best = byPerf.slice(0, 3);
  const worst = byPerf.slice(-3).reverse().filter((r) => !best.includes(r));

  const spy = quotes["SPY"];

  return (
    <div className="space-y-4">
      {/* Performance vs benchmark (from daily snapshots) */}
      <PerformanceCard accountId={accountId} />

      {/* Allocation */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Allocation</h3>
        <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full">
          {segments.map((s) => (
            <div key={s.label} style={{ width: `${s.pct}%`, backgroundColor: s.color }} title={`${s.label} ${s.pct.toFixed(1)}%`} />
          ))}
          {otherPct > 0 && (
            <div
              style={{ width: `${otherPct}%`, backgroundColor: OTHER_COLOR }}
              title={`Other (${tail.length} positions) ${otherPct.toFixed(1)}%`}
            />
          )}
          {cashPct > 0 && <div style={{ width: `${cashPct}%`, backgroundColor: "var(--muted)" }} title={`Cash ${cashPct.toFixed(1)}%`} />}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {segments.map((s) => (
            <button
              key={s.label}
              onClick={() => onSelect(s.label)}
              className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-background"
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-medium">{s.label}</span>
              </span>
              <span className="text-muted">
                {formatCurrency(s.value)} · {s.pct.toFixed(1)}%
              </span>
            </button>
          ))}
          {tail.length > 0 && (
            <button
              onClick={() => setShowOther((v) => !v)}
              className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-background"
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OTHER_COLOR }} />
                <span className="font-medium">
                  Other · {tail.length} positions{" "}
                  <span className={`inline-block text-muted transition-transform ${showOther ? "rotate-90" : ""}`}>›</span>
                </span>
              </span>
              <span className="text-muted">
                {formatCurrency(otherValue)} · {otherPct.toFixed(1)}%
              </span>
            </button>
          )}
          <div className="flex items-center justify-between rounded-md px-2 py-1 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-muted" />
              <span className="font-medium">Cash</span>
            </span>
            <span className="text-muted">
              {formatCurrency(cash)} · {cashPct.toFixed(1)}%
            </span>
          </div>
        </div>
        {showOther && tail.length > 0 && (
          <div className="mt-2 grid grid-cols-1 gap-1 border-t border-border pt-2 sm:grid-cols-2">
            {tail.map((s) => (
              <button
                key={s.label}
                onClick={() => onSelect(s.label)}
                className="flex items-center justify-between rounded-md px-2 py-0.5 text-xs text-muted hover:bg-background hover:text-foreground"
              >
                <span>{s.label}</span>
                <span>
                  {formatCurrency(s.value)} · {s.pct.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Best / worst */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Performers (total P&L %)</h3>
          <Perf title="Top" rows={best} onSelect={onSelect} />
          {worst.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <Perf title="Bottom" rows={worst} onSelect={onSelect} />
            </div>
          )}
        </div>

        {/* Benchmark */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Today vs S&P 500</h3>
          <div className="space-y-3">
            <Bench label="Your portfolio" pct={todayPnlPct} />
            <Bench label="S&P 500 (SPY)" pct={spy?.percentChange} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Today&apos;s move of your holdings versus the broad market.
          </p>
        </div>
      </div>
    </div>
  );
}

function Perf({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: { symbol: string; pnlPct: number }[];
  onSelect: (symbol: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <button
            key={r.symbol}
            onClick={() => onSelect(r.symbol)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-background"
          >
            <span className="font-medium">{r.symbol}</span>
            <span className={changeColor(r.pnlPct)}>{formatPercent(r.pnlPct)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Bench({ label, pct }: { label: string; pct?: number }) {
  const v = pct ?? 0;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-semibold ${pct == null ? "text-muted" : changeColor(v)}`}>
        {pct == null ? "…" : formatPercent(v)}
      </span>
    </div>
  );
}
