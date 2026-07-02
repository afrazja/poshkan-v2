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

export default function CreateAccountModal({
  onClose,
  existingNames = [],
}: {
  onClose: () => void;
  existingNames?: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(() => defaultName("stocks", existingNames));
  const [nameEdited, setNameEdited] = useState(false);
  const [type, setType] = useState("stocks");
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
              <option value="stocks">Stocks</option>
              <option value="crypto">Crypto</option>
              <option value="forex">Forex</option>
            </select>
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
            disabled={loading}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
