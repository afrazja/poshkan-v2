"use client";

import type { Account } from "@/lib/types";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import AccountMenu from "./AccountMenu";
import AccountSparkline from "./AccountSparkline";
import { MARKET_LABEL, marketOf, needsMarketLabel, pnlColor, type Row } from "./nocturne";

const TIER_1_MIN = 20_000;

type Shared = {
  draggable: boolean;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOn: (id: string) => void;
  onOpen: (id: string) => void;
  menuFor: string | null;
  menuProps: (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;
};

export default function AccountCards({
  rows,
  sparks,
  onNewAccount,
  ...shared
}: Shared & {
  rows: Row[];
  sparks: Record<string, number[]>;
  onNewAccount: () => void;
}) {
  // Value order across every market — this view drops the market grouping.
  const byValue = [...rows].sort((a, b) => b.value - a.value);
  const tier1 = byValue.filter((r) => r.value >= TIER_1_MIN);
  const tier2 = byValue.filter((r) => r.value < TIER_1_MIN);

  return (
    <div>
      {tier1.length > 0 && (
        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          {tier1.map((r) => (
            <TierOneCard key={r.acc.id} row={r} spark={sparks[r.acc.id] ?? []} {...shared} />
          ))}
        </div>
      )}
      <div
        className={`grid grid-cols-1 gap-[14px] min-[900px]:grid-cols-3 ${tier1.length ? "mt-[14px]" : ""}`}
      >
        {tier2.map((r) => (
          <TierTwoCard key={r.acc.id} row={r} {...shared} />
        ))}
        <NewAccountTile onClick={onNewAccount} />
      </div>
    </div>
  );
}

/** Drag/click plumbing every card shares. */
function cardHandlers(
  id: string,
  { draggable, dragId, onDragStart, onDragEnd, onDropOn, onOpen }: Shared
) {
  return {
    draggable,
    onDragStart: () => draggable && onDragStart(id),
    onDragEnd,
    onDragOver: (e: React.DragEvent) => draggable && e.preventDefault(),
    onDrop: () => draggable && onDropOn(id),
    onPointerUp: (e: React.PointerEvent) => {
      if (e.button !== 0 || dragId || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("button")) return;
      onOpen(id);
    },
  };
}

function TierOneCard({ row, spark, ...shared }: Shared & { row: Row; spark: number[] }) {
  const { acc, s, cash, value, open, todayPct } = row;
  const isForex = acc.type === "forex";
  const dayValue = isForex ? s.unrealized : s.todayPnl;
  const hasDay = isForex ? s.unrealized !== 0 : todayPct !== null;
  // Whichever P&L figure is the bigger story leads; the other drops to the footer.
  const unrealizedLeads = Math.abs(s.unrealized) >= Math.abs(s.realized);

  return (
    <div
      {...cardHandlers(acc.id, shared)}
      className={`cursor-pointer rounded-lg border border-[var(--n-border-1)] bg-[var(--n-card-1)] px-[22px] py-5 transition hover:border-[var(--n-faint)] ${
        shared.dragId === acc.id ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <h3 className="truncate text-[16px] font-medium text-[var(--n-text)]">{acc.name}</h3>
        {needsMarketLabel(acc) && (
          <span className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--n-market-1)]">
            {MARKET_LABEL[marketOf(acc)]}
          </span>
        )}
        <span className="ml-auto">
          <AccountMenu acc={acc} open={shared.menuFor === acc.id} {...shared.menuProps(acc)} />
        </span>
      </div>

      <div className="mt-[14px] flex items-start justify-between gap-4">
        <div>
          <div className="text-[32px] font-medium leading-none tracking-[-0.02em] text-[var(--n-text)]">
            {formatCurrency(value)}
          </div>
          <div className="mt-[7px] text-[12.5px]">
            {hasDay ? (
              <span className={pnlColor(dayValue)}>
                {formatSignedCurrency(dayValue)}{" "}
                <span className="text-[var(--n-label)]">
                  {isForex ? "floating" : `${formatPercent(todayPct ?? 0)} today`}
                </span>
              </span>
            ) : (
              <span className="text-[var(--n-label)]">no change today</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-[var(--n-label)]">
            {unrealizedLeads ? "Unrealized" : "Realized"}
          </div>
          <div
            className={`text-[20px] font-medium ${pnlColor(unrealizedLeads ? s.unrealized : s.realized)}`}
          >
            {formatSignedCurrency(unrealizedLeads ? s.unrealized : s.realized)}
          </div>
        </div>
      </div>

      <div className="mt-[18px] mb-[14px] h-px bg-[var(--n-border-1)]" />

      <div className="flex items-end gap-[34px]">
        <Stat label="Cash" value={formatCurrency(cash)} />
        <Stat
          label={isForex || s.fxOpen > 0 ? "Open" : "Holdings"}
          value={String(isForex || s.fxOpen > 0 ? open : s.holdings)}
        />
        <Stat
          label={unrealizedLeads ? "Realized" : "Unrealized"}
          value={formatSignedCurrency(unrealizedLeads ? s.realized : s.unrealized)}
          className={pnlColor(unrealizedLeads ? s.realized : s.unrealized)}
        />
        <div className="ml-auto">
          <AccountSparkline values={spark} />
        </div>
      </div>
    </div>
  );
}

function TierTwoCard({ row, ...shared }: Shared & { row: Row }) {
  const { acc, s, cash, value, open, todayPct } = row;
  const isForex = acc.type === "forex";
  const dayValue = isForex ? s.unrealized : s.todayPnl;
  const hasDay = isForex ? s.unrealized !== 0 : todayPct !== null;

  return (
    <div
      {...cardHandlers(acc.id, shared)}
      className={`cursor-pointer rounded-lg border border-[var(--n-border-2)] bg-[var(--n-card-2)] px-[18px] py-4 transition hover:border-[var(--n-border-1)] ${
        shared.dragId === acc.id ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <h3 className="truncate text-[13.5px] font-medium text-[var(--n-text)]">{acc.name}</h3>
        {needsMarketLabel(acc) && (
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--n-market-2)]">
            {MARKET_LABEL[marketOf(acc)]}
          </span>
        )}
        <span className="ml-auto">
          <AccountMenu
            acc={acc}
            open={shared.menuFor === acc.id}
            tone="faint"
            {...shared.menuProps(acc)}
          />
        </span>
      </div>

      <div className="mt-3 text-[22px] font-medium text-[var(--n-text)]">{formatCurrency(value)}</div>
      <div className="mt-1.5 text-[12px]">
        {hasDay ? (
          <span className={pnlColor(dayValue)}>
            {formatSignedCurrency(dayValue)}{" "}
            <span className="text-[var(--n-label)]">{isForex ? "floating" : "today"}</span>
          </span>
        ) : (
          <span className="text-[var(--n-label)]">no change today</span>
        )}
      </div>

      <div className="mt-[14px] mb-[11px] h-px bg-[var(--n-border-2)]" />

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px] text-[var(--n-label)]">
        <span>
          Unrealized <span className={pnlColor(s.unrealized)}>{formatSignedCurrency(s.unrealized)}</span>
        </span>
        <span className="text-right">
          Realized <span className={pnlColor(s.realized)}>{formatSignedCurrency(s.realized)}</span>
        </span>
        <span>
          Cash <span className="text-[var(--n-text-2)]">{formatCurrency(cash)}</span>
        </span>
        <span className="text-right text-[var(--n-text-2)]">
          {open} open position{open === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "text-[var(--n-text-2)]",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-[10.5px] text-[var(--n-label)]">{label}</div>
      <div className={`text-[13px] ${className}`}>{value}</div>
    </div>
  );
}

function NewAccountTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--n-border-1)] transition hover:border-[var(--n-accent-border)]"
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--n-accent-border)] text-[17px] leading-none text-[var(--n-accent-on)]">
        +
      </span>
      <span className="text-[12px] text-[var(--n-mute)]">New account</span>
    </button>
  );
}
