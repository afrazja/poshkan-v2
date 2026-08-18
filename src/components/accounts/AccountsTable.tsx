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

type MenuProps = (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;

type Shared = {
  draggable: boolean;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropOn: (id: string) => void;
  onOpen: (id: string) => void;
  menuFor: string | null;
  menuProps: MenuProps;
};

export default function AccountsTable({
  rows,
  idleRows,
  ...shared
}: Shared & { rows: Row[]; idleRows: Row[] }) {
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
    <>
      {/* Seven columns do not fit 390px, and horizontally scrolling the primary
          list is not acceptable — so below the breakpoint the same rows render
          as a stacked two-column list instead. */}
      <table className="hidden w-full table-fixed border-collapse min-[900px]:table">
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
          {groups.map((g) => (
            <DesktopGroup key={g.key} group={g} {...shared} />
          ))}
        </tbody>
      </table>

      <div className="min-[900px]:hidden">
        {groups.map((g) => (
          <MobileGroup key={g.key} group={g} {...shared} />
        ))}
      </div>
    </>
  );
}

/** "3 accounts", or "2 active · 3 idle" once any of the group sits in the strip. */
function groupCount(group: Group): string {
  return group.idleCount
    ? `${group.rows.length} active · ${group.idleCount} idle`
    : `${group.rows.length} account${group.rows.length === 1 ? "" : "s"}`;
}

/** Whether a row's live number is floating P&L (fx) or a move off yesterday's close. */
function dayFigure(row: Row) {
  const isForex = row.acc.type === "forex";
  return {
    isForex,
    value: isForex ? row.s.unrealized : row.s.todayPnl,
    present: isForex ? row.s.unrealized !== 0 : row.todayPct !== null,
  };
}

function openLabel(row: Row): string {
  const { acc, s, open } = row;
  return acc.type === "forex" || s.fxOpen > 0
    ? `${open} position${open === 1 ? "" : "s"}`
    : `${s.holdings} holding${s.holdings === 1 ? "" : "s"}`;
}

function DesktopGroup({ group, ...shared }: Shared & { group: Group }) {
  return (
    <>
      <tr>
        <td colSpan={7} className="pt-5 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--n-accent-on)]">
              {group.label}
            </span>
            <span className="text-[11px] text-[var(--n-label)]">{groupCount(group)}</span>
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
        <DesktopRow key={r.acc.id} row={r} {...shared} />
      ))}
    </>
  );
}

function DesktopRow({ row, ...shared }: Shared & { row: Row }) {
  const { acc, s, cash, value, open, todayPct } = row;
  const day = dayFigure(row);
  const dragging = shared.dragId === acc.id;

  return (
    <tr
      draggable={shared.draggable}
      onDragStart={() => shared.draggable && shared.onDragStart(acc.id)}
      onDragEnd={shared.onDragEnd}
      onDragOver={(e) => shared.draggable && e.preventDefault()}
      onDrop={() => shared.draggable && shared.onDropOn(acc.id)}
      // A hydration/re-render race can swallow the anchor's own click (the
      // "first click only highlights" bug), so navigation happens on pointerup.
      onPointerUp={(e) => {
        if (e.button !== 0 || dragging || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if ((e.target as HTMLElement).closest("button")) return;
        shared.onOpen(acc.id);
      }}
      className={`group cursor-pointer border-b border-[var(--n-rule)] transition hover:bg-[var(--n-cell)] ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <td className="py-[11px] pr-2">
        <div className="flex items-center gap-2">
          {shared.draggable && <DragHandle />}
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
        {day.present ? (
          <span className={pnlColor(day.value)}>
            {formatSignedCurrency(day.value)}{" "}
            <span className="text-[var(--n-label)]">
              {day.isForex ? "floating" : formatPercent(todayPct ?? 0)}
            </span>
          </span>
        ) : (
          <Dash />
        )}
      </Td>
      <Td className={`text-[12.5px] font-medium ${pnlColor(s.unrealized)}`}>
        {s.unrealized === 0 ? <Dash /> : formatSignedCurrency(s.unrealized)}
      </Td>
      <Td className={`text-[12.5px] font-normal ${pnlColor(s.realized)}`}>
        {s.realized === 0 ? <Dash /> : formatSignedCurrency(s.realized)}
      </Td>
      <Td className="text-[12.5px] text-[var(--n-mute)]">{formatCurrency(cash)}</Td>
      <Td className="text-[12.5px] text-[var(--n-text-2)]">
        <div className="flex items-center justify-end gap-1">
          <span>{open}</span>
          <span className="opacity-0 transition group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100">
            <AccountMenu acc={acc} open={shared.menuFor === acc.id} {...shared.menuProps(acc)} />
          </span>
        </div>
      </Td>
    </tr>
  );
}

function MobileGroup({ group, ...shared }: Shared & { group: Group }) {
  return (
    <section>
      {/* No fading rule at this width — name, count and subtotal in one row. */}
      <div className="flex items-baseline gap-2 pt-4 pb-1.5 text-[11px]">
        <span className="font-medium uppercase tracking-[0.1em] text-[var(--n-accent-on)]">
          {group.label}
        </span>
        <span className="text-[var(--n-label)]">{groupCount(group)}</span>
        <span className="ml-auto font-medium text-[var(--n-text-2)]">
          {formatCurrency(group.subtotal)}
        </span>
      </div>
      {group.rows.map((r) => (
        <MobileRow key={r.acc.id} row={r} {...shared} />
      ))}
    </section>
  );
}

function MobileRow({ row, ...shared }: Shared & { row: Row }) {
  const { acc, s, value, todayPct } = row;
  const day = dayFigure(row);
  const dragging = shared.dragId === acc.id;
  // Cash and Realized are not shown per row here — they live on the account
  // detail page. The dominant P&L rides along with the position count instead.
  const unrealizedLeads = Math.abs(s.unrealized) >= Math.abs(s.realized);
  const leadPnl = unrealizedLeads ? s.unrealized : s.realized;

  return (
    <div
      draggable={shared.draggable}
      onDragStart={() => shared.draggable && shared.onDragStart(acc.id)}
      onDragEnd={shared.onDragEnd}
      onDragOver={(e) => shared.draggable && e.preventDefault()}
      onDrop={() => shared.draggable && shared.onDropOn(acc.id)}
      onPointerUp={(e) => {
        if (e.button !== 0 || dragging || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if ((e.target as HTMLElement).closest("button")) return;
        shared.onOpen(acc.id);
      }}
      className={`flex items-center gap-3 border-b border-[var(--n-rule)] py-3 ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {shared.draggable && <DragHandle />}
          <span className="truncate text-[14px] font-medium text-[var(--n-text)]">{acc.name}</span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-[var(--n-label)]">
          {openLabel(row)}
          {leadPnl !== 0 && (
            <>
              {" · "}
              {unrealizedLeads ? "unrealized" : "realized"}{" "}
              <span className={pnlColor(leadPnl)}>{formatSignedCurrency(leadPnl)}</span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[14.5px] font-medium text-[var(--n-text)]">{formatCurrency(value)}</div>
        <div className="mt-0.5 text-[11.5px]">
          {day.present ? (
            <span className={pnlColor(day.value)}>
              {day.isForex ? "floating" : formatPercent(todayPct ?? 0)}
            </span>
          ) : (
            <Dash />
          )}
        </div>
      </div>

      {/* There is no hover on touch, so the menu stays visible here. */}
      <AccountMenu acc={acc} open={shared.menuFor === acc.id} {...shared.menuProps(acc)} />
    </div>
  );
}

function DragHandle() {
  return (
    <span
      aria-hidden="true"
      title="Drag to reorder"
      className="cursor-grab select-none text-[var(--n-faint)] active:cursor-grabbing"
    >
      ⠿
    </span>
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
