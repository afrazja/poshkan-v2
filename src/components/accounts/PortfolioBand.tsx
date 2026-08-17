"use client";

import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import { pnlColor, type BandTotals, type ViewMode } from "./nocturne";

export default function PortfolioBand({
  band,
  view,
  onViewChange,
}: {
  band: BandTotals;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}) {
  const { totalValue, todayPnl, prevValue, openPositions, idleIds, totalAccounts } = band;
  const deployed = totalValue - band.totalCash;
  const deployedPct = totalValue > 0 ? (deployed / totalValue) * 100 : 0;
  const activeAccounts = totalAccounts - idleIds.length;

  return (
    <section className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.09em] text-[var(--n-label)]">
            Portfolio
          </div>
          <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-1">
            <span className="text-[40px] font-medium leading-none tracking-[-0.02em] text-[var(--n-text)]">
              {formatCurrency(totalValue)}
            </span>
            <span className={`text-[15px] font-medium ${pnlColor(todayPnl)}`}>
              {formatSignedCurrency(todayPnl)}
              {/* A zero previous close means there is nothing to take a
                  percentage of — print the dollar move alone rather than a
                  meaningless 0.00%. */}
              {prevValue > 0 && ` · ${formatPercent((todayPnl / prevValue) * 100)}`} today
            </span>
          </div>
        </div>

        <div
          role="group"
          aria-label="List view"
          className="flex gap-0.5 rounded-lg border border-[var(--n-border-2)] bg-[var(--n-cell)] p-0.5"
        >
          {(["table", "cards"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              aria-pressed={view === v}
              className={`rounded-md px-3 py-1.5 text-[12px] capitalize transition ${
                view === v
                  ? "bg-[var(--n-text-2)] font-medium text-[var(--n-ground)]"
                  : "font-normal text-[var(--n-mute)] hover:text-[var(--n-text-2)]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* 1px gaps over the border colour so the gutters themselves read as
          dividers — no per-cell borders to double up at the seams. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--n-border-2)] bg-[var(--n-border-2)] min-[900px]:grid-cols-4">
        <Cell label="Unrealized">
          <span className={pnlColor(band.unrealized)}>{formatSignedCurrency(band.unrealized)}</span>
        </Cell>
        <Cell label="Realized to date">
          <span className={pnlColor(band.realized)}>{formatSignedCurrency(band.realized)}</span>
        </Cell>
        <Cell label="Deployed">
          <span className="text-[var(--n-text)]">{formatCurrency(deployed)}</span>
          <span className="text-[12px] text-[var(--n-label)]">
            {" · "}
            {deployedPct.toFixed(0)}%
          </span>
        </Cell>
        <Cell label="Open">
          <span className="text-[var(--n-text)]">{openPositions}</span>
          <span className="text-[12px] text-[var(--n-label)]">
            {` position${openPositions === 1 ? "" : "s"} · ${activeAccounts} of ${totalAccounts} accounts`}
          </span>
        </Cell>
      </div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--n-cell)] px-[18px] py-[14px]">
      <div className="mb-[5px] text-[11px] text-[var(--n-label)]">{label}</div>
      <div className="text-[19px] font-medium">{children}</div>
    </div>
  );
}
