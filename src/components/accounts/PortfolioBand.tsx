"use client";

import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import { pnlColor, type BandTotals, type ViewMode } from "./nocturne";

export default function PortfolioBand({
  band,
  view,
  onViewChange,
  onNewAccount,
}: {
  band: BandTotals;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onNewAccount: () => void;
}) {
  const { totalValue, todayPnl, prevValue, openPositions, idleIds, totalAccounts } = band;
  const deployed = totalValue - band.totalCash;
  const deployedPct = totalValue > 0 ? (deployed / totalValue) * 100 : 0;
  const activeAccounts = totalAccounts - idleIds.length;

  return (
    <section className="flex flex-col gap-[22px]">
      <div className="flex items-start justify-between gap-4 min-[900px]:items-baseline">
        {/* Stacks on mobile: label, total, then the day change on its own line. */}
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.09em] text-[var(--n-label)]">
            Portfolio
          </div>
          <div className="flex flex-col min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-baseline min-[900px]:gap-x-[14px]">
            <span className="text-[32px] font-medium leading-none tracking-[-0.02em] text-[var(--n-text)] min-[900px]:text-[40px]">
              {formatCurrency(totalValue)}
            </span>
            <span className={`mt-2 text-[13.5px] font-medium min-[900px]:mt-0 min-[900px]:text-[15px] ${pnlColor(todayPnl)}`}>
              {formatSignedCurrency(todayPnl)}
              {/* A zero previous close means there is nothing to take a
                  percentage of — print the dollar move alone rather than a
                  meaningless 0.00%. */}
              {prevValue > 0 && ` · ${formatPercent((todayPnl / prevValue) * 100)}`} today
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
          {/* The sort row drops "+ New account" on mobile. In the card view the
              dashed tile at the end of the list carries it; the table view has
              no tile, so it lands here. */}
          {view === "table" && (
            <button
              type="button"
              onClick={onNewAccount}
              aria-label="New account"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[var(--n-accent-border)] text-[17px] leading-none text-[var(--n-accent-on)] transition hover:bg-[var(--n-accent-fill)] min-[900px]:hidden"
            >
              +
            </button>
          )}
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
        {/* Both of these shorten on mobile: the dollar figure and the long
            "of N accounts" tail are what overflow a 2-up cell first. */}
        <Cell label="Deployed">
          <span className="text-[var(--n-text)] min-[900px]:hidden">
            {deployedPct.toFixed(0)}%
          </span>
          <span className="hidden text-[var(--n-text)] min-[900px]:inline">
            {formatCurrency(deployed)}
          </span>
          <span className="hidden text-[12px] text-[var(--n-label)] min-[900px]:inline">
            {" · "}
            {deployedPct.toFixed(0)}%
          </span>
        </Cell>
        <Cell label="Open">
          <span className="text-[var(--n-text)]">{openPositions}</span>
          <span className="text-[12px] text-[var(--n-label)]">
            <span className="min-[900px]:hidden">{` · ${activeAccounts}/${totalAccounts}`}</span>
            <span className="hidden min-[900px]:inline">
              {` position${openPositions === 1 ? "" : "s"} · ${activeAccounts} of ${totalAccounts} accounts`}
            </span>
          </span>
        </Cell>
      </div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--n-cell)] px-[14px] py-3 min-[900px]:px-[18px] min-[900px]:py-[14px]">
      <div className="mb-[5px] text-[10.5px] text-[var(--n-label)] min-[900px]:text-[11px]">
        {label}
      </div>
      <div className="text-[16px] font-medium min-[900px]:text-[19px]">{children}</div>
    </div>
  );
}
