"use client";

import { useState, type ReactNode } from "react";

// Shared shell every scanner plugs into: a consistent header (icon · name ·
// market badge · on/off status · chevron) over a collapsible body. Collapsed by
// default so the Scanners section stays compact and uniform across strategies.
export default function ScannerCard({
  icon,
  name,
  defaultOpen = false,
  headerExtra,
  children,
}: {
  icon: string;
  name: string;
  defaultOpen?: boolean;
  headerExtra?: ReactNode; // e.g. a per-card account selector, right-aligned next to the title
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex w-full flex-wrap items-center justify-between gap-2 p-4 transition hover:bg-muted/5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-sm font-semibold">
            {icon} {name}
          </span>
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerExtra}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
            className={`text-lg text-muted transition-transform ${open ? "rotate-90" : ""}`}
          >
            ›
          </button>
        </div>
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
