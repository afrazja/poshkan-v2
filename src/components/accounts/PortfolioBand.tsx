"use client";

import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import NewAccountButton from "./NewAccountButton";
import { pnlColor, type BandTotals } from "./nocturne";

export default function PortfolioBand({
  band,
  onNewAccount,
}: {
  band: BandTotals;
  onNewAccount: () => void;
}) {
  const { totalValue, todayPnl, prevValue, cashAvailable, openPositions } = band;
  const cashPct = totalValue > 0 ? (cashAvailable / totalValue) * 100 : 0;

  return (
    <section>
      {/* Desktop keeps the balance, the day move and the primary action on one
          baseline; mobile stacks them and moves the button down to the
          ACCOUNTS row below the strip. */}
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.09em] text-[var(--n-label)]">
            Portfolio
          </div>
          <div className="flex flex-col gap-1 min-[900px]:flex-row min-[900px]:items-baseline min-[900px]:gap-[14px]">
            <span className="text-[32px] font-medium leading-none tracking-[-0.02em] text-[var(--n-text)] min-[900px]:text-[40px]">
              {formatCurrency(totalValue)}
            </span>
            <span className={`text-[13.5px] font-medium min-[900px]:text-[15px] ${pnlColor(todayPnl)}`}>
              {formatSignedCurrency(todayPnl)}
              {/* No previous close means there is nothing to take a percentage
                  of — print the dollar move alone rather than a bogus 0.00%. */}
              {prevValue > 0 && ` · ${formatPercent((todayPnl / prevValue) * 100)}`} today
            </span>
          </div>
        </div>
        <div className="hidden min-[900px]:block">
          <NewAccountButton onClick={onNewAccount} />
        </div>
      </div>

      {/* 1px gaps over the border colour so the gutters read as dividers. */}
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--n-border-2)] bg-[var(--n-border-2)] min-[900px]:mt-[22px] min-[900px]:grid-cols-4">
        <Cell label="Unrealized">
          <span className={pnlColor(band.unrealized)}>{formatSignedCurrency(band.unrealized)}</span>
        </Cell>
        <Cell label="Realized to date">
          <span className={pnlColor(band.realized)}>{formatSignedCurrency(band.realized)}</span>
        </Cell>
        {/* Cash AVAILABLE — the money sitting out of the market, not deployed. */}
        <Cell label="Cash available">
          <span className="text-[var(--n-text)]">{formatCurrency(cashAvailable)}</span>
          <span className="text-[12px] text-[var(--n-label)]"> · {cashPct.toFixed(0)}%</span>
        </Cell>
        <Cell label="Open">
          <span className="text-[var(--n-text)]">{openPositions}</span>
          <span className="text-[12px] text-[var(--n-label)]">
            {` · ${band.activeAccounts}/${band.totalAccounts} accounts`}
          </span>
        </Cell>
      </div>

      {/* Mobile only: the section label and the compacted primary action. */}
      <div className="mt-4 flex items-center justify-between min-[900px]:hidden">
        <span className="text-[11px] uppercase tracking-[0.09em] text-[var(--n-label)]">
          Accounts
        </span>
        <NewAccountButton onClick={onNewAccount} compact />
      </div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--n-cell)] px-[14px] py-3 min-[900px]:px-[18px] min-[900px]:py-[14px]">
      <div className="mb-1 text-[10.5px] text-[var(--n-label)] min-[900px]:mb-[5px] min-[900px]:text-[11px]">
        {label}
      </div>
      <div className="text-[16px] font-medium min-[900px]:text-[19px]">{children}</div>
    </div>
  );
}
