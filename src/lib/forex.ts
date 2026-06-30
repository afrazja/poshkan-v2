// Forex domain rules (shared client/server). The 7 major pairs. P&L is always
// computed in USD: XXX/USD pairs are natively USD; USD/XXX pairs realize P&L in
// the quote currency and are converted to USD at the live rate (see isUsdBase).

export const FX_LEVERAGE = 30; // default when an account has no leverage set

// Leverage choices offered when creating a forex account (30:1 = EU/UK retail).
export const FX_LEVERAGE_OPTIONS = [30, 50, 100, 200, 500] as const;

// Per-trade leverage: chosen on each leveraged trade (manual or scanner), for
// stocks, crypto, and forex. 1× = unleveraged (spot-like). Spot buy/sell never
// uses this. Default 1.
export const TRADE_LEVERAGE_OPTIONS = [1, 2, 5, 10] as const;
export function clampTradeLeverage(v?: number | null): number {
  const n = Number(v);
  return (TRADE_LEVERAGE_OPTIONS as readonly number[]).includes(n) ? n : 1;
}

export const FX_PAIRS = [
  { symbol: "EURUSD=X", name: "EUR/USD", label: "Euro / US Dollar" },
  { symbol: "GBPUSD=X", name: "GBP/USD", label: "British Pound / US Dollar" },
  { symbol: "USDJPY=X", name: "USD/JPY", label: "US Dollar / Japanese Yen" },
  { symbol: "AUDUSD=X", name: "AUD/USD", label: "Australian Dollar / US Dollar" },
  { symbol: "USDCAD=X", name: "USD/CAD", label: "US Dollar / Canadian Dollar" },
  { symbol: "USDCHF=X", name: "USD/CHF", label: "US Dollar / Swiss Franc" },
  { symbol: "NZDUSD=X", name: "NZD/USD", label: "New Zealand Dollar / US Dollar" },
] as const;

export const FX_LOTS = [
  { key: "micro", label: "Micro", units: 1_000 },
  { key: "mini", label: "Mini", units: 10_000 },
  { key: "standard", label: "Standard", units: 100_000 },
] as const;

export const PIP = 0.0001; // default (non-JPY) pip

export function isForexSymbol(symbol: string): boolean {
  return /=X$/i.test(symbol.trim());
}

// JPY-quoted pairs step by 0.01; every other major by 0.0001.
export function pipSize(symbol?: string): number {
  return symbol && /JPY=X$/i.test(symbol) ? 0.01 : 0.0001;
}

// USD/XXX pairs (USD is the base) realize P&L in the quote currency, so it must
// be converted to USD at the live rate. XXX/USD pairs are already in USD.
function isUsdBase(symbol?: string): boolean {
  return !!symbol && /^USD/i.test(symbol.replace(/=X$/i, ""));
}

export function pairName(symbol: string): string {
  const m = FX_PAIRS.find((p) => p.symbol === symbol.toUpperCase());
  if (m) return m.name;
  const s = symbol.toUpperCase().replace(/=X$/, "");
  return s.length === 6 ? `${s.slice(0, 3)}/${s.slice(3)}` : s;
}

export function marginFor(units: number, rate: number, leverage?: number | null, symbol?: string): number {
  const lev = leverage && leverage > 0 ? leverage : FX_LEVERAGE;
  // Notional in USD: USD/XXX pairs are denominated in USD units already;
  // XXX/USD pairs convert at the rate.
  const notionalUsd = isUsdBase(symbol) ? units : units * rate;
  return Math.round((notionalUsd / lev) * 100) / 100;
}

export function pipValue(units: number, symbol?: string, rate?: number): number {
  const ps = pipSize(symbol);
  // USD/XXX: pip value is in the quote currency, converted to USD at the rate.
  if (isUsdBase(symbol) && rate && rate > 0) return (units * ps) / rate;
  return units * ps; // XXX/USD: $ per pip
}

export function floatingPnl(
  direction: "LONG" | "SHORT",
  units: number,
  openRate: number,
  rate: number,
  symbol?: string
): number {
  let raw = (rate - openRate) * units; // in the quote currency
  if (isUsdBase(symbol) && rate > 0) raw = raw / rate; // → USD
  return direction === "SHORT" ? -raw : raw;
}

export function pips(
  direction: "LONG" | "SHORT",
  openRate: number,
  rate: number,
  symbol?: string
): number {
  const raw = (rate - openRate) / pipSize(symbol);
  return direction === "SHORT" ? -raw : raw;
}

export function formatRate(rate: number, symbol?: string): string {
  // JPY pairs trade ~150 (3 dp); the rest ~1 (5 dp). Fall back to magnitude when
  // no symbol is given, so every call site formats correctly without threading it.
  const jpy = symbol ? /JPY=X$/i.test(symbol) : rate >= 20;
  return rate.toFixed(jpy ? 3 : 5);
}

// Validate SL/TP placement relative to the current rate (null = not set).
export function sltpError(
  direction: "LONG" | "SHORT",
  rate: number,
  stopLoss: number | null,
  takeProfit: number | null
): string | null {
  if (direction === "LONG") {
    if (stopLoss != null && stopLoss >= rate) return "Stop-loss must be below the current rate for a long.";
    if (takeProfit != null && takeProfit <= rate) return "Take-profit must be above the current rate for a long.";
  } else {
    if (stopLoss != null && stopLoss <= rate) return "Stop-loss must be above the current rate for a short.";
    if (takeProfit != null && takeProfit >= rate) return "Take-profit must be below the current rate for a short.";
  }
  return null;
}

// Why an open position should auto-close at this rate, if at all.
// Priority: margin stop-out, then stop-loss, then take-profit.
export function autoCloseReason(
  p: {
    symbol?: string;
    direction: "LONG" | "SHORT";
    units: number;
    open_rate: number;
    margin: number;
    stop_loss?: number | null;
    take_profit?: number | null;
  },
  rate: number
): "stopped" | "sl" | "tp" | null {
  const floating = floatingPnl(p.direction, Number(p.units), Number(p.open_rate), rate, p.symbol);
  if (floating <= -Number(p.margin)) return "stopped";
  const sl = p.stop_loss != null ? Number(p.stop_loss) : null;
  const tp = p.take_profit != null ? Number(p.take_profit) : null;
  if (p.direction === "LONG") {
    if (sl != null && rate <= sl) return "sl";
    if (tp != null && rate >= tp) return "tp";
  } else {
    if (sl != null && rate >= sl) return "sl";
    if (tp != null && rate <= tp) return "tp";
  }
  return null;
}
