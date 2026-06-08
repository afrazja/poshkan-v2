"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";

interface Candle {
  datetime: string;
  close: number;
}

const RANGES = [
  { label: "1M", interval: "1day", outputsize: 22 },
  { label: "3M", interval: "1day", outputsize: 66 },
  { label: "6M", interval: "1day", outputsize: 130 },
  { label: "1Y", interval: "1week", outputsize: 52 },
] as const;

const H = 220;
const PAD = { top: 12, right: 14, bottom: 24, left: 56 };
const Y_TICKS = 4;

function priceLabel(v: number): string {
  if (Math.abs(v) >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${v.toFixed(2)}`;
}

function formatDate(s: string): string {
  // Twelve Data returns "YYYY-MM-DD" (daily) or "YYYY-MM-DD HH:MM:SS".
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PriceChart({ symbol }: { symbol: string }) {
  const [rangeIdx, setRangeIdx] = useState(1); // default 3M
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Measure the container so we can draw in real pixels (no distortion).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const r = RANGES[rangeIdx];
    let active = true;
    setLoading(true);
    setError(null);
    setHover(null);
    fetch(
      `/api/timeseries?symbol=${encodeURIComponent(symbol)}&interval=${r.interval}&outputsize=${r.outputsize}`
    )
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
  }, [symbol, rangeIdx]);

  const chart = useMemo(() => {
    const data = candles.filter((c) => Number.isFinite(c.close));
    const n = data.length;
    if (n < 2 || width <= 0) return null;

    const closes = data.map((c) => c.close);
    let min = Math.min(...closes);
    let max = Math.max(...closes);
    const span = max - min || min || 1;
    min -= span * 0.05;
    max += span * 0.05;
    const range = max - min;

    const plotW = width - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const xAt = (i: number) => PAD.left + (i / (n - 1)) * plotW;
    const yAt = (price: number) => PAD.top + (1 - (price - min) / range) * plotH;

    const pts = data.map((c, i) => [xAt(i), yAt(c.close)] as const);
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[n - 1][0].toFixed(1)} ${PAD.top + plotH} L${pts[0][0].toFixed(1)} ${PAD.top + plotH} Z`;

    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, t) => {
      const price = min + (range * t) / Y_TICKS;
      return { price, y: yAt(price) };
    });

    const changePct = ((closes[n - 1] - closes[0]) / closes[0]) * 100;

    return { data, n, pts, line, area, yTicks, xAt, changePct, up: changePct >= 0, plotW, plotH };
  }, [candles, width]);

  function onMove(e: React.MouseEvent) {
    if (!chart || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = (x - PAD.left) / chart.plotW;
    const idx = Math.round(frac * (chart.n - 1));
    setHover(Math.max(0, Math.min(chart.n - 1, idx)));
  }

  const stroke = chart?.up ? "var(--positive)" : "var(--negative)";
  const gradientId = `grad-${symbol.replace(/[^a-z0-9]/gi, "")}`;
  const hoverPoint = chart && hover !== null ? chart.pts[hover] : null;
  const hoverCandle = chart && hover !== null ? chart.data[hover] : null;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-medium ${chart ? changeColor(chart.changePct) : "text-muted"}`}>
          {chart ? `${formatPercent(chart.changePct)} · ${RANGES[rangeIdx].label}` : ""}
        </span>
        <div className="flex gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeIdx(i)}
              className={`rounded px-2 py-0.5 text-xs ${
                i === rangeIdx ? "bg-primary text-primary-foreground" : "text-muted hover:bg-card"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: H }}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">Loading chart…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">Chart unavailable</div>
        ) : !chart ? (
          <div className="flex h-full items-center justify-center text-xs text-muted">Not enough data</div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width={width}
              height={H}
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

              {/* Y gridlines + price labels */}
              {chart.yTicks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={PAD.left}
                    y1={t.y}
                    x2={width - PAD.right}
                    y2={t.y}
                    stroke="var(--border)"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 8}
                    y={t.y + 3}
                    textAnchor="end"
                    className="fill-muted"
                    style={{ fontSize: 10 }}
                  >
                    {priceLabel(t.price)}
                  </text>
                </g>
              ))}

              {/* X date labels (start, middle, end) */}
              {[0, Math.floor((chart.n - 1) / 2), chart.n - 1].map((i, k) => (
                <text
                  key={k}
                  x={chart.xAt(i)}
                  y={H - 6}
                  textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
                  className="fill-muted"
                  style={{ fontSize: 10 }}
                >
                  {formatDate(chart.data[i].datetime)}
                </text>
              ))}

              <path d={chart.area} fill={`url(#${gradientId})`} />
              <path
                d={chart.line}
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Crosshair */}
              {hoverPoint && (
                <g>
                  <line
                    x1={hoverPoint[0]}
                    y1={PAD.top}
                    x2={hoverPoint[0]}
                    y2={PAD.top + chart.plotH}
                    stroke="var(--muted)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <circle cx={hoverPoint[0]} cy={hoverPoint[1]} r="4" fill={stroke} stroke="var(--card)" strokeWidth="2" />
                </g>
              )}
            </svg>

            {/* Tooltip */}
            {hoverPoint && hoverCandle && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
                style={{
                  left: Math.max(50, Math.min(width - 50, hoverPoint[0])),
                  top: Math.max(0, hoverPoint[1] - 46),
                }}
              >
                <div className="font-semibold">{formatCurrency(hoverCandle.close)}</div>
                <div className="text-muted">{formatDate(hoverCandle.datetime)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
