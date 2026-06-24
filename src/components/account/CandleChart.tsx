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
const MIN_CANDLES = 8; // most you can zoom in

function defaultFormatLabel(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

interface View {
  start: number;
  count: number;
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
  const [view, setView] = useState<View | null>(null); // null = fit all
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; view: View } | null>(null);
  const pinchRef = useRef<{ dist: number; frac: number; view: View } | null>(null);

  const all = useMemo(
    () =>
      candles.filter(
        (c) =>
          Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close)
      ),
    [candles]
  );
  const total = all.length;

  // Reset the viewport to "fit all" whenever the underlying data changes.
  useEffect(() => setView(null), [total, candles]);

  // Track width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const eff: View = view ?? { start: 0, count: total };
  const plotW = width - PAD.left - PAD.right;

  // Zoom around a horizontal fraction (0 = left edge, 1 = right edge).
  function zoomAt(frac: number, factor: number, base: View = eff) {
    if (total < MIN_CANDLES) return;
    let count = clamp(Math.round(base.count * factor), MIN_CANDLES, total);
    const anchor = base.start + frac * base.count;
    const start = clamp(Math.round(anchor - frac * count), 0, total - count);
    setView({ start, count });
  }

  // Desktop wheel zoom (native, non-passive so we can preventDefault page scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const pw = rect.width - PAD.left - PAD.right;
      const frac = clamp((e.clientX - rect.left - PAD.left) / pw, 0, 1);
      zoomAt(frac, e.deltaY < 0 ? 0.82 : 1.22);
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, width, view]);

  const chart = useMemo(() => {
    const data = all.slice(eff.start, eff.start + eff.count);
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

    const plotH = height - PAD.top - PAD.bottom;
    const step = plotW / n;
    const bodyW = Math.max(1, Math.min(18, step * 0.6));
    const xAt = (i: number) => PAD.left + step * (i + 0.5);
    const yAt = (v: number) => PAD.top + (1 - (v - min) / range) * plotH;
    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, t) => {
      const v = min + (range * t) / Y_TICKS;
      return { v, y: yAt(v) };
    });
    return { data, n, xAt, yAt, plotH, step, bodyW, yTicks };
  }, [all, eff.start, eff.count, levels, width, height, plotW]);

  // --- mouse pan + hover ---
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { x: e.clientX, view: { ...eff } };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (dragRef.current && chart) {
      const dCandles = ((e.clientX - dragRef.current.x) / plotW) * dragRef.current.view.count;
      const start = clamp(Math.round(dragRef.current.view.start - dCandles), 0, total - dragRef.current.view.count);
      setView({ start, count: dragRef.current.view.count });
      setHover(null);
      return;
    }
    if (!chart || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - PAD.left) / chart.step);
    setHover(clamp(i, 0, chart.n - 1));
  }
  function endDrag() {
    dragRef.current = null;
  }

  // --- touch: 1 finger pan, 2 finger pinch-zoom ---
  function fracFromClientX(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect();
    return clamp((clientX - rect.left - PAD.left) / plotW, 0, 1);
  }
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const cx = (a.clientX + b.clientX) / 2;
      pinchRef.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), frac: fracFromClientX(cx), view: { ...eff } };
      dragRef.current = null;
    } else if (e.touches.length === 1) {
      dragRef.current = { x: e.touches[0].clientX, view: { ...eff } };
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (pinchRef.current && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (d > 0) zoomAt(pinchRef.current.frac, pinchRef.current.dist / d, pinchRef.current.view);
    } else if (dragRef.current && e.touches.length === 1) {
      const dCandles = ((e.touches[0].clientX - dragRef.current.x) / plotW) * dragRef.current.view.count;
      const start = clamp(Math.round(dragRef.current.view.start - dCandles), 0, total - dragRef.current.view.count);
      setView({ start, count: dragRef.current.view.count });
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) {
      dragRef.current = null;
      pinchRef.current = null;
    }
  }

  if (!chart) {
    return (
      <div ref={containerRef} className="flex w-full items-center justify-center text-xs text-muted" style={{ height }}>
        {total < 2 ? "Not enough data" : ""}
      </div>
    );
  }

  const zoomed = view !== null && eff.count < total;
  const hi = hover !== null && hover < chart.n ? hover : null;
  const hc = hi !== null ? chart.data[hi] : null;

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={() => {
          endDrag();
          setHover(null);
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="block cursor-crosshair"
        style={{ touchAction: "none" }}
      >
        {chart.yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={width - PAD.right} y2={t.y} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" className="fill-muted" style={{ fontSize: 10 }}>
              {formatValue(t.v)}
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
            {formatLabel(chart.data[i].datetime)}
          </text>
        ))}

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

      {zoomed && (
        <button
          type="button"
          onClick={() => setView(null)}
          className="absolute right-2 top-2 rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted shadow-sm hover:text-foreground"
        >
          Reset zoom
        </button>
      )}
    </div>
  );
}
