"use client";

import { useMemo, useState } from "react";
import type { Quote, WatchlistItem } from "@/lib/types";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";
import SortHeader, { nextSort, type SortState } from "./SortHeader";

export default function WatchlistTable({
  items,
  quotes,
  onSelect,
  onRemove,
}: {
  items: WatchlistItem[];
  quotes: Record<string, Quote>;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
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
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
          >
            <button onClick={() => onSelect(item.symbol)} className="text-left">
              <div className="font-semibold">{item.symbol}</div>
              <div className="text-xs text-muted">
                {q ? formatCurrency(price) : "…"} ·{" "}
                <span className={changeColor(dayPct)}>{q ? formatPercent(dayPct) : "…"}</span>
              </div>
            </button>
            <button
              onClick={() => onRemove(item.symbol)}
              className="text-xs text-muted hover:text-negative"
            >
              Remove
            </button>
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
                {item.symbol}
              </td>
              <td className="px-4 py-3 text-right">{q ? formatCurrency(price) : "…"}</td>
              <td className={`px-4 py-3 text-right ${changeColor(dayPct)}`}>
                {q ? formatPercent(dayPct) : "…"}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onRemove(item.symbol)}
                  className="text-xs text-muted hover:text-negative"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
