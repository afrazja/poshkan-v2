"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { MARKET_LABEL, marketOf, type Row } from "./nocturne";

/**
 * Accounts with nothing open and cash equal to their whole value. They're
 * pulled out of the main list so eleven funded-but-untouched accounts stop
 * outweighing the two that are actually trading.
 */
export default function IdleStrip({
  rows,
  expanded,
  onToggle,
}: {
  rows: Row[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <section className="mt-[26px] overflow-hidden rounded-lg border border-[var(--n-border-2)] bg-[var(--n-idle)]">
      <div className="flex items-start gap-3 px-[14px] py-3 min-[900px]:items-center min-[900px]:px-[18px] min-[900px]:py-[13px]">
        {/* The count wraps under the title on mobile and loses "all cash". */}
        <div className="flex min-w-0 flex-col gap-0.5 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-3">
          <span className="text-[12.5px] font-medium text-[var(--n-text-2)]">No activity yet</span>
          <span className="text-[12px] text-[var(--n-label)]">
            {rows.length} account{rows.length === 1 ? "" : "s"} ·{" "}
            <span className="hidden min-[900px]:inline">all cash · </span>
            {formatCurrency(total)}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="ml-auto shrink-0 text-[11.5px] text-[var(--n-mute)] transition hover:text-[var(--n-text-2)]"
        >
          {expanded ? "Hide ▴" : "Show ▾"}
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-px bg-[var(--n-rule)] min-[900px]:grid-cols-4">
          {rows.map((r) => (
            <Link
              key={r.acc.id}
              href={`/dashboard/${r.acc.id}`}
              className="bg-[var(--n-idle)] px-4 py-3 transition hover:bg-[var(--n-cell)]"
            >
              <div className="truncate text-[12.5px] text-[var(--n-text-3)]">{r.acc.name}</div>
              <div className="mt-1 text-[11.5px] text-[var(--n-label)]">
                {formatCurrency(r.cash)} cash · {MARKET_LABEL[marketOf(r.acc)]}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
