"use client";

import type { Quote, WatchlistItem } from "@/lib/types";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";

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
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        Your watchlist is empty. Add symbols to keep an eye on them.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Day %</th>
            <th className="px-4 py-3 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const q = quotes[item.symbol.toUpperCase()];
            return (
              <tr key={item.id} className="border-b border-border last:border-0 hover:bg-background">
                <td
                  onClick={() => onSelect(item.symbol)}
                  className="cursor-pointer px-4 py-3 font-semibold"
                >
                  {item.symbol}
                </td>
                <td className="px-4 py-3 text-right">{q ? formatCurrency(q.price) : "…"}</td>
                <td className={`px-4 py-3 text-right ${changeColor(q?.percentChange ?? 0)}`}>
                  {q ? formatPercent(q.percentChange) : "…"}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
