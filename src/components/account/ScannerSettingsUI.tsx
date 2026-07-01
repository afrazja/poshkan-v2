import type { ReactNode } from "react";
import InfoTooltip from "./InfoTooltip";

// A labeled group within a scanner's settings panel (e.g. "Entry rules",
// "Risk management", "Execution limits") — so ~10 flat fields read as a form
// instead of a wall of inputs.
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

// A constrained number input, shared by every scanner's settings grid. min/max
// mirror the server-side clamp so the UI can't invite a value that'll just get
// silently clamped on save.
export function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = "any",
  tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: string | number;
  tip?: string; // one-line plain-language explanation, shown via an info icon
}) {
  return (
    <div>
      <span className="mb-1 flex items-center text-xs font-medium text-muted">
        {label}
        {tip && <InfoTooltip text={tip} />}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm"
      />
    </div>
  );
}

// A bounded percentage slider (+ numeric readout) — used for the risk knobs
// every scanner shares (risk per trade, max position size, daily loss limit),
// so the safe range is visible on the control itself, not just in a tooltip.
export function PercentSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  tip?: string; // one-line plain-language explanation, shown via an info icon
}) {
  const num = Number(value) || 0;
  return (
    <div className="col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center text-xs font-medium text-muted">
          {label}
          {tip && <InfoTooltip text={tip} />}
        </span>
        <span className="text-xs font-semibold">{num}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={num}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-primary"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-muted">
        <span>{min}%</span>
        <span>{max}%</span>
      </div>
    </div>
  );
}
