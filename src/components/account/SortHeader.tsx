"use client";

import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}

// A clickable table header cell that sorts by `sortKey` and shows the active
// direction. Used by the holdings and watchlist tables.
export default function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
}: {
  label: ReactNode;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  return (
    <th className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
        aria-label={`Sort by ${typeof label === "string" ? label : sortKey}`}
      >
        <span>{label}</span>
        <span className={`text-[9px] leading-none ${active ? "" : "opacity-30"}`}>
          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

// Toggle helper: first click on a column sorts by `defaultDir`; clicking the
// same column again flips direction.
export function nextSort(prev: SortState | null, key: string, defaultDir: SortDir = "desc"): SortState {
  if (prev && prev.key === key) {
    return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: defaultDir };
}
