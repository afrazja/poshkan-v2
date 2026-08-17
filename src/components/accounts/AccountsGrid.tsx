"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/types";
import CreateAccountModal from "./CreateAccountModal";
import CashModal from "@/components/account/CashModal";
import Modal from "@/components/Modal";
import {
  renameAccountAction,
  deleteAccountAction,
  setAccountNotifyAction,
} from "@/app/dashboard/[accountId]/actions";
import PortfolioBand from "./PortfolioBand";
import SortRow from "./SortRow";
import AccountsTable from "./AccountsTable";
import AccountCards from "./AccountCards";
import IdleStrip from "./IdleStrip";
import {
  buildRows,
  sortRows,
  ORDER_KEY,
  SORT_KEY,
  VIEW_KEY,
  type AccountSummary,
  type BandTotals,
  type SortKey,
  type ViewMode,
} from "./nocturne";

export default function AccountsGrid({
  accounts,
  summary,
  sparks = {},
  band,
  lastTrade = {},
}: {
  accounts: Account[];
  summary: Record<string, AccountSummary>;
  sparks?: Record<string, number[]>;
  band: BandTotals;
  lastTrade?: Record<string, string>;
}) {
  const router = useRouter();

  const [view, setView] = useState<ViewMode>("table");
  const [sort, setSort] = useState<SortKey>("value");
  const [order, setOrder] = useState<string[]>(accounts.map((a) => a.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [idleExpanded, setIdleExpanded] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<Account | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFor, setDeleteFor] = useState<Account | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Saved view and sort. SSR renders the defaults, so these are read after
  // mount to keep hydration matched.
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "cards" || v === "table") setView(v);
      const s = localStorage.getItem(SORT_KEY);
      if (s && ["value", "today", "unrealized", "activity", "custom"].includes(s)) {
        setSort(s as SortKey);
      }
    } catch {}
  }, []);

  // The strip is noise next to a dense table but reads as part of the set in
  // the card view, so its default follows the view.
  useEffect(() => setIdleExpanded(view === "cards"), [view]);

  // Saved drag order, reconciled with the current accounts: new ones append,
  // deleted ones drop out.
  useEffect(() => {
    const ids = accounts.map((a) => a.id);
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
    } catch {}
    setOrder([...saved.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.includes(id))]);
  }, [accounts]);

  function persist(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  function persistOrder(next: string[]) {
    setOrder(next);
    persist(ORDER_KEY, JSON.stringify(next));
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    persistOrder(next);
  }

  const { activeRows, idleRows } = useMemo(() => {
    const rows = buildRows(accounts, summary, band.idleIds, lastTrade);
    // Custom order is the saved drag sequence; every other sort ignores it.
    const base =
      sort === "custom"
        ? order.map((id) => rows.find((r) => r.acc.id === id)).filter((r): r is NonNullable<typeof r> => !!r)
        : rows;
    return {
      activeRows: sortRows(base.filter((r) => !r.idle), sort),
      idleRows: base.filter((r) => r.idle),
    };
  }, [accounts, summary, band.idleIds, lastTrade, order, sort]);

  const draggable = sort === "custom";

  async function doRename() {
    if (!renameFor) return;
    setErr(null);
    setBusy(true);
    const res = await renameAccountAction(renameFor.id, renameValue);
    setBusy(false);
    if (res.error) return setErr(res.error);
    setRenameFor(null);
    router.refresh();
  }

  async function doDelete() {
    if (!deleteFor) return;
    setErr(null);
    setBusy(true);
    const res = await deleteAccountAction(deleteFor.id);
    setBusy(false);
    if (res.error) return setErr(res.error);
    setDeleteFor(null);
    router.refresh();
  }

  const menuProps = (acc: Account) => ({
    onToggle: () => setMenuFor(menuFor === acc.id ? null : acc.id),
    onRename: () => {
      setRenameValue(acc.name);
      setErr(null);
      setRenameFor(acc);
      setMenuFor(null);
    },
    onMute: async () => {
      setMenuFor(null);
      await setAccountNotifyAction(acc.id, acc.notify_enabled === false);
      router.refresh();
    },
    onReset: () => {
      setResetFor(acc.id);
      setMenuFor(null);
    },
    onDelete: () => {
      setErr(null);
      setDeleteFor(acc);
      setMenuFor(null);
    },
  });

  const shared = {
    draggable,
    dragId,
    onDragStart: setDragId,
    onDragEnd: () => setDragId(null),
    onDropOn: dropOn,
    onOpen: (id: string) => router.push(`/dashboard/${id}`),
    menuFor,
    menuProps,
  };

  const modals = (
    <>
      {menuFor && <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />}

      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          existingNames={accounts.map((a) => a.name)}
        />
      )}

      {resetFor && <CashModal accountId={resetFor} mode="RESET" onClose={() => setResetFor(null)} />}

      {renameFor && (
        <Modal title="Rename account" onClose={() => setRenameFor(null)}>
          <div className="space-y-4">
            {err && <p className="text-sm text-negative">{err}</p>}
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={doRename}
              disabled={busy || renameValue.trim().length < 3}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save name"}
            </button>
          </div>
        </Modal>
      )}

      {deleteFor && (
        <Modal title="Delete this account?" onClose={() => setDeleteFor(null)}>
          <div className="space-y-4">
            {err && <p className="text-sm text-negative">{err}</p>}
            <p className="text-sm">
              <strong>{deleteFor.name}</strong> and all of its holdings, watchlist, orders, and
              transaction history will be{" "}
              <strong className="text-negative">permanently deleted</strong>. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteFor(null)}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-background"
              >
                Keep account
              </button>
              <button
                onClick={doDelete}
                disabled={busy}
                className="flex-1 rounded-lg bg-negative py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );

  // No accounts yet: WelcomeHero carries the page and points down at this
  // tile ("…or scroll down to build your own"), so the tile stays even though
  // the band and sort row have nothing to summarise.
  if (accounts.length === 0) {
    return (
      <div data-nocturne>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--n-border-1)] transition hover:border-[var(--n-accent-border)] sm:max-w-xs"
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--n-accent-border)] text-[17px] leading-none text-[var(--n-accent-on)]">
            +
          </span>
          <span className="text-[12px] text-[var(--n-mute)]">New account</span>
        </button>
        {modals}
      </div>
    );
  }

  return (
    <div data-nocturne>
      <PortfolioBand
        band={band}
        view={view}
        onViewChange={(v) => {
          setView(v);
          persist(VIEW_KEY, v);
        }}
      />

      <SortRow
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          persist(SORT_KEY, s);
        }}
        onNewAccount={() => setShowCreate(true)}
      />

      {view === "table" ? (
        <AccountsTable rows={activeRows} idleRows={idleRows} {...shared} />
      ) : (
        <AccountCards
          rows={activeRows}
          sparks={sparks}
          onNewAccount={() => setShowCreate(true)}
          {...shared}
        />
      )}

      <IdleStrip
        rows={idleRows}
        expanded={idleExpanded}
        onToggle={() => setIdleExpanded((v) => !v)}
      />

      {modals}
    </div>
  );
}
