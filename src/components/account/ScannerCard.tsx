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
  confirmClose,
  children,
}: {
  icon: ReactNode;
  name: string;
  defaultOpen?: boolean;
  headerExtra?: ReactNode; // e.g. a per-card account selector, right-aligned next to the title
  confirmClose?: () => boolean; // called before collapsing while open; return false to cancel
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  function toggle() {
    if (open && confirmClose && !confirmClose()) return; // e.g. unsaved edits — stay open
    setOpen((o) => !o);
  }
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="group flex w-full flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:bg-muted/10">
        <button
          onClick={toggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold transition-colors group-hover:text-primary">
            {icon} {name}
          </span>
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerExtra}
          <button
            onClick={toggle}
            aria-label={open ? "Collapse" : "Expand"}
            className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border text-sm font-bold transition-all ${
              open
                ? "rotate-90 border-primary bg-primary/10 text-primary"
                : "border-border text-muted group-hover:border-primary group-hover:bg-primary/10 group-hover:text-primary"
            }`}
          >
            ›
          </button>
        </div>
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
