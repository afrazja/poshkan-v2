"use client";

import Link from "next/link";
import type { Account } from "@/lib/types";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import AccountMenu from "./AccountMenu";
import { MARKET_LABEL, MARKET_ORDER, marketOf, pnlColor, type Row } from "./nocturne";

type Group = {
  key: string;
  label: string;
  rows: Row[];
  idleCount: number;
  subtotal: number;
};

export default function AccountsTable({
  rows,
  idleRows,
  draggable,
  dragId,
  onDragStart,
  onDragEnd,
  onDropOn,
  onOpen,
  menuFor,
  menuProps,
}: {
  rows: Row[];
  idleRows: Row[];
  draggable: boolean;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOn: (id: string) => void;
  onOpen: (id: string) => void;
  menuFor: string | null;
  menuProps: (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;
}) {
  // Idle accounts live in their own strip, but their group header still counts
  // them — "2 active · 3 idle" explains where the missing rows went.
  const groups: Group[] = MARKET_ORDER.map((m) => {
    const list = rows.filter((r) => marketOf(r.acc) === m);
    return {
      key: m,
      label: MARKET_LABEL[m],
      rows: list,
      idleCount: idleRows.filter((r) => marketOf(r.acc) === m).length,
      subtotal: list.reduce((sum, r) => sum + r.value, 0),
    };
  }).filter((g) => g.rows.length > 0);

  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          <Th className="w-[26%] text-left">Account</Th>
          <Th className="w-[13%]">Value</Th>
          <Th className="w-[12%]">Today</Th>
          <Th className="w-[13%]">Unrealized</Th>
          <Th className="hidden w-[12%] min-[900px]:table-cell">Realized</Th>
          <Th className="hidden w-[12%] min-[900px]:table-cell">Cash</Th>
          <Th className="w-[12%]">Open</Th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <GroupRows
            key={g.key}
            group={g}
            draggable={draggable}
            dragId={dragId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropOn={onDropOn}
            onOpen={onOpen}
            menuFor={menuFor}
            menuProps={menuProps}
          />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({
  group,
  draggable,
  dragId,
  onDragStart,
  onDragEnd,
  onDropOn,
  onOpen,
  menuFor,
  menuProps,
}: {
  group: Group;
  draggable: boolean;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOn: (id: string) => void;
  onOpen: (id: string) => void;
  menuFor: string | null;
  menuProps: (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;
}) {
  const count = group.idleCount
    ? `${group.rows.length} active · ${group.idleCount} idle`
    : `${group.rows.length} account${group.rows.length === 1 ? "" : "s"}`;

  return (
    <>
      <tr>
        <td colSpan={7} className="pt-5 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--n-accent-on)]">
              {group.label}
            </span>
            <span className="text-[11px] text-[var(--n-label)]">{count}</span>
            <span
              aria-hidden="true"
              className="h-px flex-1 bg-[linear-gradient(90deg,var(--n-border-2),transparent)]"
            />
            <span className="text-[12px] font-medium text-[var(--n-text-2)]">
              {formatCurrency(group.subtotal)}
            </span>
          </div>
        </td>
      </tr>
      {group.rows.map((r) => (
        <DataRow
          key={r.acc.id}
          row={r}
          draggable={draggable}
          dragging={dragId === r.acc.id}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDropOn={onDropOn}
          onOpen={onOpen}
          menuOpen={menuFor === r.acc.id}
          menuProps={menuProps}
        />
      ))}
    </>
  );
}

function DataRow({
  row,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOn,
  onOpen,
  menuOpen,
  menuProps,
}: {
  row: Row;
  draggable: boolean;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOn: (id: string) => void;
  onOpen: (id: string) => void;
  menuOpen: boolean;
  menuProps: (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;
}) {
  const { acc, s, cash, value, open, todayPct } = row;
  const isForex = acc.type === "forex";
  // Forex accounts have no previous close to compare against — floating P&L is
  // their live number, so the Today column carries that instead.
  const dayValue = isForex ? s.unrealized : s.todayPnl;
  const hasDay = isForex ? s.unrealized !== 0 : todayPct !== null;

  return (
    <tr
      draggable={draggable}
      onDragStart={() => draggable && onDragStart(acc.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => draggable && e.preventDefault()}
      onDrop={() => draggable && onDropOn(acc.id)}
      // A hydration/re-render race can swallow the anchor's own click (the
      // "first click only highlights" bug), so navigation happens on pointerup.
      onPointerUp={(e) => {
        if (e.button !== 0 || dragging || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if ((e.target as HTMLElement).closest("button")) return;
        onOpen(acc.id);
      }}
      className={`group cursor-pointer border-b border-[var(--n-rule)] transition hover:bg-[var(--n-cell)] ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <td className="py-[11px] pr-2">
        <div className="flex items-center gap-2">
          {draggable && (
            <span
              aria-hidden="true"
              title="Drag to reorder"
              className="cursor-grab select-none text-[var(--n-faint)] active:cursor-grabbing"
            >
              ⠿
            </span>
          )}
          <Link
            href={`/dashboard/${acc.id}`}
            draggable={false}
            onClick={(e) => e.preventDefault()}
            className="truncate text-[13.5px] font-medium text-[var(--n-text)]"
          >
            {acc.name}
          </Link>
        </div>
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
        {s.unrealized === 0 ? <Dash /> : formatSignedCurrency(s.unrealized)}
      </Td>
      <Td className={`hidden text-[12.5px] font-normal min-[900px]:table-cell ${pnlColor(s.realized)}`}>
        {s.realized === 0 ? <Dash /> : formatSignedCurrency(s.realized)}
      </Td>
      <Td className="hidden text-[12.5px] text-[var(--n-mute)] min-[900px]:table-cell">
        {formatCurrency(cash)}
      </Td>
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
  return <td className={`py-[11px] pl-2 text-right ${className}`}>{children}</td>;
}

/** A missing figure is an em dash, never a $0.00 that reads as a real result. */
function Dash() {
  return <span className="text-[var(--n-label)]">—</span>;
}
