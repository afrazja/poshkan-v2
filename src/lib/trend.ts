import "server-only";
import { getOhlc, getQuote, type OhlcCandle } from "./marketdata";
import { realBars, atr, type Trend } from "./smc";

// ─────────────────────────────────────────────────────────────────────────────
// TREND BREAKOUT — deterministic Donchian/Turtle-style engine (single timeframe).
//   Enter when price makes a FRESH break of the N-bar high (long) / low (short),
//   in the direction of a longer trend MA. ATR stop, R-multiple target.
//   Rides sustained trends — the complement to the mean-reverting SMC/OTE setups.
// Pure, reproducible math — same candles → same answer (no AI in the decision).
// ─────────────────────────────────────────────────────────────────────────────

export interface TrendParams {
  donchianN: number; // breakout lookback (highest high / lowest low of prior N bars)
  trendMa: number; // trend-filter SMA period; 0 disables the filter
  atrPeriod: number;
  slAtrMult: number; // stop = this × ATR from entry
  tpRR: number; // take-profit reward:risk
}

export const TREND_DEFAULTS: TrendParams = {
  donchianN: 20,
  trendMa: 50,
  atrPeriod: 14,
  slAtrMult: 2,
  tpRR: 3,
};

export type TrendStatus = "signal" | "no-setup" | "neutral" | "no-data";

export interface TrendEval {
  symbol: string;
  trend: Trend;
  price: number | null;
  status: TrendStatus;
  reason: string;
  checks: { trend: boolean; breakout: boolean };
  direction?: "LONG" | "SHORT";
  entry?: number;
  stop?: number;
  takeProfit?: number;
  rr?: number;
}

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5));

// Highest high / lowest low of the n bars ending just before `end` (exclusive).
function highestHigh(c: OhlcCandle[], end: number, n: number): number {
  let h = -Infinity;
  for (let i = Math.max(0, end - n); i < end; i++) h = Math.max(h, c[i].high);
  return h;
}
function lowestLow(c: OhlcCandle[], end: number, n: number): number {
  let l = Infinity;
  for (let i = Math.max(0, end - n); i < end; i++) l = Math.min(l, c[i].low);
  return l;
}
function sma(c: OhlcCandle[], n: number): number {
  const last = c.slice(-n);
  return last.reduce((a, b) => a + b.close, 0) / (last.length || 1);
}

export async function evaluateTrendSymbol(symbol: string, params: TrendParams = TREND_DEFAULTS): Promise<TrendEval> {
  const [raw, quote] = await Promise.all([getOhlc(symbol, "1h", 250), getQuote(symbol).catch(() => null)]);
  const res = evaluateTrendAt(symbol, realBars(raw, 60), params);
  if (quote?.price) res.price = quote.price; // live price for display only
  return res;
}

// Pure evaluation on a 1-hour window — the last bar is treated as "now".
export function evaluateTrendAt(symbol: string, c: OhlcCandle[], params: TrendParams = TREND_DEFAULTS): TrendEval {
  const len = c.length;
  const price = len ? c[len - 1].close : null;
  const base: TrendEval = {
    symbol,
    trend: "neutral",
    price,
    status: "no-data",
    reason: "insufficient candle data",
    checks: { trend: false, breakout: false },
  };
  const need = Math.max(params.donchianN + 3, params.trendMa + 1, params.atrPeriod + 1);
  if (len < need) return base;

  const last = c[len - 1];
  const prev = c[len - 2];
  const a = atr(c, params.atrPeriod);

  // Trend filter via SMA (slope-agnostic: price above = up-bias, below = down-bias).
  const useMa = params.trendMa > 0;
  const ma = useMa ? sma(c, params.trendMa) : last.close;
  const trend: Trend = !useMa ? "neutral" : last.close > ma ? "bullish" : last.close < ma ? "bearish" : "neutral";
  base.trend = trend;

  // Donchian channels for the last bar and the one before (to detect a FRESH cross).
  const upLast = highestHigh(c, len - 1, params.donchianN);
  const upPrev = highestHigh(c, len - 2, params.donchianN);
  const dnLast = lowestLow(c, len - 1, params.donchianN);
  const dnPrev = lowestLow(c, len - 2, params.donchianN);

  const longBreak = last.close > upLast && prev.close <= upPrev;
  const shortBreak = last.close < dnLast && prev.close >= dnPrev;
  const longOk = !useMa || last.close > ma;
  const shortOk = !useMa || last.close < ma;

  let direction: "LONG" | "SHORT" | null = null;
  if (longBreak && longOk) direction = "LONG";
  else if (shortBreak && shortOk) direction = "SHORT";

  if (!direction) {
    // Informative "why not" for the live feed.
    if (longBreak && !longOk) {
      return { ...base, status: "no-setup", reason: `${params.donchianN}-bar high broken but price below the ${params.trendMa}-MA — long filtered out`, checks: { trend: false, breakout: true } };
    }
    if (shortBreak && !shortOk) {
      return { ...base, status: "no-setup", reason: `${params.donchianN}-bar low broken but price above the ${params.trendMa}-MA — short filtered out`, checks: { trend: false, breakout: true } };
    }
    return {
      ...base,
      status: "no-setup",
      reason: `no breakout — close ${fmt(last.close)} inside the ${params.donchianN}-bar range (${fmt(dnLast)}–${fmt(upLast)})`,
      checks: { trend: useMa, breakout: false },
    };
  }

  const isLong = direction === "LONG";
  const entry = last.close;
  const risk = params.slAtrMult * a;
  const stop = isLong ? entry - risk : entry + risk;
  const takeProfit = isLong ? entry + params.tpRR * risk : entry - params.tpRR * risk;

  return {
    symbol,
    trend,
    price: entry,
    status: "signal",
    reason: `${direction}: fresh ${params.donchianN}-bar ${isLong ? "high" : "low"} breakout${useMa ? `, with the ${params.trendMa}-MA trend` : ""} (${params.tpRR}R target)`,
    checks: { trend: true, breakout: true },
    direction,
    entry,
    stop,
    takeProfit,
    rr: params.tpRR,
  };
}
