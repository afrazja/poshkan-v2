"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/types";
import { formatCurrency, formatPercent, formatCompactUSD, changeColor } from "@/lib/format";
import PriceChart from "./PriceChart";

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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{name}</p>
          {heldShares > 0 && (
            <span className="mt-1 inline-block rounded-full bg-background px-2 py-0.5 text-xs text-muted">
              You hold {heldShares} {heldShares === 1 ? "share" : "shares"}
            </span>
          )}
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

      <div className="mt-4">
        <PriceChart symbol={symbol} height={180} />
      </div>

      {/* Key stats */}
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <KV label="Open" value={fmtPrice(quote?.open)} />
        <KV label="High" value={fmtPrice(quote?.dayHigh)} />
        <KV label="Low" value={fmtPrice(quote?.dayLow)} />
        <KV label="Mkt cap" value={formatCompactUSD(quote?.marketCap)} />
        <KV label="P/E ratio" value={fmtNum(quote?.peRatio)} />
        <KV label="52-wk high" value={fmtPrice(quote?.fiftyTwoWeekHigh)} />
        <KV label="Dividend" value={fmtDividend(quote?.dividendRate, quote?.price)} />
        <KV label="52-wk low" value={fmtPrice(quote?.fiftyTwoWeekLow)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onBuy}
          className="flex-1 rounded-lg bg-positive px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Buy
        </button>
        <button
          onClick={onSell}
          disabled={heldShares <= 0}
          className="flex-1 rounded-lg bg-negative px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sell
        </button>
        <button
          onClick={onToggleWatch}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-background"
        >
          {inWatchlist ? "★ In watchlist" : "☆ Add to watchlist"}
        </button>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function fmtPrice(v?: number): string {
  return v != null && Number.isFinite(v) ? formatCurrency(v) : "—";
}
function fmtNum(v?: number): string {
  return v != null && Number.isFinite(v) ? v.toFixed(2) : "—";
}
function fmtDividend(rate?: number, price?: number): string {
  if (!rate || !Number.isFinite(rate) || rate <= 0) return "—";
  const yld = price && price > 0 ? ` (${((rate / price) * 100).toFixed(2)}%)` : "";
  return `${formatCurrency(rate)}${yld}`;
}
