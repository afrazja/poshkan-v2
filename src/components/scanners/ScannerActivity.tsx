"use client";

import { useState } from "react";
import { symbolLabel } from "@/lib/assets";

export interface ActivityItem {
  id: string;
  createdAt: string;
  accountName: string;
  icon: string;
  scanner: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  executed: boolean;
  entry: number | null;
  takeProfit: number | null;
  reason: string | null;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const fmtNum = (n: number | null) =>
  n == null ? "—" : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5);

// One chronological feed of every scanner signal (traded or alert) across all
// the user's accounts — built from data already loaded on the Scanners page.
export default function ScannerActivity({ items }: { items: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 40);
  if (sorted.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold">📋 Recent scanner activity</span>
        <span className="text-xs text-muted">{open ? "Hide" : `${sorted.length} events`}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-1">
          {sorted.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate">
                <span className="text-muted">{it.accountName}</span> · {it.icon} {it.scanner} ·{" "}
                <span className={it.direction === "LONG" ? "text-emerald-500" : "text-rose-500"}>
                  {it.direction}
                </span>{" "}
                {symbolLabel(it.symbol)}
                {it.entry != null && (
                  <span className="text-muted">
                    {" "}
                    · {fmtNum(it.entry)} → TP {fmtNum(it.takeProfit)}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {it.executed ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                    traded
                  </span>
                ) : (
                  <span className="rounded bg-muted/20 px-1.5 py-0.5 text-muted">alert</span>
                )}
                <span className="text-muted">{ago(it.createdAt)}</span>
              </span>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-muted">
            Every setup each scanner fired — <span className="text-emerald-600 dark:text-emerald-400">traded</span> means a
            position was opened; <span className="text-muted">alert</span> means it only notified (alert mode, or a risk
            limit blocked the trade).
          </p>
        </div>
      )}
    </div>
  );
}
