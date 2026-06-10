"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface ChartPoint {
  label: string; // x-axis label (e.g. a date string)
  value: number; // y value
}

const PAD = { top: 12, right: 14, bottom: 24, left: 56 };
const Y_TICKS = 4;

function defaultFormatLabel(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AreaChart({
  points,
  height = 220,
  formatValue,
  formatAxisValue,
  formatLabel = defaultFormatLabel,
  baseline,
  benchmark,
  valueLabel,
  benchmarkLabel,
}: {
  points: ChartPoint[];
  height?: number;
  formatValue: (n: number) => string; // tooltip
  formatAxisValue?: (n: number) => string; // y-axis (defaults to formatValue)
  formatLabel?: (s: string) => string;
  baseline?: number; // if set, anchor the y-domain to this value, draw a reference line, fill to it
  benchmark?: ChartPoint[]; // optional second line (index-aligned with points)
  valueLabel?: string; // tooltip label for the main series (used with benchmark)
  benchmarkLabel?: string; // tooltip label for the benchmark series
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const axisFmt = formatAxisValue ?? formatValue;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const data = points.filter((p) => Number.isFinite(p.value));
    const n = data.length;
    if (n < 2 || width <= 0) return null;

    const vals = data.map((p) => p.value);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (baseline !== undefined) {
      min = Math.min(min, baseline);
      max = Math.max(max, baseline);
    }
    // Benchmark shares the y-domain so both lines are comparable.
    const bench = (benchmark ?? []).filter((p) => Number.isFinite(p.value));
    if (bench.length >= 2) {
      for (const b of bench) {
        if (b.value < min) min = b.value;
        if (b.value > max) max = b.value;
      }
    }
    const span = max - min || Math.abs(min) || 1;
    min -= span * 0.05;
    max += span * 0.05;
    const range = max - min;

    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const bottom = PAD.top + plotH;
    const xAt = (i: number) => PAD.left + (i / (n - 1)) * plotW;
    const yAt = (v: number) => PAD.top + (1 - (v - min) / range) * plotH;

    // Benchmark line path (index-aligned with the main series).
    const benchLine =
      bench.length >= 2
        ? bench
            .map((p, i) => {
              const x = PAD.left + (i / (bench.length - 1)) * plotW;
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${yAt(p.value).toFixed(1)}`;
            })
            .join(" ")
        : null;

    const pts = data.map((p, i) => [xAt(i), yAt(p.value)] as const);
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    // Fill down to the baseline (e.g. $0 for P&L) when given, else to the bottom axis.
    const fillY = baseline !== undefined ? yAt(baseline) : bottom;
    const area = `${line} L${pts[n - 1][0].toFixed(1)} ${fillY.toFixed(1)} L${pts[0][0].toFixed(1)} ${fillY.toFixed(1)} Z`;
    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, t) => {
      const v = min + (range * t) / Y_TICKS;
      return { v, y: yAt(v) };
    });
    const changePct = vals[0] !== 0 ? ((vals[n - 1] - vals[0]) / Math.abs(vals[0])) * 100 : 0;
    const up = baseline !== undefined ? vals[n - 1] >= baseline : vals[n - 1] >= vals[0];
    const baselineY = baseline !== undefined ? yAt(baseline) : null;

    return { data, n, pts, line, area, yTicks, xAt, changePct, up, plotW, plotH, baselineY, bench, benchLine };
  }, [points, width, height, baseline, benchmark]);

  function onMove(e: React.MouseEvent) {
    if (!chart || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = (e.clientX - rect.left - PAD.left) / chart.plotW;
    const idx = Math.round(frac * (chart.n - 1));
    setHover(Math.max(0, Math.min(chart.n - 1, idx)));
  }

  if (!chart) {
    return (
      <div ref={containerRef} className="flex w-full items-center justify-center text-xs text-muted" style={{ height }}>
        {points.length < 2 ? "Not enough data yet" : ""}
      </div>
    );
  }

  const stroke = chart.up ? "var(--positive)" : "var(--negative)";
  const gradientId = gradientIdFor(points);
  const hp = hover !== null ? chart.pts[hover] : null;
  const hc = hover !== null ? chart.data[hover] : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {chart.yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={width - PAD.right} y2={t.y} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" className="fill-muted" style={{ fontSize: 10 }}>
              {axisFmt(t.v)}
            </text>
          </g>
        ))}

        {[0, Math.floor((chart.n - 1) / 2), chart.n - 1].map((i, k) => (
          <text
            key={k}
            x={chart.xAt(i)}
            y={height - 6}
            textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
            className="fill-muted"
            style={{ fontSize: 10 }}
          >
            {formatLabel(chart.data[i].label)}
          </text>
        ))}

        <path d={chart.area} fill={`url(#${gradientId})`} />

        {/* Benchmark line (e.g. S&P 500) */}
        {chart.benchLine && (
          <path
            d={chart.benchLine}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}

        {/* Break-even / baseline reference line (e.g. $0 for P&L) */}
        {chart.baselineY !== null && (
          <g>
            <line
              x1={PAD.left}
              y1={chart.baselineY}
              x2={width - PAD.right}
              y2={chart.baselineY}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text x={width - PAD.right} y={chart.baselineY - 4} textAnchor="end" className="fill-muted" style={{ fontSize: 9 }}>
              break-even
            </text>
          </g>
        )}

        <path d={chart.line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {hp && (
          <g>
            <line x1={hp[0]} y1={PAD.top} x2={hp[0]} y2={PAD.top + chart.plotH} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hp[0]} cy={hp[1]} r="4" fill={stroke} stroke="var(--card)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {hp && hc && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
          style={{ left: Math.max(50, Math.min(width - 50, hp[0])), top: Math.max(0, hp[1] - 46) }}
        >
          <div className="font-semibold">
            {valueLabel ? `${valueLabel}: ` : ""}
            {formatValue(hc.value)}
          </div>
          {hover !== null && chart.bench[hover] != null && (
            <div className="text-primary">
              {benchmarkLabel ? `${benchmarkLabel}: ` : ""}
              {formatValue(chart.bench[hover].value)}
            </div>
          )}
          <div className="text-muted">{formatLabel(hc.label)}</div>
        </div>
      )}
    </div>
  );
}

// Stable-ish gradient id derived from the data length + first label (avoids Math.random).
function gradientIdFor(points: ChartPoint[]): string {
  const seed = `${points.length}-${points[0]?.label ?? "x"}`.replace(/[^a-z0-9]/gi, "");
  return `grad-${seed}`;
}
