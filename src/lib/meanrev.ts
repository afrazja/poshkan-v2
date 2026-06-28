import "server-only";
import { getOhlc, getQuote, type OhlcCandle } from "./marketdata";
import { realBars, atr, type Trend } from "./smc";

// ─────────────────────────────────────────────────────────────────────────────
// MEAN REVERSION — deterministic Bollinger-Band bounce (single timeframe).
//   Price stretches beyond a band (over-extended) → fade it back toward the mean.
//   Entry on a FRESH close beyond the band, TARGET the middle band, ATR stop.
//   Profits in ranges/chop — the complement to the trend/structure scanners.
// Pure, reproducible math — same candles → same answer (no AI in the decision).
// ─────────────────────────────────────────────────────────────────────────────

export interface MeanRevParams {
  bbPeriod: number; // Bollinger SMA + stdev length
  bbK: number; // band width = this × stdev
  trendMa: number; // only fade WITH the longer trend; 0 disables the filter
  atrPeriod: number;
  slAtrMult: number; // stop = this × ATR beyond entry
  rsiConfirm: boolean; // also require an RSI extreme (Connors RSI-2 quality filter)
  rsiPeriod: number; // RSI lookback (2 = Connors)
  rsiOversold: number; // long needs RSI ≤ this
  rsiOverbought: number; // short needs RSI ≥ this
}

export const MEANREV_DEFAULTS: MeanRevParams = {
  bbPeriod: 20,
  bbK: 2,
  trendMa: 100,
  atrPeriod: 14,
  slAtrMult: 1.5,
  rsiConfirm: false,
  rsiPeriod: 2,
  rsiOversold: 10,
  rsiOverbought: 90,
};

export type MeanRevStatus = "signal" | "no-setup" | "neutral" | "no-data";

export interface MeanRevEval {
  symbol: string;
  trend: Trend;
  price: number | null;
  status: MeanRevStatus;
  reason: string;
  checks: { band: boolean; trend: boolean };
  direction?: "LONG" | "SHORT";
  entry?: number;
  stop?: number;
  takeProfit?: number;
  rr?: number;
}

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5));

// Bollinger bands over the `period` closes ending just before `end` (exclusive).
function bands(c: OhlcCandle[], end: number, period: number, k: number) {
  const w = c.slice(end - period, end).map((x) => x.close);
  const mean = w.reduce((a, b) => a + b, 0) / period;
  const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { mean, sd, upper: mean + k * sd, lower: mean - k * sd };
}
function sma(c: OhlcCandle[], n: number): number {
  const last = c.slice(-n);
  return last.reduce((a, b) => a + b.close, 0) / (last.length || 1);
}

// Wilder RSI over the series, returned at the last bar.
function rsi(c: OhlcCandle[], n: number): number {
  if (c.length < n + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const ch = c[i].close - c[i - 1].close;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < c.length; i++) {
    const ch = c[i].close - c[i - 1].close;
    gain = (gain * (n - 1) + (ch > 0 ? ch : 0)) / n;
    loss = (loss * (n - 1) + (ch < 0 ? -ch : 0)) / n;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export async function evaluateMeanRevSymbol(
  symbol: string,
  params: MeanRevParams = MEANREV_DEFAULTS
): Promise<MeanRevEval> {
  const [raw, quote] = await Promise.all([getOhlc(symbol, "1h", 250), getQuote(symbol).catch(() => null)]);
  const res = evaluateMeanRevAt(symbol, realBars(raw, 60), params);
  if (quote?.price) res.price = quote.price; // live price for display only
  return res;
}

// Pure evaluation on a 1-hour window — the last bar is treated as "now".
export function evaluateMeanRevAt(
  symbol: string,
  c: OhlcCandle[],
  params: MeanRevParams = MEANREV_DEFAULTS
): MeanRevEval {
  const len = c.length;
  const price = len ? c[len - 1].close : null;
  const base: MeanRevEval = {
    symbol,
    trend: "neutral",
    price,
    status: "no-data",
    reason: "insufficient candle data",
    checks: { band: false, trend: false },
  };
  const need = Math.max(params.bbPeriod + 1, params.trendMa + 1, params.atrPeriod + 1);
  if (len < need) return base;

  const last = c[len - 1];
  const prev = c[len - 2];
  const a = atr(c, params.atrPeriod);

  const bLast = bands(c, len, params.bbPeriod, params.bbK);
  const bPrev = bands(c, len - 1, params.bbPeriod, params.bbK);
  if (bLast.sd <= 0) return { ...base, status: "no-setup", reason: "flat band (no volatility)" };

  const useMa = params.trendMa > 0;
  const ma = useMa ? sma(c, params.trendMa) : last.close;
  const trend: Trend = !useMa ? "neutral" : last.close > ma ? "bullish" : last.close < ma ? "bearish" : "neutral";
  base.trend = trend;

  // Fade WITH the longer trend: buy dips below the band in an uptrend, sell rips
  // above the band in a downtrend (avoids fading a strong trend / falling knives).
  const freshBelow = last.close < bLast.lower && prev.close >= bPrev.lower;
  const freshAbove = last.close > bLast.upper && prev.close <= bPrev.upper;
  const longOk = !useMa || last.close > ma;
  const shortOk = !useMa || last.close < ma;

  let direction: "LONG" | "SHORT" | null = null;
  if (freshBelow && longOk) direction = "LONG";
  else if (freshAbove && shortOk) direction = "SHORT";

  if (!direction) {
    if (freshBelow && !longOk) {
      return { ...base, status: "no-setup", reason: `stretched below the band but under the ${params.trendMa}-MA — long skipped (don't fade a downtrend)`, checks: { band: true, trend: false } };
    }
    if (freshAbove && !shortOk) {
      return { ...base, status: "no-setup", reason: `stretched above the band but over the ${params.trendMa}-MA — short skipped (don't fade an uptrend)`, checks: { band: true, trend: false } };
    }
    return {
      ...base,
      status: "no-setup",
      reason: `inside the bands — close ${fmt(last.close)} (bands ${fmt(bLast.lower)}–${fmt(bLast.upper)})`,
      checks: { band: false, trend: useMa },
    };
  }

  // Optional Connors RSI-2 quality filter: only fade when momentum is also extreme.
  let rsiNote = "";
  if (params.rsiConfirm) {
    const r = rsi(c, params.rsiPeriod);
    const rsiOk =
      direction === "LONG" ? r <= params.rsiOversold : r >= params.rsiOverbought;
    if (!rsiOk) {
      return {
        ...base,
        status: "no-setup",
        reason: `${direction} stretch beyond the band, but RSI(${params.rsiPeriod}) is ${r.toFixed(0)} — not ${direction === "LONG" ? "oversold" : "overbought"} enough (waiting for momentum confirmation)`,
        checks: { band: true, trend: true },
      };
    }
    rsiNote = ` + RSI(${params.rsiPeriod}) ${r.toFixed(0)}`;
  }

  const isLong = direction === "LONG";
  const entry = last.close;
  const stop = isLong ? entry - params.slAtrMult * a : entry + params.slAtrMult * a;
  const takeProfit = bLast.mean; // revert to the middle band
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(takeProfit - entry);
  const rr = risk > 0 ? reward / risk : 0;

  // Target must be on the correct side of entry (price below mean for longs).
  const valid = isLong ? takeProfit > entry : takeProfit < entry;
  if (!valid || rr <= 0) {
    return { ...base, status: "no-setup", reason: `${direction} stretch, but the mean isn't a valid target from here`, checks: { band: true, trend: true } };
  }

  return {
    symbol,
    trend,
    price: entry,
    status: "signal",
    reason: `${direction}: fresh close ${isLong ? "below" : "above"} the band${rsiNote} — fade back to the mean (${rr.toFixed(2)}R)`,
    checks: { band: true, trend: true },
    direction,
    entry,
    stop,
    takeProfit,
    rr: Math.round(rr * 100) / 100,
  };
}
