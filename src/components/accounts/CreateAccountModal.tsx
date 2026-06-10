"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import SymbolSearch from "@/components/SymbolSearch";
import { createAccountAction, type NewHolding } from "@/app/dashboard/actions";

interface HoldingRow {
  symbol: string;
  name: string;
  quantity: string; // keep as string for controlled input
  avgPrice: string;
}

export default function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("stocks");
  const [cash, setCash] = useState("10000");
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  function addRow(symbol: string, companyName: string) {
    if (rows.some((r) => r.symbol === symbol)) return;
    setRows((r) => [...r, { symbol, name: companyName, quantity: "", avgPrice: "" }]);
  }

  function updateRow(i: number, patch: Partial<HoldingRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const holdings: NewHolding[] = [];
    for (const r of rows) {
      const qty = Number(r.quantity);
      if (!qty || qty <= 0) continue;
      const price = Number(r.avgPrice);
      if (!price || price <= 0) {
        setError(`Enter an average price for ${r.symbol}.`);
        return;
      }
      holdings.push({ symbol: r.symbol, quantity: qty, avg_price: price });
    }

    setLoading(true);
    const result = await createAccountAction({
      name,
      type,
      initialCash: Number(cash) || 0,
      holdings,
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
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="My first portfolio"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
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

        {/* Forex accounts start with cash only (positions are leveraged pairs). */}
        <div className={type === "forex" ? "hidden" : undefined}>
          <label className="mb-1 block text-sm font-medium">
            Initial holdings <span className="font-normal text-muted">(optional)</span>
          </label>
          <SymbolSearch
            assetType={type}
            onSelect={(r) => addRow(r.symbol, r.name)}
            placeholder="Add a stock you already 'own'…"
          />

          {rows.length > 0 && (
            <div className="mt-3 space-y-2">
              {rows.map((row, i) => {
                const qtyEntered = Number(row.quantity) > 0;
                return (
                  <div
                    key={row.symbol}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{row.symbol}</span>
                        <span className="ml-2 text-xs text-muted">{row.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-sm text-muted hover:text-negative"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-muted">Quantity</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.quantity}
                          onChange={(e) => updateRow(i, { quantity: e.target.value })}
                          className={inputClass}
                          placeholder="Shares"
                        />
                      </div>
                      {/* Average-price field appears only after a quantity is entered */}
                      {qtyEntered && (
                        <div>
                          <label className="mb-1 block text-xs text-muted">
                            Average buy price ($)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.avgPrice}
                            onChange={(e) => updateRow(i, { avgPrice: e.target.value })}
                            className={inputClass}
                            placeholder="Your cost basis"
                            autoFocus
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
