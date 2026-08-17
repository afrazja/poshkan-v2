const W = 150;
const H = 34;

/**
 * 14-day equity line for a tier-1 card, drawn straight to SVG — no chart
 * library. The dashed rule is where the series started, so the line reads as
 * "up from" / "down from" rather than as an abstract squiggle.
 *
 * Two or fewer snapshots can only ever draw a flat line, which looks like a
 * broken chart rather than a young account — so it renders nothing instead.
 */
export default function AccountSparkline({ values }: { values: number[] }) {
  if (values.length < 3) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (v: number) => H - ((v - min) / span) * H;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");

  const net = values[values.length - 1] - values[0];
  const stroke = net < 0 ? "var(--n-loss)" : "var(--n-gain)";
  const baseline = y(values[0]);

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10.5px] text-[var(--n-faint)]">14 days</span>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        className="overflow-visible"
      >
        <line
          x1="0"
          x2={W}
          y1={baseline}
          y2={baseline}
          stroke="var(--n-border-1)"
          strokeDasharray="2 3"
          strokeWidth="1"
        />
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
