"use client";

import { useState } from "react";
import { symbolLabel } from "@/lib/assets";
import SignalMiniChart from "./SignalMiniChart";

// The "Recent signals" list shared by every scanner card. Each row expands
// into a mini candlestick chart of the bars around the signal with the trade
// plan (entry / SL / TP) drawn on it — candles load only when a row is opened.

export interface SignalLite {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number | null;
  stop: number | null;
  take_profit: number | null;
  executed: boolean;
  created_at: string;
}

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5);

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function SignalHistory({ signals, interval }: { signals: SignalLite[]; interval: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (signals.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium text-muted">Recent signals</div>
      <div className="space-y-1">
        {signals.slice(0, 8).map((sig) => {
          const open = openId === sig.id;
          return (
            <div key={sig.id} className="rounded-lg border border-border bg-background text-xs">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : sig.id)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-left"
                aria-expanded={open}
                title={open ? "Hide chart" : "Show this signal on a chart"}
              >
                <span>
                  <span className={sig.direction === "LONG" ? "text-emerald-500" : "text-rose-500"}>
                    {sig.direction}
                  </span>{" "}
                  {symbolLabel(sig.symbol)} · {fmtNum(sig.entry)} → TP {fmtNum(sig.take_profit)}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  {sig.executed ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                      traded
                    </span>
                  ) : (
                    <span className="rounded bg-muted/20 px-1.5 py-0.5">alert</span>
                  )}
                  {ago(sig.created_at)}
                  <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                </span>
              </button>
              {open && (
                <div className="border-t border-border px-2 pb-1 pt-2">
                  <SignalMiniChart
                    symbol={sig.symbol}
                    interval={interval}
                    direction={sig.direction}
                    entry={sig.entry}
                    stop={sig.stop}
                    takeProfit={sig.take_profit}
                    createdAt={sig.created_at}
                  />
                  <p className="pb-1 pt-0.5 text-[10px] text-muted">
                    Entry (blue) · stop (red) · target (green) — shaded bands show the risk and reward zones.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
