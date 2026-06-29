"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/types";
import { formatCurrency, formatSignedCurrency, changeColor } from "@/lib/format";
import CreateAccountModal from "./CreateAccountModal";
import CashModal from "@/components/account/CashModal";
import Modal from "@/components/Modal";
import { renameAccountAction, deleteAccountAction } from "@/app/dashboard/[accountId]/actions";

export default function AccountsGrid({
  accounts,
  summary,
}: {
  accounts: Account[];
  summary: Record<string, { marketValue: number; holdings: number; unrealized: number; realized: number }>;
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<Account | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFor, setDeleteFor] = useState<Account | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((acc) => {
          const s = summary[acc.id] ?? { marketValue: 0, holdings: 0, unrealized: 0, realized: 0 };
          const total = Number(acc.cash_balance) + s.marketValue;
          return (
            <div key={acc.id} className="relative">
              <Link
                href={`/dashboard/${acc.id}`}
                className="group block rounded-2xl border border-border bg-card p-5 transition hover:border-primary hover:shadow-md"
              >
                <div className="mb-3 flex items-center gap-2 pr-8">
                  <h3 className="font-semibold">{acc.name}</h3>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium capitalize text-muted">
                    {acc.type}
                  </span>
                </div>
                <div className="text-2xl font-bold">{formatCurrency(total)}</div>
                <div className="mt-1 text-xs text-muted">account value</div>
                <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted">
                    Cash <span className="text-foreground">{formatCurrency(Number(acc.cash_balance))}</span>
                  </span>
                  <span className="text-muted">
                    {s.holdings} holding{s.holdings === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted">
                    Unrealized{" "}
                    <span className={changeColor(s.unrealized)}>{formatSignedCurrency(s.unrealized)}</span>
                  </span>
                  <span className="text-muted">
                    Realized{" "}
                    <span className={changeColor(s.realized)}>{formatSignedCurrency(s.realized)}</span>
                  </span>
                </div>
              </Link>

              {/* Edit menu (Rename / Reset / Delete) — sits above the card link */}
              <div className="absolute right-3 top-4">
                <button
                  onClick={() => setMenuFor(menuFor === acc.id ? null : acc.id)}
                  aria-label="Edit account"
                  aria-haspopup="menu"
                  className="relative z-20 rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-background hover:text-foreground"
                >
                  ⋯
                </button>
                {menuFor === acc.id && (
                  <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
                    <MenuItem
                      onClick={() => {
                        setRenameValue(acc.name);
                        setErr(null);
                        setRenameFor(acc);
                        setMenuFor(null);
                      }}
                    >
                      Rename
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setResetFor(acc.id);
                        setMenuFor(null);
                      }}
                    >
                      Reset
                    </MenuItem>
                    <MenuItem
                      danger
                      onClick={() => {
                        setErr(null);
                        setDeleteFor(acc);
                        setMenuFor(null);
                      }}
                    >
                      Delete
                    </MenuItem>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* + create card */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted transition hover:border-primary hover:text-primary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-current text-2xl">
            +
          </span>
          <span className="text-sm font-medium">New account</span>
        </button>
      </div>

      {/* Click-away backdrop for the open menu */}
      {menuFor && <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} />}

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
              disabled={busy || !renameValue.trim()}
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
              transaction history will be <strong className="text-negative">permanently deleted</strong>.
              This cannot be undone.
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
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-background ${
        danger ? "text-negative" : "text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
