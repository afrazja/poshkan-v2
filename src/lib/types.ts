export type AccountType = "stocks" | "crypto" | "forex";

export type TransactionSide =
  | "BUY"
  | "SELL"
  | "OPENING_BALANCE"
  | "DEPOSIT"
  | "RESET";

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  theme: "light" | "dark";
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  cash_balance: number;
  created_at: string;
}

export interface Position {
  id: string;
  account_id: string;
  symbol: string;
  quantity: number;
  avg_cost: number;
}

export interface Transaction {
  id: string;
  account_id: string;
  symbol: string | null;
  side: TransactionSide;
  quantity: number;
  price: number;
  cash_delta: number;
  created_at: string;
}

export interface Order {
  id: string;
  account_id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  limit_price: number;
  status: "pending" | "filled" | "canceled";
  created_at: string;
  filled_at: string | null;
  filled_price: number | null;
}

export interface WatchlistItem {
  id: string;
  account_id: string;
  symbol: string;
}

// Shape returned by our /api/quote proxy (normalized subset of Twelve Data).
export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  percentChange: number;
  currency: string;
  isMarketOpen: boolean;
  // Extended stats (optional — shown in the stock detail popup).
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  marketCap?: number;
  peRatio?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  dividendRate?: number;
  earningsDate?: string;
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string | null;
}

export interface FxPosition {
  id: string;
  account_id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  units: number;
  open_rate: number;
  margin: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: "open" | "closed" | "stopped" | "sl" | "tp";
  opened_at: string;
  closed_at: string | null;
  close_rate: number | null;
  pnl: number | null;
}

export interface Alert {
  id: string;
  user_id: string;
  symbol: string;
  condition: "ABOVE" | "BELOW";
  target_price: number;
  status: "active" | "triggered";
  created_at: string;
  triggered_at: string | null;
  triggered_price: number | null;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  instrumentType: string;
}
