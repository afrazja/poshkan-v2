"use client";

import { useEffect, useState } from "react";
import type { Quote, NewsItem } from "@/lib/types";
import { formatCurrency, formatPercent, formatCompactUSD, changeColor } from "@/lib/format";
import { createAlertAction } from "@/app/dashboard/[accountId]/actions";
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
  watchPending,
}: {
  symbol: string;
  name: string;
  liveQuote?: Quote;
  heldShares: number;
  inWatchlist: boolean;
  onBuy: () => void;
  onSell: () => void;
  onToggleWatch: () => void;
  watchPending?: boolean;
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
              <div className="mt-0.5 text-xs">
                {quote.isMarketOpen ? (
                  <span className="text-positive">● Live price</span>
                ) : (
                  <span className="text-muted">○ Market closed · last close shown</span>
                )}
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

      {/* Earnings + price alert */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <span className="text-muted">
          Next earnings:{" "}
          <span className="font-medium text-foreground">{fmtDate(quote?.earningsDate)}</span>
        </span>
        <AlertForm symbol={symbol} currentPrice={quote?.price} />
      </div>

      <NewsSection symbol={symbol} />

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
          disabled={watchPending}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-background disabled:opacity-50"
        >
          {watchPending ? "…" : inWatchlist ? "★ In watchlist" : "☆ Add to watchlist"}
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
function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Inline "set a price alert" form — also reused by the watchlist rows.
export function AlertForm({ symbol, currentPrice }: { symbol: string; currentPrice?: number }) {
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [target, setTarget] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (state === "saved") {
    return <span className="text-xs font-medium text-positive">✓ Alert set — see dashboard</span>;
  }
  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          if (!target && currentPrice) setTarget(currentPrice.toFixed(2));
        }}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-card"
      >
        🔔 Set alert
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select
        value={condition}
        onChange={(e) => setCondition(e.target.value as "ABOVE" | "BELOW")}
        className="rounded-md border border-border bg-input px-1.5 py-1 text-xs outline-none"
      >
        <option value="ABOVE">Rises to</option>
        <option value="BELOW">Drops to</option>
      </select>
      <input
        type="number"
        min="0"
        step="any"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="w-24 rounded-md border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
        placeholder="0.00"
      />
      <button
        disabled={state === "saving"}
        onClick={async () => {
          setState("saving");
          const res = await createAlertAction({
            symbol,
            condition,
            targetPrice: Number(target) || 0,
          });
          setState(res.error ? "error" : "saved");
        }}
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {state === "saving" ? "…" : "Save"}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-foreground">
        ✕
      </button>
      {state === "error" && <span className="text-xs text-negative">Couldn&apos;t set the alert — try again.</span>}
    </span>
  );
}

// Latest headlines for the symbol.
function NewsSection({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => active && setNews(j.news ?? []))
      .catch(() => active && setNews([]));
    return () => {
      active = false;
    };
  }, [symbol]);

  if (news === null || news.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">News</h4>
      <div className="space-y-2">
        {news.slice(0, 5).map((n) => (
          <a
            key={n.link}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-border bg-background px-3 py-2 transition hover:border-primary/50"
          >
            <div className="text-sm font-medium leading-snug">{n.title}</div>
            <div className="mt-0.5 text-xs text-muted">
              {n.publisher}
              {n.publishedAt ? ` · ${fmtDate(n.publishedAt)}` : ""}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
