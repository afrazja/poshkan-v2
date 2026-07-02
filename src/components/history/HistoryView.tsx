"use client";

import { useMemo, useState } from "react";
import type { Transaction, FxPosition } from "@/lib/types";
import { formatCurrency, formatNumber, formatSignedCurrency, changeColor } from "@/lib/format";
import { symbolLabel } from "@/lib/assets";
import { marginFor } from "@/lib/forex";
import SourceBadge from "@/components/account/SourceBadge";

type Acct = { id: string; name: string; type: string };

interface Evt {
  id: string;
  at: string;
  accountId: string;
  accountName: string;
  accountType: string;
  category: "spot" | "leverage";
  label: string;
  badge: string;
  symbol: string | null;
  detail: string;
  amount: number | null;
  source?: string | null;
  isLeverage: boolean;
}

const SPOT_LABELS: Record<string, string> = {
  BUY: "Buy",
  SELL: "Sell",
  OPENING_BALANCE: "Opening",
  DEPOSIT: "Deposit",
  RESET: "Reset",
};

function spotBadge(side: string): string {
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

function outcomeLabel(status: string): string {
  return status === "sl"
    ? "Stop-loss"
    : status === "tp"
      ? "Take-profit"
      : status === "stopped"
        ? "Stop-out"
        : "Closed";
}

// Effective leverage = USD notional ÷ reserved margin (currency-aware for forex).
function levOf(p: FxPosition): number {
  const m = Number(p.margin);
  return m > 0 ? Math.max(1, Math.round(marginFor(Number(p.units), Number(p.open_rate), 1, p.symbol) / m)) : 0;
}

function fmtDT(s: string): string {
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

export default function HistoryView({
  accounts,
  transactions,
  positions,
}: {
  accounts: Acct[];
  transactions: Transaction[];
  positions: FxPosition[];
}) {
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState<"all" | "spot" | "leverage">("all");

  const events = useMemo(() => {
    const out: Evt[] = [];
    const acctOf = (id: string) => accounts.find((a) => a.id === id);

    for (const t of transactions) {
      const a = acctOf(t.account_id);
      if (!a) continue;
      const isTrade = t.side === "BUY" || t.side === "SELL" || t.side === "OPENING_BALANCE";
      const hasShares = isTrade && t.symbol && Number(t.quantity) > 0;
      const unit = a.type === "crypto" ? "" : " sh";
      out.push({
        id: `t-${t.id}`,
        at: t.created_at,
        accountId: a.id,
        accountName: a.name,
        accountType: a.type,
        category: "spot",
        label: SPOT_LABELS[t.side] ?? t.side,
        badge: spotBadge(t.side),
        symbol: t.symbol,
        detail: hasShares ? `${formatNumber(Number(t.quantity))}${unit} @ ${formatCurrency(Number(t.price))}` : "",
        amount: Number(t.cash_delta) || null,
        isLeverage: false,
      });
    }

    for (const p of positions) {
      const a = acctOf(p.account_id);
      if (!a) continue;
      const dir = p.direction === "LONG" ? "Long" : "Short";
      const dirBadge = p.direction === "LONG" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative";
      const unit = a.type === "crypto" ? "" : a.type === "forex" ? " units" : " sh";
      const lev = levOf(p);
      out.push({
        id: `o-${p.id}`,
        at: p.opened_at,
        accountId: a.id,
        accountName: a.name,
        accountType: a.type,
        category: "leverage",
        label: `Opened ${dir}`,
        badge: dirBadge,
        symbol: p.symbol,
        detail: `${formatNumber(Number(p.units))}${unit} · ${lev}× · @ ${formatCurrency(Number(p.open_rate))} · margin ${formatCurrency(Number(p.margin))}`,
        amount: null,
        source: p.source,
        isLeverage: true,
      });
      if (p.status !== "open" && p.closed_at) {
        out.push({
          id: `c-${p.id}`,
          at: p.closed_at,
          accountId: a.id,
          accountName: a.name,
          accountType: a.type,
          category: "leverage",
          label: `Closed ${dir} · ${outcomeLabel(p.status)}`,
          badge: "bg-muted/20 text-muted",
          symbol: p.symbol,
          detail: `${formatNumber(Number(p.units))}${unit} · ${lev}× · @ ${p.close_rate != null ? formatCurrency(Number(p.close_rate)) : "—"}`,
          amount: Number(p.pnl ?? 0),
          source: p.source,
          isLeverage: true,
        });
      }
    }

    out.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    return out;
  }, [accounts, transactions, positions]);

  const filtered = events.filter(
    (e) => (account === "all" || e.accountId === account) && (category === "all" || e.category === category)
  );

  const selectClass =
    "rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={account} onChange={(e) => setAccount(e.target.value)} className={selectClass}>
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type})
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as "all" | "spot" | "leverage")}
          className={selectClass}
        >
          <option value="all">All activity</option>
          <option value="spot">Spot trades</option>
          <option value="leverage">Leveraged trades</option>
        </select>
        <span className="ml-auto text-xs text-muted">
          {filtered.length} {filtered.length === 1 ? "event" : "events"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
          No activity yet. Your buys, sells, and leveraged trades across every account will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${e.badge}`}>
                    {e.label}
                    {e.symbol ? ` ${symbolLabel(e.symbol)}` : ""}
                  </span>
                  {e.isLeverage && <SourceBadge source={e.source} />}
                </div>
                {e.detail && <div className="mt-1 text-xs text-muted">{e.detail}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  <span className="rounded bg-background px-1.5 py-0.5 font-medium">
                    {e.accountName}
                  </span>
                  <span className="capitalize">{e.accountType}</span>
                  <span>·</span>
                  <span>{fmtDT(e.at)}</span>
                </div>
              </div>
              {e.amount != null && (
                <span className={`shrink-0 text-sm font-medium ${changeColor(e.amount)}`}>
                  {formatSignedCurrency(e.amount)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
