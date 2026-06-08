"use client";

// Tiny inline trend chart — no axes, labels, or interaction. Sits next to a metric.
export default function Sparkline({
  points,
  width = 52,
  height = 20,
  colorMode = "trend",
}: {
  points: number[];
  width?: number;
  height?: number;
  colorMode?: "trend" | "pnl"; // trend: up vs down; pnl: positive vs negative
}) {
  const data = points.filter((n) => Number.isFinite(n));
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const coords = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (height - 2 * pad);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  const positive =
    colorMode === "pnl" ? data[data.length - 1] >= 0 : data[data.length - 1] >= data[0];
  const color = positive ? "var(--positive)" : "var(--negative)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
