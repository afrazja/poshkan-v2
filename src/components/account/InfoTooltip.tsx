"use client";

import { useEffect, useId, useRef, useState } from "react";

// A small "i" icon that reveals a one-line plain-language explanation for a
// jargon-y field label. Works on hover (desktop, pure CSS via the `group`
// wrapper) AND tap (mobile/keyboard, via click-toggled state) — both mechanisms
// are independent so neither interferes with the other. Dismissible with
// Escape or a tap/click outside, per WCAG 1.4.13 (content on hover or focus).
export default function InfoTooltip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="group relative inline-flex align-middle normal-case">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="More info"
        aria-describedby={id}
        aria-expanded={open}
        className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-muted text-[9px] font-bold leading-none text-muted hover:border-primary hover:text-primary"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-52 -translate-x-1/2 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-normal leading-snug text-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ${
          open ? "opacity-100" : ""
        }`}
      >
        {text}
      </span>
    </span>
  );
}
