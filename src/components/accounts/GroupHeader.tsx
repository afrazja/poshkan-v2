"use client";

import { formatCurrency } from "@/lib/format";

/**
 * The clickable market header shared by the table, the card grid and mobile.
 * Each group collapses independently; state is local and not persisted.
 */
export default function GroupHeader({
  label,
  count,
  subtotal,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  subtotal: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-3 rounded-lg bg-[var(--n-accent-fill)] px-[14px] py-[11px] text-left transition hover:brightness-125"
    >
      <span aria-hidden="true" className="text-[11px] text-[var(--n-accent-on)]">
        {open ? "▾" : "▸"}
      </span>
      <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--n-text)]">
        {label}
      </span>
      <span className="text-[11px] text-[var(--n-label)]">
        {count} account{count === 1 ? "" : "s"}
      </span>
      <span className="ml-auto text-[12.5px] font-medium text-[var(--n-text-2)]">
        {formatCurrency(subtotal)}
      </span>
    </button>
  );
}
