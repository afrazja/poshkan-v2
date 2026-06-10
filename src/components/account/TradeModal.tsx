"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { formatCurrency } from "@/lib/format";
import { executeTradeAction, placeLimitOrderAction } from "@/app/dashboard/[accountId]/actions";
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
  const [done, setDone] = useState<{ price: number; limit?: boolean } | null>(null);
  const [review, setReview] = useState(false);
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [tif, setTif] = useState<"DAY" | "GTC">("GTC");

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

  const isLimit = orderType === "LIMIT";
  const quantity = Number(qty) || 0;
  const limit = Number(limitPrice) || 0;
  const execPrice = isLimit ? limit : price;
  const estimate = quantity * execPrice;
  const affordable = side === "BUY" ? estimate <= cash : true;
  const enoughShares = side === "SELL" ? quantity <= (maxShares ?? 0) : true;

  function chooseType(t: "MARKET" | "LIMIT") {
    setOrderType(t);
    if (t === "LIMIT" && !limitPrice && price > 0) setLimitPrice(price.toFixed(2));
  }

  function goReview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (quantity <= 0) return setError("Enter a quantity.");
    if (isLimit && limit <= 0) return setError("Enter a limit price.");
    if (!affordable) return setError("Not enough cash for this order.");
    if (!enoughShares) return setError("You don't hold that many shares.");
    setReview(true);
  }

  async function confirm() {
    setError(null);
    setLoading(true);
    if (isLimit) {
      const res = await placeLimitOrderAction({
        accountId,
        symbol,
        side,
        quantity,
        limitPrice: limit,
        timeInForce: tif,
      });
      setLoading(false);
      if (res.error) return setError(res.error);
      setDone({ price: limit, limit: true });
      router.refresh();
      return;
    }
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
            {done.limit ? (
              <>
                Limit order placed:{" "}
                <strong>
                  {side === "BUY" ? "Buy" : "Sell"} {quantity} {symbol}
                </strong>{" "}
                at <strong>{formatCurrency(done.price)}</strong> or better. It fills automatically
                when the price is reached (while this account is open).
              </>
            ) : (
              <>
                {side === "BUY" ? "Bought" : "Sold"} <strong>{quantity}</strong> {symbol} at{" "}
                <strong>{formatCurrency(done.price)}</strong>.
              </>
            )}
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : review ? (
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}
          <p className="text-sm text-muted">Review your order before confirming.</p>
          <div className="space-y-2 rounded-lg border border-border bg-background p-4 text-sm">
            <ReviewRow label="Order type" value={isLimit ? "Limit" : "Market"} />
            {isLimit && (
              <ReviewRow label="Time in force" value={tif === "DAY" ? "Day (expires tonight)" : "Good til canceled"} />
            )}
            <ReviewRow label="Action" value={`${side === "BUY" ? "Buy" : "Sell"} ${symbol}`} />
            <ReviewRow label="Quantity" value={String(quantity)} />
            <ReviewRow
              label={isLimit ? "Limit price" : "Market price"}
              value={formatCurrency(execPrice)}
            />
            <ReviewRow
              label={`Estimated ${side === "BUY" ? "cost" : "proceeds"}`}
              value={formatCurrency(estimate)}
              bold
            />
            {side === "BUY" && <ReviewRow label="Cash after" value={formatCurrency(cash - estimate)} />}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReview(false)}
              className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-background"
            >
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={loading}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${
                side === "BUY" ? "bg-positive" : "bg-negative"
              }`}
            >
              {loading ? "Placing…" : isLimit ? "Place limit order" : `Confirm ${side === "BUY" ? "Buy" : "Sell"}`}
            </button>
          </div>
          <p className="text-center text-xs text-muted">
            {isLimit
              ? "Placed now; fills automatically when the market reaches your limit."
              : "Order fills at the live market price at execution."}
          </p>
        </div>
      ) : (
        <form onSubmit={goReview} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </div>
          )}
          <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
            {(["MARKET", "LIMIT"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => chooseType(t)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                  orderType === t ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                {t === "MARKET" ? "Market" : "Limit"}
              </button>
            ))}
          </div>

          <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
            <span className="text-muted">Market price</span>
            <span className="font-semibold">{formatCurrency(price)}</span>
          </div>

          <PriceChart symbol={symbol} />

          <div>
            <label className="mb-1 block text-sm font-medium">Quantity</label>
            <input
              type="number"
              min="0"
              step="any"
              autoFocus
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputClass}
              placeholder="0 (fractions allowed)"
            />
            {side === "SELL" && (
              <button
                type="button"
                onClick={() => setQty(String(maxShares ?? 0))}
                className="mt-1 text-xs text-primary hover:underline"
              >
                Max: {maxShares}
              </button>
            )}
          </div>

          {isLimit && (
            <div>
              <label className="mb-1 block text-sm font-medium">Limit price</label>
              <input
                type="number"
                min="0"
                step="any"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className={inputClass}
                placeholder={price > 0 ? price.toFixed(2) : "0.00"}
              />
              <p className="mt-1 text-xs text-muted">
                {side === "BUY"
                  ? "Fills when the price drops to or below this."
                  : "Fills when the price rises to or above this."}
              </p>
              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium">Time in force</label>
                <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
                  {(
                    [
                      { key: "GTC", label: "GTC", hint: "until canceled" },
                      { key: "DAY", label: "Day", hint: "expires tonight" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTif(t.key)}
                      className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                        tif === t.key ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                      }`}
                    >
                      {t.label} <span className="opacity-70">· {t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

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
            disabled={quantity <= 0 || !affordable || !enoughShares}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${
              side === "BUY" ? "bg-positive" : "bg-negative"
            }`}
          >
            Review order
          </button>
        </form>
      )}
    </Modal>
  );
}

function ReviewRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
