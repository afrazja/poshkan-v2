"use client";

import { useState, type ReactNode } from "react";

// Shared shell every scanner plugs into: a consistent header (icon · name ·
// market badge · on/off status · chevron) over a collapsible body. Collapsed by
// default so the Scanners section stays compact and uniform across strategies.
export default function ScannerCard({
  icon,
  name,
  statusLabel,
  statusTone,
  defaultOpen = false,
  children,
}: {
  icon: string;
  name: string;
  statusLabel: string;
  statusTone: "on" | "off";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-muted/5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            {icon} {name}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              statusTone === "on"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-muted/20 text-muted"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <span className={`text-lg text-muted transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
