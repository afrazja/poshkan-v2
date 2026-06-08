"use client";

import type { Position, Quote } from "@/lib/types";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  changeColor,
} from "@/lib/format";

export default function HoldingsTable({
  positions,
  quotes,
  onSelect,
}: {
  positions: Position[];
  quotes: Record<string, Quote>;
  onSelect: (symbol: string) => void;
}) {
  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No holdings yet. Search for a stock above and buy your first shares.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 text-right font-medium">Shares</th>
            <th className="px-4 py-3 text-right font-medium">Avg cost</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Day %</th>
            <th className="px-4 py-3 text-right font-medium">Mkt value</th>
            <th className="px-4 py-3 text-right font-medium">Total P&amp;L</th>
            <th className="px-4 py-3 text-right font-medium">P&amp;L %</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const q = quotes[p.symbol.toUpperCase()];
            const qty = Number(p.quantity);
            const avg = Number(p.avg_cost);
            const price = q?.price ?? avg;
            const mktValue = qty * price;
            const cost = qty * avg;
            const pnl = mktValue - cost;
            const pnlPct = avg > 0 ? ((price - avg) / avg) * 100 : 0;
            const dayPct = q?.percentChange ?? 0;
            return (
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
                <td className="px-4 py-3 text-right">{formatCurrency(mktValue)}</td>
                <td className={`px-4 py-3 text-right font-medium ${changeColor(pnl)}`}>
                  {formatSignedCurrency(pnl)}
                </td>
                <td className={`px-4 py-3 text-right ${changeColor(pnlPct)}`}>
                  {formatPercent(pnlPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
