"use client";

import type { Account } from "@/lib/types";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import AccountMenu from "./AccountMenu";
import GroupHeader from "./GroupHeader";
import { pnlColor, type MarketGroup, type Row } from "./nocturne";

type MenuProps = (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;

/**
 * The card treatment: two per row on desktop, one per row below 900px, always
 * inside its market group. Every card is the same size — there are no tiers,
 * no sparklines and no new-account tile in the grid.
 */
export default function AccountCards({
  groups,
  rows,
  openGroups,
  onToggleGroup,
  onOpen,
  menuFor,
  menuProps,
}: {
  groups: MarketGroup[];
  rows: Record<string, Row>;
  openGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  onOpen: (id: string) => void;
  menuFor: string | null;
  menuProps: MenuProps;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => {
        const open = openGroups[g.key] !== false;
        return (
          <section key={g.key}>
            <GroupHeader
              label={g.label}
              count={g.ids.length}
              subtotal={g.subtotal}
              open={open}
              onToggle={() => onToggleGroup(g.key)}
            />
            {open && (
              <div className="mt-3 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2 min-[900px]:gap-[14px]">
                {g.ids.map((id) =>
                  rows[id] ? (
                    <AccountCard
                      key={id}
                      row={rows[id]}
                      onOpen={onOpen}
                      menuOpen={menuFor === id}
                      menuProps={menuProps}
                    />
                  ) : null
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AccountCard({
  row,
  onOpen,
  menuOpen,
  menuProps,
}: {
  row: Row;
  onOpen: (id: string) => void;
  menuOpen: boolean;
  menuProps: MenuProps;
}) {
  const { acc, s, cash, value, open, idle, todayPct } = row;
  const isForex = acc.type === "forex";
  const dayValue = isForex ? s.unrealized : s.todayPnl;
  const hasDay = !idle && (isForex ? s.unrealized !== 0 : todayPct !== null);
  // Mobile collapses the 2x2 footer to one line, so it shows whichever P&L
  // figure actually says something about this account.
  const leadIsUnrealized = s.unrealized !== 0;
  const leadValue = leadIsUnrealized ? s.unrealized : s.realized;
  const leadLabel = leadIsUnrealized ? "Unrealized" : "Realized";

  return (
    <div
      onPointerUp={(e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if ((e.target as HTMLElement).closest("button")) return;
        onOpen(acc.id);
      }}
      className="cursor-pointer rounded-lg border border-[var(--n-border-2)] bg-[var(--n-card-2)] px-4 py-[14px] transition hover:border-[var(--n-border-1)] min-[900px]:px-[18px] min-[900px]:py-4"
    >
      <div className="flex items-center gap-2">
        {/* No market chip — the group header already carries the market. */}
        <h3 className="truncate text-[13.5px] font-medium text-[var(--n-text)]">{acc.name}</h3>
        <span className="ml-auto">
          <AccountMenu acc={acc} open={menuOpen} tone="faint" {...menuProps(acc)} />
        </span>
      </div>

      <div className="mt-[9px] text-[20px] font-medium leading-none text-[var(--n-text)] min-[900px]:mt-3 min-[900px]:text-[22px]">
        {formatCurrency(value)}
      </div>

      <div className="mt-[5px] text-[11.5px] min-[900px]:mt-1.5 min-[900px]:text-[12px]">
        {hasDay ? (
          <span className={pnlColor(dayValue)}>
            {formatSignedCurrency(dayValue)}{" "}
            <span className="text-[var(--n-label)]">{isForex ? "floating" : "today"}</span>
          </span>
        ) : (
          <span className="text-[var(--n-label)]">{idle ? "no activity" : "no change today"}</span>
        )}
      </div>

      <div className="mt-[11px] mb-[9px] h-px bg-[var(--n-border-2)] min-[900px]:mt-[14px] min-[900px]:mb-[11px]" />

      {/* Mobile: one line — the figure that matters, and the position count. */}
      <div className="flex items-center justify-between text-[11px] text-[var(--n-label)] min-[900px]:hidden">
        <span>
          {leadLabel}{" "}
          {idle ? <Dash /> : <span className={pnlColor(leadValue)}>{formatSignedCurrency(leadValue)}</span>}
        </span>
        <span>
          {open} open position{open === 1 ? "" : "s"}
        </span>
      </div>

      {/* Desktop: the full 2x2. */}
      <div className="hidden grid-cols-2 gap-x-3 gap-y-2 text-[11.5px] text-[var(--n-label)] min-[900px]:grid">
        <span>
          Unrealized{" "}
          {idle ? <Dash /> : <span className={pnlColor(s.unrealized)}>{formatSignedCurrency(s.unrealized)}</span>}
        </span>
        <span className="text-right">
          Realized{" "}
          {idle ? <Dash /> : <span className={pnlColor(s.realized)}>{formatSignedCurrency(s.realized)}</span>}
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

function Dash() {
  return <span className="text-[var(--n-label)]">—</span>;
}
