import type { ReactNode } from "react";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Compact, always-visible status for a scanner card's header — so its on/off
// state, mode, and last-run time are readable without expanding the card.
export default function ScannerStatusBadges({
  enabled,
  mode,
  lastRunAt,
}: {
  enabled: boolean;
  mode?: "alert" | "auto";
  lastRunAt?: string | null; // undefined = not tracked for this scanner (badge omitted)
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill on={enabled}>{enabled ? "Enabled" : "Off"}</Pill>
      {enabled && mode && <Pill on={mode === "auto"}>{mode === "auto" ? "Auto-trade" : "Alert"}</Pill>}
      {enabled && lastRunAt !== undefined && (
        <span className="whitespace-nowrap text-[11px] text-muted">
          {lastRunAt ? `ran ${ago(lastRunAt)}` : "never ran"}
        </span>
      )}
    </div>
  );
}

function Pill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
        on ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted/20 text-muted"
      }`}
    >
      {children}
    </span>
  );
}
