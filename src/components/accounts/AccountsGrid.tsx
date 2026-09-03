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
import AccountsTable from "./AccountsTable";
import AccountCards from "./AccountCards";
import NewAccountButton from "./NewAccountButton";
import type { Freshness } from "@/lib/quote-freshness";
import {
  applyOrder,
  buildRows,
  ORDER_KEY,
  VIEW_KEY,
  type AccountSummary,
  type BandTotals,
  type MarketGroup,
  type ViewMode,
} from "./nocturne";

export default function AccountsGrid({
  accounts,
  summary,
  band,
  groups,
  freshness,
}: {
  accounts: Account[];
  summary: Record<string, AccountSummary>;
  band: BandTotals;
  groups: MarketGroup[];
  freshness?: Freshness;
}) {
  const router = useRouter();

  const [view, setView] = useState<ViewMode>("table");
  // One flag per market group, every group expanded until the user says
  // otherwise. Deliberately not persisted.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Per-group card order, saved per browser. Dragging happens in the card
  // view, but the order it produces is the account order — so the table
  // follows it too rather than the two views disagreeing.
  const [order, setOrder] = useState<Record<string, string[]>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<Account | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFor, setDeleteFor] = useState<Account | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Saved view. SSR renders the default, so this is read after mount to keep
  // hydration matched.
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "cards" || v === "table") setView(v);
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) setOrder(saved);
    } catch {}
  }, []);

  const rows = useMemo(() => buildRows(accounts, summary), [accounts, summary]);

  // Market order from the server, with the saved drag order laid over each
  // group's members.
  const orderedGroups = useMemo(
    () => groups.map((g) => ({ ...g, ids: applyOrder(g.ids, order[g.key]) })),
    [groups, order]
  );

  function reorder(groupKey: string, ids: string[]) {
    const next = { ...order, [groupKey]: ids };
    setOrder(next);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {}
  }

  const toggleGroup = (key: string) => setOpenGroups((g) => ({ ...g, [key]: g[key] === false }));

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

  const listProps = {
    groups: orderedGroups,
    rows,
    openGroups,
    onToggleGroup: toggleGroup,
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
          takenTypes={accounts.map((a) => a.type)}
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

  // No accounts yet: the band has nothing to summarise, but WelcomeHero points
  // down at this action, so the primary action itself stays.
  if (accounts.length === 0) {
    return (
      <div data-nocturne>
        <NewAccountButton onClick={() => setShowCreate(true)} />
        {modals}
      </div>
    );
  }

  return (
    <div data-nocturne>
      <PortfolioBand band={band} freshness={freshness} onNewAccount={() => setShowCreate(true)} />

      {/* Its own row, right-aligned, directly above the list. Desktop only:
          below 900px there is no table to switch to. */}
      <div className="mt-6 mb-3 hidden justify-end min-[900px]:flex">
        <div
          role="group"
          aria-label="List view"
          className="flex gap-0.5 rounded-lg border border-[var(--n-border-2)] bg-[var(--n-cell)] p-0.5"
        >
          {(["table", "cards"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                try {
                  localStorage.setItem(VIEW_KEY, v);
                } catch {}
              }}
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
      </div>

      {/* Which layout shows is decided in CSS, not JS: the cards are always
          rendered and simply hidden on desktop when Table is selected, so the
          server and client markup always agree. */}
      {view === "table" && (
        <div className="mt-4 hidden min-[900px]:block">
          <AccountsTable {...listProps} />
        </div>
      )}
      <div className={`mt-4 ${view === "table" ? "min-[900px]:hidden" : ""}`}>
        <AccountCards {...listProps} onReorder={reorder} />
      </div>

      {modals}
    </div>
  );
}
