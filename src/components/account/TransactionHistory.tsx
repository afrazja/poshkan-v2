"use client";

import type { Transaction } from "@/lib/types";
import { formatCurrency, formatNumber, formatSignedCurrency, changeColor } from "@/lib/format";

const LABELS: Record<string, string> = {
  BUY: "Buy",
  SELL: "Sell",
  OPENING_BALANCE: "Opening",
  DEPOSIT: "Deposit",
  RESET: "Reset",
};

function badgeClass(side: string): string {
  switch (side) {
    case "BUY":
      return "bg-positive/15 text-positive";
    case "SELL":
      return "bg-negative/15 text-negative";
    case "DEPOSIT":
    case "OPENING_BALANCE":
      return "bg-primary/15 text-primary";
    default:
      return "bg-muted/15 text-muted";
  }
}

function formatDateTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TransactionHistory({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No transactions yet. Your buys, sells, deposits, and resets will appear here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Action</th>
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 text-right font-medium">Shares</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
            <th className="px-4 py-3 text-right font-medium">Cash change</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const isTrade = t.side === "BUY" || t.side === "SELL" || t.side === "OPENING_BALANCE";
            const hasShares = isTrade && t.symbol && Number(t.quantity) > 0;
            const amount = hasShares ? Number(t.quantity) * Number(t.price) : Number(t.cash_delta);
            return (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(t.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${badgeClass(t.side)}`}>
                    {LABELS[t.side] ?? t.side}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">{t.symbol ?? "—"}</td>
                <td className="px-4 py-3 text-right">{hasShares ? formatNumber(Number(t.quantity)) : "—"}</td>
                <td className="px-4 py-3 text-right">{hasShares ? formatCurrency(Number(t.price)) : "—"}</td>
                <td className="px-4 py-3 text-right">{hasShares ? formatCurrency(Math.abs(amount)) : "—"}</td>
                <td className={`px-4 py-3 text-right font-medium ${changeColor(Number(t.cash_delta))}`}>
                  {Number(t.cash_delta) !== 0 ? formatSignedCurrency(Number(t.cash_delta)) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
