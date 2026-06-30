"use client";

import type { ReactNode } from "react";
import type { FxPosition } from "@/lib/types";
import { floatingPnl, marginFor, pips } from "@/lib/forex";
import { formatCurrency, formatSignedCurrency, formatPercent, changeColor } from "@/lib/format";
import SourceBadge from "./SourceBadge";

// Effective leverage = USD notional ÷ reserved margin (currency-aware via marginFor,
// so it's correct for forex crosses as well as USD-denominated stocks/crypto).
function levOf(p: FxPosition): number {
  const m = Number(p.margin);
  return m > 0 ? Math.max(1, Math.round(marginFor(Number(p.units), Number(p.open_rate), 1, p.symbol) / m)) : 0;
}

function fmtOpened(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

// One shared, expandable open-position card for every market. Forex shows pips and
// makes the pair name open a chart; stocks/crypto show % and a plain title. The
// rest — direction, source badge, P&L, leverage, margin, opened time, SL/TP, close
// — is identical so the two panels can never drift apart again.
export default function PositionCard({
  position,
  title,
  rate,
  unitLabel,
  fmtPrice,
  metric,
  surfaceClass = "bg-card",
  expanded,
  onToggle,
  onTitleClick,
  onEditSltp,
  onClose,
  closing,
  autoCloseLabel,
  sltpExtra,
}: {
  position: FxPosition;
  title: string;
  rate?: number;
  unitLabel: string;
  fmtPrice: (n: number) => string;
  metric: "pips" | "percent";
  surfaceClass?: string;
  expanded: boolean;
  onToggle: () => void;
  onTitleClick?: () => void;
  onEditSltp: () => void;
  onClose: () => void;
  closing: boolean;
  autoCloseLabel?: string | null;
  sltpExtra?: ReactNode;
}) {
  const p = position;
  const fl = rate != null ? floatingPnl(p.direction, Number(p.units), Number(p.open_rate), rate, p.symbol) : null;
  const lev = levOf(p);
  const pip = rate != null && metric === "pips" ? pips(p.direction, Number(p.open_rate), rate, p.symbol) : null;
  const pct =
    rate != null && metric === "percent" && Number(p.open_rate) > 0
      ? ((rate - Number(p.open_rate)) / Number(p.open_rate)) * 100 * (p.direction === "SHORT" ? -1 : 1)
      : null;
  const metricText = pip != null ? `${pip >= 0 ? "+" : ""}${pip.toFixed(1)} pips` : pct != null ? formatPercent(pct) : null;

  return (
    <div className={`rounded-xl border border-border ${surfaceClass}`}>
      {/* Collapsed header — tap the row to expand (title may open a chart) */}
      <div onClick={onToggle} className="flex cursor-pointer items-center justify-between gap-2 p-3">
        <span className="flex flex-wrap items-center gap-1.5 font-semibold">
          {onTitleClick ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTitleClick();
              }}
              className="hover:underline"
              title="View chart"
            >
              {title}
            </button>
          ) : (
            <span>{title}</span>
          )}
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              p.direction === "LONG" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
            }`}
          >
            {p.direction === "LONG" ? "Long" : "Short"}
          </span>
          <SourceBadge source={p.source} />
        </span>
        <span className="flex items-center gap-2">
          <span className={`font-medium ${fl != null ? changeColor(fl) : ""}`}>
            {fl != null ? formatSignedCurrency(fl) : "…"}
            {metricText && <span className="ml-1 text-xs">({metricText})</span>}
          </span>
          <span className={`text-lg leading-none text-muted transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
        </span>
      </div>

      {expanded && (
        <div className="space-y-1.5 border-t border-border p-3 pt-2">
          <div className="text-xs text-muted">
            {Number(p.units).toLocaleString("en-US")} {unitLabel} · {fmtPrice(Number(p.open_rate))} →{" "}
            {rate != null ? fmtPrice(rate) : "…"} · margin {formatCurrency(Number(p.margin))} · {lev}× lev
            {autoCloseLabel && <span className="ml-1">· ⏱ {autoCloseLabel}</span>}
          </div>
          <div className="text-[11px] text-muted">Opened {fmtOpened(p.opened_at)}</div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">
              SL {p.stop_loss != null ? fmtPrice(Number(p.stop_loss)) : "—"} · TP{" "}
              {p.take_profit != null ? fmtPrice(Number(p.take_profit)) : "—"}
            </span>
            <span className="flex shrink-0 gap-1.5">
              <button
                onClick={onEditSltp}
                className="rounded-md border border-border px-2 py-1 font-medium hover:bg-background"
              >
                SL/TP
              </button>
              <button
                onClick={onClose}
                disabled={closing}
                className="rounded-md border border-border px-2 py-1 font-medium hover:bg-background disabled:opacity-50"
              >
                {closing ? "Closing…" : "Close"}
              </button>
            </span>
          </div>
          {sltpExtra}
        </div>
      )}
    </div>
  );
}
