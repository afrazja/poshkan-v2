"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { formatCurrency } from "@/lib/format";
import { executeTradeAction } from "@/app/dashboard/[accountId]/actions";
import PriceChart from "./PriceChart";

export default function TradeModal({
  accountId,
  symbol,
  side,
  price: initialPrice,
  cash,
  maxShares,
  onClose,
}: {
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  cash: number;
  maxShares?: number; // for SELL
  onClose: () => void;
}) {
  const router = useRouter();
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(initialPrice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ price: number } | null>(null);

  // If we opened without a fresh price, fetch one so the estimate is accurate.
  useEffect(() => {
    if (initialPrice > 0) {
      setPrice(initialPrice);
      return;
    }
    let active = true;
    fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => {
        if (active && j.quote?.price) setPrice(j.quote.price);
      });
    return () => {
      active = false;
    };
  }, [symbol, initialPrice]);

  const quantity = Number(qty) || 0;
  const estimate = quantity * price;
  const affordable = side === "BUY" ? estimate <= cash : true;
  const enoughShares = side === "SELL" ? quantity <= (maxShares ?? 0) : true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (quantity <= 0) return setError("Enter a quantity.");
    if (!affordable) return setError("Not enough cash for this order.");
    if (!enoughShares) return setError("You don't hold that many shares.");

    setLoading(true);
    const result = await executeTradeAction({ accountId, symbol, side, quantity });
    setLoading(false);
    if (result.error) return setError(result.error);
    setDone({ price: result.price ?? price });
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <Modal title={`${side === "BUY" ? "Buy" : "Sell"} ${symbol}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm">
            {side === "BUY" ? "Bought" : "Sold"} <strong>{quantity}</strong> share
            {quantity === 1 ? "" : "s"} of <strong>{symbol}</strong> at{" "}
            <strong>{formatCurrency(done.price)}</strong>.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}
          <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
            <span className="text-muted">Market price</span>
            <span className="font-semibold">{formatCurrency(price)}</span>
          </div>

          <PriceChart symbol={symbol} />

          <div>
            <label className="mb-1 block text-sm font-medium">Quantity (shares)</label>
            <input
              type="number"
              min="0"
              step="any"
              autoFocus
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
            {side === "SELL" && (
              <button
                type="button"
                onClick={() => setQty(String(maxShares ?? 0))}
                className="mt-1 text-xs text-primary hover:underline"
              >
                Max: {maxShares} shares
              </button>
            )}
          </div>

          <div className="flex justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted">Estimated {side === "BUY" ? "cost" : "proceeds"}</span>
            <span className="font-semibold">{formatCurrency(estimate)}</span>
          </div>
          {side === "BUY" && (
            <div className="flex justify-between text-xs text-muted">
              <span>Available cash</span>
              <span>{formatCurrency(cash)}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || quantity <= 0 || !affordable || !enoughShares}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${
              side === "BUY" ? "bg-positive" : "bg-negative"
            }`}
          >
            {loading ? "Placing…" : `${side === "BUY" ? "Buy" : "Sell"} ${symbol}`}
          </button>
          <p className="text-center text-xs text-muted">
            Order fills at the live market price at execution.
          </p>
        </form>
      )}
    </Modal>
  );
}
