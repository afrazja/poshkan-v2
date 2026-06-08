"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/types";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";

export default function SymbolPanel({
  symbol,
  name,
  liveQuote,
  heldShares,
  inWatchlist,
  onBuy,
  onSell,
  onToggleWatch,
}: {
  symbol: string;
  name: string;
  liveQuote?: Quote;
  heldShares: number;
  inWatchlist: boolean;
  onBuy: () => void;
  onSell: () => void;
  onToggleWatch: () => void;
}) {
  const [quote, setQuote] = useState<Quote | undefined>(liveQuote);
  const [loading, setLoading] = useState(!liveQuote);

  // Fetch a one-off quote when the symbol isn't already in the polled set.
  useEffect(() => {
    if (liveQuote) {
      setQuote(liveQuote);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => {
        if (active && j.quote) setQuote(j.quote);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [symbol, liveQuote]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">{symbol}</h3>
            {heldShares > 0 && (
              <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">
                You hold {heldShares}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">{name}</p>
        </div>
        <div className="text-right">
          {loading || !quote ? (
            <div className="text-sm text-muted">Loading price…</div>
          ) : (
            <>
              <div className="text-2xl font-bold">{formatCurrency(quote.price)}</div>
              <div className={`text-sm font-medium ${changeColor(quote.percentChange)}`}>
                {formatCurrency(quote.change)} ({formatPercent(quote.percentChange)}) today
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onBuy}
          className="rounded-lg bg-positive px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Buy
        </button>
        <button
          onClick={onSell}
          disabled={heldShares <= 0}
          className="rounded-lg bg-negative px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sell
        </button>
        <button
          onClick={onToggleWatch}
          className="rounded-lg border border-border px-5 py-2 text-sm font-medium hover:bg-background"
        >
          {inWatchlist ? "★ In watchlist" : "☆ Add to watchlist"}
        </button>
      </div>
    </div>
  );
}
