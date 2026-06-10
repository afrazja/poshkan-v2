// Forex domain rules (shared client/server). v1: USD-quoted majors only, so
// P&L and pip values are natively in USD — no conversion needed.

export const FX_LEVERAGE = 30;

export const FX_PAIRS = [
  { symbol: "EURUSD=X", name: "EUR/USD", label: "Euro / US Dollar" },
  { symbol: "GBPUSD=X", name: "GBP/USD", label: "British Pound / US Dollar" },
  { symbol: "AUDUSD=X", name: "AUD/USD", label: "Australian Dollar / US Dollar" },
  { symbol: "NZDUSD=X", name: "NZD/USD", label: "New Zealand Dollar / US Dollar" },
] as const;

export const FX_LOTS = [
  { key: "micro", label: "Micro", units: 1_000 },
  { key: "mini", label: "Mini", units: 10_000 },
  { key: "standard", label: "Standard", units: 100_000 },
] as const;

export const PIP = 0.0001; // USD-quoted majors

export function isForexSymbol(symbol: string): boolean {
  return /=X$/i.test(symbol.trim());
}

export function pairName(symbol: string): string {
  const m = FX_PAIRS.find((p) => p.symbol === symbol.toUpperCase());
  if (m) return m.name;
  const s = symbol.toUpperCase().replace(/=X$/, "");
  return s.length === 6 ? `${s.slice(0, 3)}/${s.slice(3)}` : s;
}

export function marginFor(units: number, rate: number): number {
  return Math.round(((units * rate) / FX_LEVERAGE) * 100) / 100;
}

export function pipValue(units: number): number {
  return units * PIP; // $ per pip for XXX/USD pairs
}

export function floatingPnl(direction: "LONG" | "SHORT", units: number, openRate: number, rate: number): number {
  const raw = (rate - openRate) * units;
  return direction === "SHORT" ? -raw : raw;
}

export function pips(direction: "LONG" | "SHORT", openRate: number, rate: number): number {
  const raw = (rate - openRate) / PIP;
  return direction === "SHORT" ? -raw : raw;
}

export function formatRate(rate: number): string {
  return rate.toFixed(5);
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
    direction: "LONG" | "SHORT";
    units: number;
    open_rate: number;
    margin: number;
    stop_loss?: number | null;
    take_profit?: number | null;
  },
  rate: number
): "stopped" | "sl" | "tp" | null {
  const floating = floatingPnl(p.direction, Number(p.units), Number(p.open_rate), rate);
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
