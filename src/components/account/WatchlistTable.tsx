"use client";

import { useMemo, useState } from "react";
import type { Quote, WatchlistItem } from "@/lib/types";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";
import { symbolLabel } from "@/lib/assets";
import SortHeader, { nextSort, type SortState } from "./SortHeader";
import { AlertForm } from "./SymbolPanel";
import Sparkline from "@/components/Sparkline";

export default function WatchlistTable({
  items,
  quotes,
  sparks = {},
  onSelect,
  onBuy,
  onRemove,
  pendingSymbol,
}: {
  items: WatchlistItem[];
  quotes: Record<string, Quote>;
  sparks?: Record<string, number[]>;
  onSelect: (symbol: string) => void;
  onBuy: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  pendingSymbol?: string | null;
}) {
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = useMemo(
    () =>
      items.map((item) => {
        const q = quotes[item.symbol.toUpperCase()];
        return { item, q, price: q?.price ?? 0, dayPct: q?.percentChange ?? 0 };
      }),
    [items, quotes]
  );

  type Row = (typeof rows)[number];
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const value = (r: Row): number | string => {
      switch (sort.key) {
        case "symbol": return r.item.symbol;
        case "price": return r.price;
        case "dayPct": return r.dayPct;
        default: return 0;
      }
    };
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : av - (bv as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort]);

  function onSort(key: string) {
    setSort((prev) => nextSort(prev, key, key === "symbol" ? "asc" : "desc"));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        Your watchlist is empty. Add symbols to keep an eye on them.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="space-y-2 sm:hidden">
        {sorted.map(({ item, q, price, dayPct }) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <button onClick={() => onSelect(item.symbol)} className="text-left">
                <div className="flex items-center gap-2 font-semibold">
                  {symbolLabel(item.symbol)}
                  {sparks[item.symbol.toUpperCase()] && (
                    <Sparkline values={sparks[item.symbol.toUpperCase()]} width={52} height={16} />
                  )}
                </div>
                <div className="text-xs text-muted">
                  {q ? formatCurrency(price) : "…"} ·{" "}
                  <span className={changeColor(dayPct)}>{q ? formatPercent(dayPct) : "…"}</span>
                </div>
              </button>
              <button
                onClick={() => onRemove(item.symbol)}
                disabled={pendingSymbol === item.symbol}
                className="text-xs text-muted hover:text-negative disabled:opacity-50"
              >
                {pendingSymbol === item.symbol ? "…" : "Remove"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onBuy(item.symbol)}
                className="rounded-md bg-positive px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
              >
                Buy
              </button>
              <AlertForm symbol={item.symbol} currentPrice={q?.price} />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: full sortable table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <SortHeader label="Symbol" sortKey="symbol" sort={sort} onSort={onSort} align="left" />
            <SortHeader label="Price" sortKey="price" sort={sort} onSort={onSort} />
            <SortHeader label="Day %" sortKey="dayPct" sort={sort} onSort={onSort} />
            <th className="px-4 py-3 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ item, q, price, dayPct }) => (
            <tr key={item.id} className="border-b border-border last:border-0 hover:bg-background">
              <td
                onClick={() => onSelect(item.symbol)}
                className="cursor-pointer px-4 py-3 font-semibold"
              >
                <span className="flex items-center gap-2.5">
                  {symbolLabel(item.symbol)}
                  {sparks[item.symbol.toUpperCase()] && (
                    <Sparkline values={sparks[item.symbol.toUpperCase()]} width={56} height={18} className="opacity-90" />
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-right">{q ? formatCurrency(price) : "…"}</td>
              <td className={`px-4 py-3 text-right ${changeColor(dayPct)}`}>
                {q ? formatPercent(dayPct) : "…"}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2.5">
                  <button
                    onClick={() => onBuy(item.symbol)}
                    className="rounded-md bg-positive px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Buy
                  </button>
                  <AlertForm symbol={item.symbol} currentPrice={q?.price} />
                  <button
                    onClick={() => onRemove(item.symbol)}
                    disabled={pendingSymbol === item.symbol}
                    className="text-xs text-muted hover:text-negative disabled:opacity-50"
                  >
                    {pendingSymbol === item.symbol ? "…" : "Remove"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
