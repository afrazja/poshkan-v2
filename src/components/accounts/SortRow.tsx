"use client";

import type { SortKey } from "./nocturne";

const CHIPS: { key: SortKey; label: string }[] = [
  { key: "value", label: "Value ↓" },
  { key: "today", label: "Today" },
  { key: "unrealized", label: "Unrealized" },
  { key: "activity", label: "Activity" },
  { key: "custom", label: "Custom order" },
];

export default function SortRow({
  sort,
  onSortChange,
  onNewAccount,
}: {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  onNewAccount: () => void;
}) {
  return (
    <div className="mt-[26px] mb-3 flex flex-wrap items-center gap-[10px]">
      <span className="text-[11px] text-[var(--n-label)]">Sort</span>
      {CHIPS.map((c) => {
        const active = sort === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSortChange(c.key)}
            aria-pressed={active}
            title={c.key === "custom" ? "Drag accounts into any order you like" : undefined}
            className={`rounded-md px-[10px] py-[5px] text-[11.5px] transition ${
              active
                ? "border border-[var(--n-accent-border)] bg-[var(--n-accent-fill)] font-medium text-[var(--n-text)]"
                : "font-normal text-[var(--n-mute)] hover:text-[var(--n-text-2)]"
            }`}
          >
            {c.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onNewAccount}
        className="ml-auto rounded-lg border border-[var(--n-accent-border)] px-[14px] py-[7px] text-[12px] font-medium text-[var(--n-accent-on)] transition hover:bg-[var(--n-accent-fill)]"
      >
        + New account
      </button>
    </div>
  );
}
