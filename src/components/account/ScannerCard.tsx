"use client";

import { useState, type ReactNode } from "react";

// Shared shell every scanner plugs into: a consistent header (icon · name ·
// market badge · on/off status · chevron) over a collapsible body. Collapsed by
// default so the Scanners section stays compact and uniform across strategies.
export default function ScannerCard({
  icon,
  name,
  defaultOpen = false,
  children,
}: {
  icon: string;
  name: string;
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
        </div>
        <span className={`text-lg text-muted transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
