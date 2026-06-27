"use client";

import { useMemo, useState } from "react";
import type { Position, Quote } from "@/lib/types";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  changeColor,
} from "@/lib/format";
import SortHeader, { nextSort, type SortState } from "./SortHeader";

export default function HoldingsTable({
  positions,
  quotes,
  onSelect,
}: {
  positions: Position[];
  quotes: Record<string, Quote>;
  onSelect: (symbol: string) => void;
}) {
  const [sort, setSort] = useState<SortState | null>(null);

  // Derive the displayed/sortable values once per render.
  const rows = useMemo(
    () =>
      positions.map((p) => {
        const q = quotes[p.symbol.toUpperCase()];
        const qty = Number(p.quantity);
        const avg = Number(p.avg_cost);
        const price = q?.price ?? avg;
        const mktValue = qty * price;
        const pnl = mktValue - qty * avg;
        const pnlPct = avg > 0 ? ((price - avg) / avg) * 100 : 0;
        const dayPct = q?.percentChange ?? 0;
        const dayUsd = q ? qty * (price - q.previousClose) : 0; // today's $ move (vs prev close)
        return { p, q, qty, avg, price, mktValue, pnl, pnlPct, dayPct, dayUsd };
      }),
    [positions, quotes]
  );

  type Row = (typeof rows)[number];
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const value = (r: Row): number | string => {
      switch (sort.key) {
        case "symbol": return r.p.symbol;
        case "qty": return r.qty;
        case "avg": return r.avg;
        case "price": return r.price;
        case "dayPct": return r.dayPct;
        case "dayUsd": return r.dayUsd;
        case "mktValue": return r.mktValue;
        case "pnl": return r.pnl;
        case "pnlPct": return r.pnlPct;
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

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No holdings yet. Search for a stock above and buy your first shares.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards (the table is too wide for phones) */}
      <div className="space-y-2 sm:hidden">
        {sorted.map(({ p, q, qty, avg, price, mktValue, pnl, pnlPct, dayPct, dayUsd }) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.symbol)}
            className="w-full rounded-xl border border-border bg-card p-3 text-left"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.symbol}</span>
              <span className="font-semibold">{formatCurrency(mktValue)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>{formatNumber(qty)} sh · avg {formatCurrency(avg)}</span>
              <span className={changeColor(dayUsd)}>
                {q ? `${formatSignedCurrency(dayUsd)} (${formatPercent(dayPct)}) today` : "…"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted">{q ? formatCurrency(price) : "…"}</span>
              <span className={`font-medium ${changeColor(pnl)}`}>
                {formatSignedCurrency(pnl)} ({formatPercent(pnlPct)})
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: full sortable table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <SortHeader label="Symbol" sortKey="symbol" sort={sort} onSort={onSort} align="left" />
            <SortHeader label="Shares" sortKey="qty" sort={sort} onSort={onSort} />
            <SortHeader label="Avg cost" sortKey="avg" sort={sort} onSort={onSort} />
            <SortHeader label="Price" sortKey="price" sort={sort} onSort={onSort} />
            <SortHeader label="Day %" sortKey="dayPct" sort={sort} onSort={onSort} />
            <SortHeader label="Day $" sortKey="dayUsd" sort={sort} onSort={onSort} />
            <SortHeader label="Mkt value" sortKey="mktValue" sort={sort} onSort={onSort} />
            <SortHeader label="Total P&L" sortKey="pnl" sort={sort} onSort={onSort} />
            <SortHeader label="P&L %" sortKey="pnlPct" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ p, q, qty, avg, price, mktValue, pnl, pnlPct, dayPct, dayUsd }) => (
            <tr
              key={p.id}
              onClick={() => onSelect(p.symbol)}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-background"
            >
              <td className="px-4 py-3 font-semibold">{p.symbol}</td>
              <td className="px-4 py-3 text-right">{formatNumber(qty)}</td>
              <td className="px-4 py-3 text-right">{formatCurrency(avg)}</td>
              <td className="px-4 py-3 text-right">{q ? formatCurrency(price) : "…"}</td>
              <td className={`px-4 py-3 text-right ${changeColor(dayPct)}`}>
                {q ? formatPercent(dayPct) : "…"}
              </td>
              <td className={`px-4 py-3 text-right ${changeColor(dayUsd)}`}>
                {q ? formatSignedCurrency(dayUsd) : "…"}
              </td>
              <td className="px-4 py-3 text-right">{formatCurrency(mktValue)}</td>
              <td className={`px-4 py-3 text-right font-medium ${changeColor(pnl)}`}>
                {formatSignedCurrency(pnl)}
              </td>
              <td className={`px-4 py-3 text-right ${changeColor(pnlPct)}`}>
                {formatPercent(pnlPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
