"use client";

import { Fragment } from "react";

import Link from "next/link";
import type { Account } from "@/lib/types";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import AccountMenu from "./AccountMenu";
import GroupHeader from "./GroupHeader";
import { pnlColor, type MarketGroup, type Row } from "./nocturne";

type MenuProps = (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;

export default function AccountsTable({
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
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          <Th className="w-[26%] text-left">Account</Th>
          <Th className="w-[13%]">Value</Th>
          <Th className="w-[12%]">Today</Th>
          <Th className="w-[13%]">Unrealized</Th>
          <Th className="w-[12%]">Realized</Th>
          <Th className="w-[12%]">Cash</Th>
          <Th className="w-[12%]">Open</Th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const open = openGroups[g.key] !== false;
          return (
            <Fragment key={g.key}>
              <tr>
                <td colSpan={7} className="pt-5 pb-2">
                  <GroupHeader
                    label={g.label}
                    count={g.ids.length}
                    subtotal={g.subtotal}
                    open={open}
                    onToggle={() => onToggleGroup(g.key)}
                  />
                </td>
              </tr>
              {open &&
                g.ids.map((id) =>
                  rows[id] ? (
                    <DataRow
                      key={id}
                      row={rows[id]}
                      onOpen={onOpen}
                      menuOpen={menuFor === id}
                      menuProps={menuProps}
                    />
                  ) : null
                )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function DataRow({
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
  // Forex has no previous close to measure a day against — floating P&L is its
  // live number, so it carries the Today column instead.
  const dayValue = isForex ? s.unrealized : s.todayPnl;
  const hasDay = !idle && (isForex ? s.unrealized !== 0 : todayPct !== null);

  return (
    <tr
      // A hydration/re-render race can swallow the anchor's own click (the
      // "first click only highlights" bug), so navigation happens on pointerup.
      onPointerUp={(e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if ((e.target as HTMLElement).closest("button")) return;
        onOpen(acc.id);
      }}
      className="group cursor-pointer transition hover:bg-[var(--n-cell)]"
    >
      <td className="py-[13px] pr-2">
        <Link
          href={`/dashboard/${acc.id}`}
          onClick={(e) => e.preventDefault()}
          className="block truncate text-[13.5px] font-medium text-[var(--n-text)]"
        >
          {acc.name}
        </Link>
      </td>
      <Td className="text-[14px] font-medium text-[var(--n-text)]">{formatCurrency(value)}</Td>
      <Td className="text-[12.5px] font-normal">
        {hasDay ? (
          <span className={pnlColor(dayValue)}>
            {formatSignedCurrency(dayValue)}{" "}
            <span className="text-[var(--n-label)]">
              {isForex ? "floating" : formatPercent(todayPct ?? 0)}
            </span>
          </span>
        ) : (
          <Dash />
        )}
      </Td>
      <Td className={`text-[12.5px] font-medium ${pnlColor(s.unrealized)}`}>
        {idle || s.unrealized === 0 ? <Dash /> : formatSignedCurrency(s.unrealized)}
      </Td>
      <Td className={`text-[12.5px] font-normal ${pnlColor(s.realized)}`}>
        {idle || s.realized === 0 ? <Dash /> : formatSignedCurrency(s.realized)}
      </Td>
      <Td className="text-[12.5px] text-[var(--n-mute)]">{formatCurrency(cash)}</Td>
      <Td className="text-[12.5px] text-[var(--n-text-2)]">
        <div className="flex items-center justify-end gap-1">
          <span>{open}</span>
          <span className="opacity-0 transition group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100">
            <AccountMenu acc={acc} open={menuOpen} {...menuProps(acc)} />
          </span>
        </div>
      </Td>
    </tr>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-[var(--n-border-1)] pb-[9px] text-right text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--n-label)] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-[13px] pl-2 text-right ${className}`}>{children}</td>;
}

/** A missing figure is an em dash, never a $0.00 that reads as a real result. */
function Dash() {
  return <span className="text-[var(--n-label)]">—</span>;
}
