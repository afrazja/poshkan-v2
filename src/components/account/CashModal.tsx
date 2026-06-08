"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { adjustCashAction } from "@/app/dashboard/[accountId]/actions";

export default function CashModal({
  accountId,
  mode,
  onClose,
}: {
  accountId: string;
  mode: "DEPOSIT" | "RESET";
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(mode === "RESET" ? "10000" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await adjustCashAction({ accountId, mode, amount: Number(amount) || 0 });
    setLoading(false);
    if (result.error) return setError(result.error);
    onClose();
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <Modal title={mode === "DEPOSIT" ? "Add virtual cash" : "Reset account"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {error}
          </div>
        )}
        {mode === "RESET" && (
          <p className="text-sm text-muted">
            This clears <strong>all holdings</strong> and sets cash to the amount below.
            This cannot be undone.
          </p>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">
            {mode === "DEPOSIT" ? "Amount to add ($)" : "New starting cash ($)"}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 ${
            mode === "RESET" ? "bg-negative" : "bg-primary"
          }`}
        >
          {loading ? "Working…" : mode === "DEPOSIT" ? "Add cash" : "Reset account"}
        </button>
      </form>
    </Modal>
  );
}
