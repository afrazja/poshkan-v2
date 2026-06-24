"use client";

import { useEffect, useState } from "react";
import type { FxPosition } from "@/lib/types";
import { pairName, formatRate, floatingPnl, pips } from "@/lib/forex";
import { formatSignedCurrency, changeColor } from "@/lib/format";
import Modal from "@/components/Modal";
import CandleChart, { type OhlcPoint, type LevelLine } from "./CandleChart";

const RANGES = [
  { label: "1D", interval: "15min", outputsize: 96 },
  { label: "1W", interval: "1h", outputsize: 120 },
  { label: "1M", interval: "1day", outputsize: 30 },
] as const;

export default function PositionChartModal({
  position,
  rate,
  onClose,
}: {
  position: FxPosition;
  rate?: number;
  onClose: () => void;
}) {
  const [rangeIdx, setRangeIdx] = useState(1); // default 1W
  const [candles, setCandles] = useState<OhlcPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = RANGES[rangeIdx];
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/ohlc?symbol=${encodeURIComponent(position.symbol)}&interval=${r.interval}&outputsize=${r.outputsize}`)
      .then((res) => res.json())
      .then((j) => {
        if (!active) return;
        if (j.error) setError(j.error);
        else setCandles(j.candles ?? []);
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [position.symbol, rangeIdx]);

  const isOpen = position.status === "open";
  const entry = Number(position.open_rate);
  const sl = position.stop_loss != null ? Number(position.stop_loss) : null;
  const tp = position.take_profit != null ? Number(position.take_profit) : null;
  const closeRate = position.close_rate != null ? Number(position.close_rate) : null;
  const current = isOpen ? rate : (closeRate ?? undefined);

  const fmt = (n: number) => formatRate(n, position.symbol);

  const levels: LevelLine[] = [
    { price: entry, label: `Entry ${fmt(entry)}`, color: "var(--primary)" },
    ...(sl != null ? [{ price: sl, label: `SL ${fmt(sl)}`, color: "var(--negative)" }] : []),
    ...(tp != null ? [{ price: tp, label: `TP ${fmt(tp)}`, color: "var(--positive)" }] : []),
    ...(current != null
      ? [{ price: current, label: `${isOpen ? "Now" : "Exit"} ${fmt(current)}`, color: "var(--muted)", dashed: true }]
      : []),
  ];

  // Reward:risk implied by the plan (entry → stop vs entry → target).
  const risk = sl != null ? Math.abs(entry - sl) : null;
  const reward = tp != null ? Math.abs(tp - entry) : null;
  const rr = risk && reward && risk > 0 ? reward / risk : null;

  const pnl =
    isOpen && current != null
      ? floatingPnl(position.direction, Number(position.units), entry, current, position.symbol)
      : Number(position.pnl ?? 0);
  const pp = current != null ? pips(position.direction, entry, current, position.symbol) : null;

  return (
    <Modal
      title={`${pairName(position.symbol)} — ${position.direction === "LONG" ? "Long" : "Short"} ${Number(position.units).toLocaleString("en-US")}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Entry" value={fmt(entry)} />
          <Stat label={isOpen ? "Now" : "Exit"} value={current != null ? fmt(current) : "…"} />
          <Stat
            label={isOpen ? "Floating P&L" : "P&L"}
            value={formatSignedCurrency(pnl)}
            cls={changeColor(pnl)}
          />
          <Stat
            label="Pips"
            value={pp != null ? `${pp >= 0 ? "+" : ""}${pp.toFixed(1)}` : "…"}
            cls={pp != null ? changeColor(pp) : ""}
          />
          <Stat label="Reward : Risk" value={rr != null ? `${rr.toFixed(2)} : 1` : "—"} />
          <Stat label="SL / TP" value={`${sl != null ? fmt(sl) : "—"} / ${tp != null ? fmt(tp) : "—"}`} />
        </div>

        <div className="flex justify-end gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={`rounded px-2 py-0.5 text-xs ${
                i === rangeIdx ? "bg-primary text-primary-foreground" : "text-muted hover:bg-background"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center text-xs text-muted" style={{ height: 260 }}>
            Loading chart…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center px-6 text-center text-xs text-muted" style={{ height: 260 }}>
            {/credit|limit|run out/i.test(error)
              ? "Daily market-data limit reached. Try again tomorrow."
              : "Chart unavailable."}
          </div>
        ) : (
          <CandleChart candles={candles} levels={levels} height={260} formatValue={fmt} />
        )}

        <p className="text-xs text-muted">
          <span style={{ color: "var(--primary)" }}>━ entry</span> ·{" "}
          <span style={{ color: "var(--negative)" }}>━ stop-loss</span> ·{" "}
          <span style={{ color: "var(--positive)" }}>━ take-profit</span> ·{" "}
          <span className="text-muted">┄ {isOpen ? "current" : "exit"}</span>
          {rr != null && ` — the plan targets ${rr.toFixed(2)}:1 reward-to-risk.`}
        </p>
        <p className="text-center text-[11px] text-muted">Scroll or pinch to zoom · drag to pan</p>
      </div>
    </Modal>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-semibold ${cls ?? ""}`}>{value}</div>
    </div>
  );
}
