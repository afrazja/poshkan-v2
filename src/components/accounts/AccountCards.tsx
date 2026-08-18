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
  const leadLabel = unrealizedLeads ? "Unrealized" : "Realized";
  const leadValue = unrealizedLeads ? s.unrealized : s.realized;
  const otherLabel = unrealizedLeads ? "Realized" : "Unrealized";
  const otherValue = unrealizedLeads ? s.realized : s.unrealized;

  return (
    <div
      {...cardHandlers(acc.id, shared)}
      className={`cursor-pointer rounded-lg border border-[var(--n-border-1)] bg-[var(--n-card-1)] p-4 transition hover:border-[var(--n-faint)] min-[900px]:px-[22px] min-[900px]:py-5 ${
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
          <div className="text-[26px] font-medium leading-none tracking-[-0.02em] text-[var(--n-text)] min-[900px]:text-[32px]">
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
        {/* On mobile this figure moves down into the footer so the card reads
            top-to-bottom instead of splitting the eye left and right. */}
        <div className="hidden text-right min-[900px]:block">
          <div className="text-[11px] text-[var(--n-label)]">{leadLabel}</div>
          <div className={`text-[20px] font-medium ${pnlColor(leadValue)}`}>
            {formatSignedCurrency(leadValue)}
          </div>
        </div>
      </div>

      <div className="mt-[18px] mb-[14px] h-px bg-[var(--n-border-1)]" />

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 min-[900px]:justify-start min-[900px]:gap-[34px]">
        <Stat label="Cash" value={formatCurrency(cash)} />
        <Stat
          label={isForex || s.fxOpen > 0 ? "Open" : "Holdings"}
          value={String(isForex || s.fxOpen > 0 ? open : s.holdings)}
        />
        <Stat
          label={otherLabel}
          value={formatSignedCurrency(otherValue)}
          className={pnlColor(otherValue)}
        />
        <div className="min-[900px]:hidden">
          <Stat
            label={leadLabel}
            value={formatSignedCurrency(leadValue)}
            className={pnlColor(leadValue)}
          />
        </div>
        {/* Sparklines are dropped on mobile: at this width they compete with
            the value for the eye and say nothing the percentage does not. */}
        <div className="ml-auto hidden min-[900px]:block">
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
      className={`cursor-pointer rounded-lg border border-[var(--n-border-2)] bg-[var(--n-card-2)] px-4 py-[14px] transition hover:border-[var(--n-border-1)] min-[900px]:px-[18px] min-[900px]:py-4 ${
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

      <div className="mt-3 text-[20px] font-medium text-[var(--n-text)] min-[900px]:text-[22px]">
        {formatCurrency(value)}
      </div>
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

      {/* One space-between row on mobile, a 2x2 grid once there is width for it. */}
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1.5 text-[11.5px] text-[var(--n-label)] min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:gap-y-2">
        <span>
          Unrealized{" "}
          <span className={pnlColor(s.unrealized)}>{formatSignedCurrency(s.unrealized)}</span>
        </span>
        <span className="min-[900px]:text-right">
          Realized <span className={pnlColor(s.realized)}>{formatSignedCurrency(s.realized)}</span>
        </span>
        <span>
          Cash <span className="text-[var(--n-text-2)]">{formatCurrency(cash)}</span>
        </span>
        <span className="text-[var(--n-text-2)] min-[900px]:text-right">
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

/** A row on mobile, a tile at the end of the tier-2 grid on desktop. */
function NewAccountTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--n-border-1)] transition hover:border-[var(--n-accent-border)] min-[900px]:min-h-[132px] min-[900px]:flex-col"
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--n-accent-border)] text-[17px] leading-none text-[var(--n-accent-on)]">
        +
      </span>
      <span className="text-[12px] text-[var(--n-mute)]">New account</span>
    </button>
  );
}
