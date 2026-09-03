"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { createAccountAction } from "@/app/dashboard/actions";

const TYPE_LABEL: Record<string, string> = { stocks: "Stocks", crypto: "Crypto", forex: "Forex" };

// A meaningful pre-filled name ("My Forex", "My Forex 2", …) — account names
// show up in activity feeds and the leaderboard, so one-letter names read badly.
function defaultName(type: string, taken: string[]): string {
  const base = `My ${TYPE_LABEL[type] ?? "Trading"}`;
  const lower = taken.map((n) => n.trim().toLowerCase());
  if (!lower.includes(base.toLowerCase())) return base;
  let i = 2;
  while (lower.includes(`${base.toLowerCase()} ${i}`)) i++;
  return `${base} ${i}`;
}

const MARKETS = ["stocks", "crypto", "forex"] as const;

export default function CreateAccountModal({
  onClose,
  existingNames = [],
  takenTypes = [],
}: {
  onClose: () => void;
  existingNames?: string[];
  /** Markets this user already has an account in - one each is the limit. */
  takenTypes?: string[];
}) {
  const router = useRouter();
  const free = MARKETS.filter((m) => !takenTypes.includes(m));
  const firstFree = free[0] ?? "stocks";
  const [name, setName] = useState(() => defaultName(firstFree, existingNames));
  const [nameEdited, setNameEdited] = useState(false);
  const [type, setType] = useState<string>(firstFree);
  const [cash, setCash] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 3) {
      setError("Give the account a name of at least 3 characters — it appears in activity feeds and the leaderboard.");
      return;
    }

    setLoading(true);
    const result = await createAccountAction({
      name,
      type,
      initialCash: Number(cash) || 0,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
    if (result.accountId) router.push(`/dashboard/${result.accountId}`);
  }

  return (
    <Modal title="Create a new account" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-sm font-medium">Account name</label>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
              className={inputClass}
              placeholder="My first portfolio"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                // keep the suggested name in sync with the type until the user types their own
                if (!nameEdited) setName(defaultName(e.target.value, existingNames));
              }}
              className={inputClass}
            >
              {MARKETS.map((m) => (
                <option key={m} value={m} disabled={takenTypes.includes(m)}>
                  {TYPE_LABEL[m]}
                  {takenTypes.includes(m) ? " — already have one" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              One account per market, so a rank and a record in it mean something whole.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Initial cash ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Accounts start with cash only — every position is bought at a live
            market price, so all P&L (and leaderboard rank) is earned in-app. */}
        <p className="text-xs text-muted">
          Your account starts with virtual cash. Buy your first positions at live market prices —
          that keeps every P&L number (and the leaderboard) honest.
        </p>

        {free.length === 0 && (
          <p className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-600 dark:text-orange-400">
            You already have an account in all three markets, which is the limit. Use the ones you have -
            resetting an account’s cash is on its ⋯ menu.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || free.length === 0}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
