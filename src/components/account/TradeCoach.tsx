"use client";

import { GraduationCap } from "lucide-react";
import { isUsdBase } from "@/lib/forex";
import { formatCurrency } from "@/lib/format";
import type { FxPosition } from "@/lib/types";

// Rule-based trading coach: deterministic observations computed from the
// user's own closed trades — no AI, no opinions, just their ledger talking
// back. Shown once there are enough closed trades to mean something.
//
// The three habits it watches are the ones that decide whether a beginner
// survives: using stops, sizing risk, and the win/loss size ratio.

const MIN_TRADES = 3;

// Dollar risk a trade accepted at entry: distance to the stop × size.
function riskUsd(p: FxPosition): number | null {
  if (p.stop_loss == null) return null;
  const dist = Math.abs(Number(p.open_rate) - Number(p.stop_loss));
  const raw = dist * Number(p.units);
  return isUsdBase(p.symbol) && Number(p.open_rate) > 0 ? raw / Number(p.open_rate) : raw;
}

export default function TradeCoach({ positions, cash }: { positions: FxPosition[]; cash: number }) {
  const closed = positions
    .filter((p) => p.status !== "open")
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));
  if (closed.length < MIN_TRADES) return null;

  const recent = closed.slice(0, 20); // habits are about the recent past, not ancient history
  const n = recent.length;
  const withStop = recent.filter((p) => p.stop_loss != null).length;
  const stopPct = withStop / n;

  const wins = recent.filter((p) => Number(p.pnl ?? 0) > 0);
  const losses = recent.filter((p) => Number(p.pnl ?? 0) < 0);
  const avgWin = wins.length ? wins.reduce((s, p) => s + Number(p.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, p) => s + Number(p.pnl), 0) / losses.length) : 0;

  const risks = recent.map(riskUsd).filter((r): r is number => r != null && r > 0).sort((a, b) => a - b);
  const medianRisk = risks.length ? risks[Math.floor(risks.length / 2)] : null;
  const medianRiskPct = medianRisk != null && cash > 0 ? (medianRisk / cash) * 100 : null;

  // At most 3 observations, worst habit first. Each states the fact, then the fix.
  const notes: string[] = [];
  if (stopPct < 0.8) {
    notes.push(
      `${n - withStop} of your last ${n} trades had no stop-loss. Decide your exit before you enter — a trade without a stop is a bet without a limit.`
    );
  }
  if (medianRiskPct != null && medianRiskPct > 3) {
    notes.push(
      `Your typical trade risks ~${medianRiskPct.toFixed(1)}% of your cash at the stop. Professionals keep it at 1–2% — at ${medianRiskPct.toFixed(0)}%, a short losing streak digs a hole that's hard to climb out of.`
    );
  }
  if (wins.length >= 3 && losses.length >= 3 && avgLoss > avgWin * 1.5) {
    notes.push(
      `Your average loss (${formatCurrency(avgLoss)}) is ${(avgLoss / avgWin).toFixed(1)}× your average win (${formatCurrency(avgWin)}) — the classic pattern of cutting winners early and letting losers run. Let the take-profit do its job.`
    );
  }
  if (notes.length === 0) {
    notes.push(
      `Solid discipline across your last ${n} trades: stops in place and healthy win/loss sizes. Consistency is the skill — keep the process identical when a streak (either kind) shows up.`
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
        Coach
        <span className="font-normal text-muted">· from your last {n} closed trades</span>
      </h2>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat
          label="Stops used"
          value={`${Math.round(stopPct * 100)}%`}
          warn={stopPct < 0.8}
        />
        <Stat
          label="Typical risk"
          value={
            medianRiskPct == null
              ? "—"
              : medianRiskPct < 0.05
                ? "<0.1%" // tiny-but-real risk would render as a broken-looking "0.0%"
                : `${medianRiskPct.toFixed(1)}%`
          }
          warn={medianRiskPct != null && medianRiskPct > 3}
        />
        <Stat
          label="Avg win : loss"
          value={avgWin > 0 && avgLoss > 0 ? `${(avgWin / avgLoss).toFixed(2)}` : "—"}
          warn={avgWin > 0 && avgLoss > avgWin * 1.5}
        />
      </div>

      <ul className="space-y-2">
        {notes.slice(0, 3).map((t, i) => (
          <li key={i} className="rounded-lg bg-background px-3 py-2 text-xs leading-relaxed text-muted">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
    </div>
  );
}
