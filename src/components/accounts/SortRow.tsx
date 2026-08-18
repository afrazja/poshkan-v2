"use client";

import type { SortKey } from "./nocturne";

// "Custom order" is too wide for a 390px chip row, so the second word is
// dropped below the breakpoint rather than wrapping or clipping.
const CHIPS: { key: SortKey; label: string; longSuffix?: string }[] = [
  { key: "value", label: "Value ↓" },
  { key: "today", label: "Today" },
  { key: "unrealized", label: "Unrealized" },
  { key: "activity", label: "Activity" },
  { key: "custom", label: "Custom", longSuffix: " order" },
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
    // Full-bleed on mobile: the negative margin lets the row scroll to the
    // screen edge, and the matching padding inside keeps the first and last
    // chip aligned with the rest of the page.
    <div className="mt-[26px] mb-3 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 min-[900px]:mx-0 min-[900px]:overflow-visible min-[900px]:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max items-center gap-[10px] min-[900px]:w-auto min-[900px]:flex-wrap">
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
              className={`shrink-0 rounded-md px-[10px] py-[5px] text-[11.5px] transition ${
                active
                  ? "border border-[var(--n-accent-border)] bg-[var(--n-accent-fill)] font-medium text-[var(--n-text)]"
                  : // Without a fill, an inactive chip needs a border to read as
                    // a control on mobile. On desktop the row has room to breathe.
                    "border border-[var(--n-border-2)] font-normal text-[var(--n-mute)] hover:text-[var(--n-text-2)] min-[900px]:border-transparent"
              }`}
            >
              {c.label}
              {c.longSuffix && <span className="hidden min-[900px]:inline">{c.longSuffix}</span>}
            </button>
          );
        })}
        {/* Mobile moves this into the band header (table view) or the dashed
            tile at the end of the list (card view). */}
        <button
          type="button"
          onClick={onNewAccount}
          className="ml-auto hidden shrink-0 rounded-lg border border-[var(--n-accent-border)] px-[14px] py-[7px] text-[12px] font-medium text-[var(--n-accent-on)] transition hover:bg-[var(--n-accent-fill)] min-[900px]:block"
        >
          + New account
        </button>
      </div>
    </div>
  );
}
