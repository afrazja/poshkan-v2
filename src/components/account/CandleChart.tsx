"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface OhlcPoint {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// A horizontal reference line drawn across the chart (entry / SL / TP / current).
export interface LevelLine {
  price: number;
  label: string;
  color: string; // a CSS color or var(), e.g. "var(--negative)"
  dashed?: boolean;
}

const PAD = { top: 12, right: 72, bottom: 24, left: 58 };
const Y_TICKS = 4;

function defaultFormatLabel(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CandleChart({
  candles,
  levels = [],
  height = 260,
  formatValue,
  formatLabel = defaultFormatLabel,
}: {
  candles: OhlcPoint[];
  levels?: LevelLine[];
  height?: number;
  formatValue: (n: number) => string;
  formatLabel?: (s: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const data = candles.filter(
      (c) =>
        Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close)
    );
    const n = data.length;
    if (n < 2 || width <= 0) return null;

    let min = Math.min(...data.map((c) => c.low));
    let max = Math.max(...data.map((c) => c.high));
    for (const l of levels) {
      if (!Number.isFinite(l.price)) continue;
      min = Math.min(min, l.price);
      max = Math.max(max, l.price);
    }
    const span = max - min || Math.abs(min) || 1;
    min -= span * 0.06;
    max += span * 0.06;
    const range = max - min;

    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const step = plotW / n;
    const bodyW = Math.max(1, Math.min(14, step * 0.6));
    const xAt = (i: number) => PAD.left + step * (i + 0.5);
    const yAt = (v: number) => PAD.top + (1 - (v - min) / range) * plotH;

    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, t) => {
      const v = min + (range * t) / Y_TICKS;
      return { v, y: yAt(v) };
    });

    return { data, n, xAt, yAt, plotW, plotH, step, bodyW, yTicks };
  }, [candles, levels, width, height]);

  function onMove(e: React.MouseEvent) {
    if (!chart || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - PAD.left) / chart.step);
    setHover(Math.max(0, Math.min(chart.n - 1, i)));
  }

  if (!chart) {
    return (
      <div ref={containerRef} className="flex w-full items-center justify-center text-xs text-muted" style={{ height }}>
        {candles.length < 2 ? "Not enough data" : ""}
      </div>
    );
  }

  const hi = hover;
  const hc = hi !== null ? chart.data[hi] : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
        style={{ touchAction: "pan-y" }}
      >
        {/* y grid + axis */}
        {chart.yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={width - PAD.right} y2={t.y} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" className="fill-muted" style={{ fontSize: 10 }}>
              {formatValue(t.v)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {[0, Math.floor((chart.n - 1) / 2), chart.n - 1].map((i, k) => (
          <text
            key={k}
            x={chart.xAt(i)}
            y={height - 6}
            textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
            className="fill-muted"
            style={{ fontSize: 10 }}
          >
            {formatLabel(chart.data[i].datetime)}
          </text>
        ))}

        {/* candles */}
        {chart.data.map((c, i) => {
          const x = chart.xAt(i);
          const up = c.close >= c.open;
          const color = up ? "var(--positive)" : "var(--negative)";
          const yO = chart.yAt(c.open);
          const yC = chart.yAt(c.close);
          const top = Math.min(yO, yC);
          const bodyH = Math.max(1, Math.abs(yC - yO));
          return (
            <g key={i}>
              <line x1={x} y1={chart.yAt(c.high)} x2={x} y2={chart.yAt(c.low)} stroke={color} strokeWidth="1" />
              <rect x={x - chart.bodyW / 2} y={top} width={chart.bodyW} height={bodyH} fill={color} />
            </g>
          );
        })}

        {/* strategy level lines (entry / SL / TP / current) */}
        {levels.map((l, i) => {
          if (!Number.isFinite(l.price)) return null;
          const y = chart.yAt(l.price);
          if (y < PAD.top - 1 || y > PAD.top + chart.plotH + 1) return null;
          return (
            <g key={`lvl-${i}`}>
              <line
                x1={PAD.left}
                y1={y}
                x2={width - PAD.right}
                y2={y}
                stroke={l.color}
                strokeWidth="1.5"
                strokeDasharray={l.dashed ? "4 3" : undefined}
              />
              <text x={width - PAD.right + 4} y={y + 3} style={{ fontSize: 9, fill: l.color }}>
                {l.label}
              </text>
            </g>
          );
        })}

        {/* hover crosshair */}
        {hi !== null && (
          <line
            x1={chart.xAt(hi)}
            y1={PAD.top}
            x2={chart.xAt(hi)}
            y2={PAD.top + chart.plotH}
            stroke="var(--muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {hc && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md">
          <div className="font-semibold">{formatLabel(hc.datetime)}</div>
          <div className="text-muted">
            O {formatValue(hc.open)} · H {formatValue(hc.high)} · L {formatValue(hc.low)} · C {formatValue(hc.close)}
          </div>
        </div>
      )}
    </div>
  );
}
