"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, FlaskConical, Pause, Pencil, Play, Plus, Radio, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { symbolLabel } from "@/lib/assets";
import { describeStrategy, type CustomStrategyRow } from "@/lib/custom-strategy-types";
import { deleteCustomStrategy, setCustomStrategyLive } from "@/app/dashboard/scanners/custom-actions";

export interface CustomStrategySignalSummary {
  id: string;
  strategyId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  createdAt: string;
}

export default function CustomStrategiesPanel({
  strategies,
  signals,
  accounts,
  mode = "all",
}: {
  strategies: CustomStrategyRow[];
  signals: CustomStrategySignalSummary[];
  accounts: { id: string; name: string; type: string }[];
  mode?: "all" | "live" | "results";
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<CustomStrategyRow | null>(null);
  const visible = strategies.filter((strategy) => {
    if (mode === "live") return strategy.status === "live";
    if (mode === "results") return strategy.lastBacktest != null;
    return true;
  });

  async function toggle(strategy: CustomStrategyRow) {
    setBusyId(strategy.id);
    setError(null);
    const response = await setCustomStrategyLive(strategy.id, strategy.status !== "live");
    if (response.error) setError(response.error);
    setBusyId(null);
    router.refresh();
  }

  async function remove() {
    if (!deleteFor) return;
    setBusyId(deleteFor.id);
    setError(null);
    const response = await deleteCustomStrategy(deleteFor.id);
    if (response.error) setError(response.error);
    setDeleteFor(null);
    setBusyId(null);
    router.refresh();
  }

  if (visible.length === 0) {
    const copy =
      mode === "live"
        ? ["No live custom experiments", "Backtest one of your strategies, then start its paper alerts."]
        : mode === "results"
          ? ["No custom results yet", "Run a backtest to create the first evidence for one of your ideas."]
          : ["Build your first scanner", "Combine candle patterns and indicators into a rule set you can test and revise."];
    return (
      <div className="border-y border-dashed border-border py-10 text-center">
        <FlaskConical className="mx-auto text-muted" size={30} aria-hidden />
        <h2 className="mt-3 text-sm font-semibold">{copy[0]}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{copy[1]}</p>
        <Link href="/dashboard/scanners/new" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Plus size={16} aria-hidden /> New strategy
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">{error}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((strategy) => {
          const account = accounts.find((item) => item.id === strategy.accountId);
          const result = strategy.lastBacktest;
          const strategySignals = signals.filter((signal) => signal.strategyId === strategy.id);
          return (
            <article key={strategy.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold">{strategy.name}</h2>
                    <StatusBadge status={strategy.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {account?.name ?? "Paper account"} / {strategy.timeframe === "15min" ? "15 min" : strategy.timeframe === "1h" ? "1 hour" : "1 day"} / v{strategy.version}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link href={`/dashboard/scanners/${strategy.id}`} aria-label={`Edit ${strategy.name}`} title="Edit strategy" className="rounded-md p-2 text-muted hover:bg-background hover:text-foreground">
                    <Pencil size={15} aria-hidden />
                  </Link>
                  <button onClick={() => setDeleteFor(strategy)} aria-label={`Delete ${strategy.name}`} title="Delete strategy" className="rounded-md p-2 text-muted hover:bg-background hover:text-negative">
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">
                {strategy.description || describeStrategy(strategy)}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {strategy.symbols.map((symbol) => <span key={symbol} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted">{symbolLabel(symbol)}</span>)}
              </div>

              {result ? (
                <dl className="mt-4 grid grid-cols-4 gap-2 border-y border-border py-3 text-center">
                  <ResultStat label="Net R" value={`${result.totalR >= 0 ? "+" : ""}${result.totalR}R`} tone={result.totalR >= 0 ? "positive" : "negative"} />
                  <ResultStat label="Trades" value={String(result.n)} />
                  <ResultStat label="Win" value={`${Math.round(result.winRate * 100)}%`} />
                  <ResultStat label="Drawdown" value={`${result.maxDrawdownR}R`} />
                </dl>
              ) : (
                <div className="mt-4 border-y border-border py-3 text-xs text-muted">Not backtested yet</div>
              )}

              {strategy.status === "live" && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-positive">
                  <Radio size={13} aria-hidden /> Watching now / {strategySignals.length} recent signal{strategySignals.length === 1 ? "" : "s"}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/dashboard/scanners/${strategy.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background">
                  {result ? <BarChart3 size={14} aria-hidden /> : <Play size={14} aria-hidden />}{result ? "Review experiment" : "Finish and test"}
                </Link>
                {result && (
                  <button onClick={() => toggle(strategy)} disabled={busyId === strategy.id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${strategy.status === "live" ? "border border-border" : "bg-positive text-white"}`}>
                    {strategy.status === "live" ? <Pause size={14} aria-hidden /> : <Radio size={14} aria-hidden />}
                    {busyId === strategy.id ? "Updating..." : strategy.status === "live" ? "Pause alerts" : "Start paper alerts"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {deleteFor && (
        <Modal title="Delete this experiment?" onClose={() => setDeleteFor(null)}>
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{deleteFor.name}</span> and its paper-alert history will be permanently removed.
          </p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => setDeleteFor(null)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-background">Cancel</button>
            <button onClick={remove} disabled={busyId === deleteFor.id} className="flex-1 rounded-lg bg-negative py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busyId === deleteFor.id ? "Deleting..." : "Delete"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CustomStrategyRow["status"] }) {
  const style = status === "live" ? "bg-positive/15 text-positive" : status === "backtested" ? "bg-primary/15 text-primary" : status === "paused" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted/15 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${style}`}>{status}</span>;
}

function ResultStat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return <div><dt className="text-[9px] uppercase text-muted">{label}</dt><dd className={`mt-0.5 text-xs font-semibold ${tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : ""}`}>{value}</dd></div>;
}
