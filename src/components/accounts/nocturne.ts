import type { Account, AccountType } from "@/lib/types";

// Per-account figures computed in `dashboard/page.tsx`.
export type AccountSummary = {
  marketValue: number;
  holdings: number;
  fxOpen: number;
  unrealized: number;
  realized: number;
  todayPnl: number;
  prevValue: number;
};

// Portfolio-wide totals, reduced on the server — the client never aggregates.
export type BandTotals = {
  totalValue: number;
  cashAvailable: number;
  todayPnl: number;
  prevValue: number;
  unrealized: number;
  realized: number;
  openPositions: number;
  totalAccounts: number;
  activeAccounts: number;
};

// One market section, also built on the server: membership and subtotal.
export type MarketGroup = {
  key: string;
  label: string;
  ids: string[];
  subtotal: number;
};

export type ViewMode = "table" | "cards";

export const VIEW_KEY = "poshkan-accounts-view";

/** Market order is the only ordering in this design — there is no sort control. */
export const MARKET_GROUPS: { key: AccountType; label: string }[] = [
  { key: "stocks", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "forex", label: "Forex" },
];

export const EMPTY_SUMMARY: AccountSummary = {
  marketValue: 0,
  holdings: 0,
  fxOpen: 0,
  unrealized: 0,
  realized: 0,
  todayPnl: 0,
  prevValue: 0,
};

// One account, flattened with everything the views need to render.
export type Row = {
  acc: Account;
  s: AccountSummary;
  cash: number;
  value: number;
  open: number;
  idle: boolean;
  todayPct: number | null; // null when there's no previous close to divide by
};

/** Green/red are only ever applied to P&L numbers — never borders, fills or icons. */
export function pnlColor(value: number): string {
  if (value > 0) return "text-[var(--n-gain)]";
  if (value < 0) return "text-[var(--n-loss)]";
  return "text-[var(--n-text-2)]";
}

/**
 * An account is idle when nothing is open and its cash is the whole value.
 * Derived here rather than stored — idle accounts are NOT separated out, they
 * just render em dashes in place of figures that would otherwise read $0.00.
 */
export function buildRows(
  accounts: Account[],
  summary: Record<string, AccountSummary>
): Record<string, Row> {
  const rows: Record<string, Row> = {};
  for (const acc of accounts) {
    const s = summary[acc.id] ?? EMPTY_SUMMARY;
    const cash = Number(acc.cash_balance);
    const value = cash + s.marketValue;
    const open = s.holdings + s.fxOpen;
    rows[acc.id] = {
      acc,
      s,
      cash,
      value,
      open,
      idle: open === 0 && Math.abs(value - cash) < 0.01,
      todayPct: s.prevValue > 0 ? (s.todayPnl / s.prevValue) * 100 : null,
    };
  }
  return rows;
}
