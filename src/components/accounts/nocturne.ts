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
  totalCash: number;
  todayPnl: number;
  prevValue: number;
  unrealized: number;
  realized: number;
  openPositions: number;
  idleIds: string[];
  totalAccounts: number;
};

export type SortKey = "value" | "today" | "unrealized" | "activity" | "custom";
export type ViewMode = "table" | "cards";

export const VIEW_KEY = "poshkan-accounts-view";
export const SORT_KEY = "poshkan-accounts-sort";
export const ORDER_KEY = "poshkan-account-order";

export const EMPTY_SUMMARY: AccountSummary = {
  marketValue: 0,
  holdings: 0,
  fxOpen: 0,
  unrealized: 0,
  realized: 0,
  todayPnl: 0,
  prevValue: 0,
};

// One account, flattened with everything the views need to render or sort.
export type Row = {
  acc: Account;
  s: AccountSummary;
  cash: number;
  value: number;
  open: number;
  idle: boolean;
  todayPct: number | null; // null when there's no previous close to divide by
  lastTrade: string | null;
};

export const MARKET_LABEL: Record<AccountType | "other", string> = {
  stocks: "Stocks",
  crypto: "Crypto",
  forex: "Forex",
  other: "Other",
};

export const MARKET_ORDER: (AccountType | "other")[] = ["stocks", "crypto", "forex", "other"];

export function marketOf(acc: Account): AccountType | "other" {
  return MARKET_ORDER.includes(acc.type) ? acc.type : "other";
}

/** Green/red are only ever applied to P&L numbers — never borders, fills or icons. */
export function pnlColor(value: number): string {
  if (value > 0) return "text-[var(--n-gain)]";
  if (value < 0) return "text-[var(--n-loss)]";
  return "text-[var(--n-text-2)]";
}

/** The market label is redundant when the account name already says it. */
export function needsMarketLabel(acc: Account): boolean {
  const label = MARKET_LABEL[marketOf(acc)].toLowerCase();
  return !acc.name.toLowerCase().includes(label) && !acc.name.toLowerCase().includes(acc.type);
}

export function buildRows(
  accounts: Account[],
  summary: Record<string, AccountSummary>,
  idleIds: string[],
  lastTrade: Record<string, string>
): Row[] {
  const idle = new Set(idleIds);
  return accounts.map((acc) => {
    const s = summary[acc.id] ?? EMPTY_SUMMARY;
    const cash = Number(acc.cash_balance);
    return {
      acc,
      s,
      cash,
      value: cash + s.marketValue,
      open: s.holdings + s.fxOpen,
      idle: idle.has(acc.id),
      todayPct: s.prevValue > 0 ? (s.todayPnl / s.prevValue) * 100 : null,
      lastTrade: lastTrade[acc.id] ?? null,
    };
  });
}

/**
 * Sorts are descending on the money columns; Activity ranks by how much is open
 * and then by how recently the account traded. `custom` keeps the caller's
 * drag order untouched.
 */
export function sortRows(rows: Row[], sort: SortKey): Row[] {
  if (sort === "custom") return rows;
  const next = [...rows];
  next.sort((a, b) => {
    switch (sort) {
      case "value":
        return b.value - a.value;
      case "today":
        return b.s.todayPnl - a.s.todayPnl;
      case "unrealized":
        return b.s.unrealized - a.s.unrealized;
      case "activity":
        return b.open - a.open || (b.lastTrade ?? "").localeCompare(a.lastTrade ?? "");
    }
  });
  return next;
}
