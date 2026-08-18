"use client";

import { useState } from "react";
import type { Account } from "@/lib/types";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import AccountMenu from "./AccountMenu";
import GroupHeader from "./GroupHeader";
import { pnlColor, type MarketGroup, type Row } from "./nocturne";

type MenuProps = (acc: Account) => Omit<React.ComponentProps<typeof AccountMenu>, "acc" | "open">;

type CardProps = {
  rows: Record<string, Row>;
  onOpen: (id: string) => void;
  menuFor: string | null;
  menuProps: MenuProps;
};

/**
 * The card treatment: two per row on desktop, one per row below 900px, always
 * inside its market group. Every card is the same size — no tiers, no
 * sparklines, no new-account tile in the grid.
 *
 * Cards drag into any order within their own market group. Dragging runs on
 * pointer events rather than HTML5 drag-and-drop, which fires nothing at all on
 * touch — and below 900px this view is the only one there is.
 */
export default function AccountCards({
  groups,
  openGroups,
  onToggleGroup,
  onReorder,
  ...cardProps
}: CardProps & {
  groups: MarketGroup[];
  openGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  onReorder: (groupKey: string, ids: string[]) => void;
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
              <GroupGrid ids={g.ids} onReorder={(ids) => onReorder(g.key, ids)} {...cardProps} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function GroupGrid({
  ids,
  onReorder,
  ...cardProps
}: CardProps & { ids: string[]; onReorder: (ids: string[]) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  // While a drag is in flight the grid renders its own working copy so cards
  // shuffle live under the finger; the settled order is saved on release.
  const [liveIds, setLiveIds] = useState<string[] | null>(null);
  const shown = liveIds ?? ids;

  function start(e: React.PointerEvent, id: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
    setLiveIds(ids);
  }

  function move(e: React.PointerEvent) {
    if (!dragId) return;
    // Pointer capture routes every move back to the handle, so the card
    // underneath has to be hit-tested rather than read off the event target.
    const under = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-card-id]") as HTMLElement | null;
    const overId = under?.dataset.cardId;
    if (!overId || overId === dragId) return;
    setLiveIds((cur) => {
      const list = cur ?? ids;
      // Cards never cross into another market group.
      if (!list.includes(overId)) return list;
      const next = list.filter((id) => id !== dragId);
      next.splice(next.indexOf(overId), 0, dragId);
      return next;
    });
  }

  function end() {
    if (dragId && liveIds) onReorder(liveIds);
    setDragId(null);
    setLiveIds(null);
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2 min-[900px]:gap-[14px]">
      {shown.map((id) =>
        cardProps.rows[id] ? (
          <AccountCard
            key={id}
            row={cardProps.rows[id]}
            dragging={dragId === id}
            onDragStart={(e) => start(e, id)}
            onDragMove={move}
            onDragEnd={end}
            onOpen={cardProps.onOpen}
            menuOpen={cardProps.menuFor === id}
            menuProps={cardProps.menuProps}
          />
        ) : null
      )}
    </div>
  );
}

function AccountCard({
  row,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onOpen,
  menuOpen,
  menuProps,
}: {
  row: Row;
  dragging: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
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
      data-card-id={acc.id}
      onPointerUp={(e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        // The drag handle and the menu are buttons — neither should navigate.
        if ((e.target as HTMLElement).closest("button")) return;
        onOpen(acc.id);
      }}
      className={`cursor-pointer rounded-lg border bg-[var(--n-card-2)] px-4 py-[14px] transition min-[900px]:px-[18px] min-[900px]:py-4 ${
        dragging
          ? "border-[var(--n-accent-on)] opacity-60"
          : "border-[var(--n-border-2)] hover:border-[var(--n-border-1)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Reorder ${acc.name}`}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          // touch-none stops the browser scrolling the page mid-drag.
          className="-ml-1 shrink-0 cursor-grab touch-none px-1 text-[var(--n-faint)] transition hover:text-[var(--n-text-2)] active:cursor-grabbing"
        >
          ⠿
        </button>
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
          {idle ? (
            <Dash />
          ) : (
            <span className={pnlColor(leadValue)}>{formatSignedCurrency(leadValue)}</span>
          )}
        </span>
        <span>
          {open} open position{open === 1 ? "" : "s"}
        </span>
      </div>

      {/* Desktop: the full 2x2. */}
      <div className="hidden grid-cols-2 gap-x-3 gap-y-2 text-[11.5px] text-[var(--n-label)] min-[900px]:grid">
        <span>
          Unrealized{" "}
          {idle ? (
            <Dash />
          ) : (
            <span className={pnlColor(s.unrealized)}>{formatSignedCurrency(s.unrealized)}</span>
          )}
        </span>
        <span className="text-right">
          Realized{" "}
          {idle ? (
            <Dash />
          ) : (
            <span className={pnlColor(s.realized)}>{formatSignedCurrency(s.realized)}</span>
          )}
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
