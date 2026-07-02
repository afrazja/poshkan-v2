import type { CSSProperties } from "react";

// A single shimmering placeholder block. Compose for richer skeletons.
export default function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

// Inline (text-flow) variant for table cells and stat values — height follows
// the current line, width comes from the className (w-12, w-20, ...).
export function TextSkeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton inline-block h-[1em] align-middle ${className}`} aria-hidden="true" />;
}

// Deterministic bar heights (no Math.random — keeps SSR/CSR markup identical)
// that read as a chart silhouette while real data loads.
const BARS = [38, 52, 45, 60, 55, 70, 64, 78, 72, 85, 80, 68, 74, 62, 70, 58, 66, 76, 82, 90, 84, 73, 80, 88];

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="flex items-end gap-1.5" style={{ height }} aria-hidden="true">
      {BARS.map((h, i) => (
        <div key={i} className="skeleton min-w-0 flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
