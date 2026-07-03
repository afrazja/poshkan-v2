import "server-only";
import { getOhlc, getQuote, type OhlcCandle } from "./marketdata";
import { realBars, atr, type Trend } from "./smc";

// ─────────────────────────────────────────────────────────────────────────────
// CANDLE RANGE (box) trading — deterministic, single timeframe (15-minute).
//   Find a horizontal range (support/resistance) that price has oscillated inside,
//   then trade the bounce: LONG near the lower edge, SHORT near the upper edge,
//   TARGET the opposite edge, stop just beyond the entry edge. Profits in sideways
//   markets — the complement to the trend/breakout scanners.
// Pure, reproducible math — same candles → same answer (no AI in the decision).
// ─────────────────────────────────────────────────────────────────────────────

export interface CandleRangeParams {
  rangePeriod: number; // bars that define the box (window before the current bar)
  edgeZone: number; // enter within this fraction of an edge (0–0.5)
  atrPeriod: number;
  slAtrMult: number; // stop buffer beyond the edge (× ATR)
  minTouches: number; // min touches of EACH edge to qualify as a range
  confirmCandle: boolean; // require a reversal candle in the entry direction
}

export const CANDLERANGE_DEFAULTS: CandleRangeParams = {
  rangePeriod: 20,
  edgeZone: 0.25,
  atrPeriod: 14,
  slAtrMult: 0.5,
  minTouches: 2,
  confirmCandle: true,
};

export type CandleRangeStatus = "signal" | "no-setup" | "neutral" | "no-data";

export interface CandleRangeEval {
  symbol: string;
  trend: Trend;
  price: number | null;
  status: CandleRangeStatus;
  reason: string;
  checks: { range: boolean; confirm: boolean };
  direction?: "LONG" | "SHORT";
  entry?: number;
  stop?: number;
  takeProfit?: number;
  rr?: number;
}

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5));

export async function evaluateCandleRangeSymbol(
  symbol: string,
  params: CandleRangeParams = CANDLERANGE_DEFAULTS
): Promise<CandleRangeEval> {
  const [raw, quote] = await Promise.all([getOhlc(symbol, "15min", 300), getQuote(symbol).catch(() => null)]);
  const res = evaluateCandleRangeAt(symbol, realBars(raw, 15), params);
  if (quote?.price) res.price = quote.price; // live price for display only
  return res;
}

// Pure evaluation on a 15-minute window — the last bar is treated as "now".
export function evaluateCandleRangeAt(
  symbol: string,
  c: OhlcCandle[],
  params: CandleRangeParams = CANDLERANGE_DEFAULTS
): CandleRangeEval {
  const len = c.length;
  const price = len ? c[len - 1].close : null;
  const base: CandleRangeEval = {
    symbol,
    trend: "neutral",
    price,
    status: "no-data",
    reason: "insufficient candle data",
    checks: { range: false, confirm: false },
  };
  const need = params.rangePeriod + params.atrPeriod + 2;
  if (len < need) return base;

  const a = atr(c, params.atrPeriod);
  const last = c[len - 1];

  // The box is defined by the window BEFORE the current bar (no look-ahead on the level).
  const win = c.slice(len - 1 - params.rangePeriod, len - 1);
  let support = Infinity;
  let resistance = -Infinity;
  for (const k of win) {
    if (k.low < support) support = k.low;
    if (k.high > resistance) resistance = k.high;
  }
  const height = resistance - support;
  if (height <= 0 || !isFinite(height)) return { ...base, status: "no-setup", reason: "no range" };

  // A TRADEABLE range only if price OSCILLATED between the edges. Naive
  // per-bar counting is degenerate: the bar that set the low always "touches"
  // support, and a smooth trend's early/late bars count as touches of each
  // edge without price ever crossing the box — letting the scanner fade
  // trends while calling them ranges. Instead, classify each bar's edge
  // contact chronologically and collapse consecutive same-edge bars into one
  // EPISODE; the sequence alternates by construction, so minTouches episodes
  // per edge means price genuinely traversed the box that many times.
  const band = params.edgeZone * height;
  const episodes: ("S" | "R")[] = [];
  for (const k of win) {
    const atS = k.low <= support + band;
    const atR = k.high >= resistance - band;
    if (atS === atR) continue; // neither edge, or one bar spanning both — ambiguous
    const edge = atS ? "S" : "R";
    if (episodes[episodes.length - 1] !== edge) episodes.push(edge);
  }
  const lowTouches = episodes.filter((e) => e === "S").length;
  const highTouches = episodes.filter((e) => e === "R").length;
  const oscillates = lowTouches >= params.minTouches && highTouches >= params.minTouches;
  const tooWide = a > 0 && height > 25 * a; // a trend masquerading as a wide "range"
  if (!oscillates || tooWide) {
    return {
      ...base,
      status: "no-setup",
      reason: tooWide
        ? "range too wide (trending) — no clean box"
        : `not a clean range yet (touched edges ${lowTouches}↓ / ${highTouches}↑, need ${params.minTouches} each)`,
      checks: { range: false, confirm: false },
    };
  }

  // Breakout = price closed outside the box → not a range trade.
  if (last.close > resistance)
    return { ...base, status: "no-setup", reason: `range broken — close ${fmt(last.close)} above resistance ${fmt(resistance)}`, checks: { range: false, confirm: false } };
  if (last.close < support)
    return { ...base, status: "no-setup", reason: `range broken — close ${fmt(last.close)} below support ${fmt(support)}`, checks: { range: false, confirm: false } };

  const pos = (last.close - support) / height; // 0 = at support, 1 = at resistance
  const bull = last.close > last.open;
  const bear = last.close < last.open;

  let direction: "LONG" | "SHORT" | null = null;
  if (pos <= params.edgeZone && (!params.confirmCandle || bull)) direction = "LONG";
  else if (pos >= 1 - params.edgeZone && (!params.confirmCandle || bear)) direction = "SHORT";

  if (!direction) {
    const nearLow = pos <= params.edgeZone;
    const nearHigh = pos >= 1 - params.edgeZone;
    const reason = nearLow
      ? "at the lower edge but no bullish confirmation candle yet"
      : nearHigh
        ? "at the upper edge but no bearish confirmation candle yet"
        : `mid-range — close ${fmt(last.close)} in box ${fmt(support)}–${fmt(resistance)}`;
    return { ...base, status: "no-setup", reason, checks: { range: true, confirm: false } };
  }

  const isLong = direction === "LONG";
  const entry = last.close;
  const stop = isLong ? support - params.slAtrMult * a : resistance + params.slAtrMult * a;
  const takeProfit = isLong ? resistance : support; // the opposite edge
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(takeProfit - entry);
  const rr = risk > 0 ? reward / risk : 0;
  const valid = isLong ? takeProfit > entry : takeProfit < entry;
  if (!valid || rr <= 0) {
    return { ...base, status: "no-setup", reason: `${direction} bounce, but the opposite edge isn't a valid target from here`, checks: { range: true, confirm: true } };
  }
  // Require reward ≥ 2× risk — skip setups whose target is too close to pay off.
  if (rr < 2) {
    return { ...base, status: "no-setup", reason: `${direction} bounce, but target is only ${rr.toFixed(2)}R (< 2R minimum) — skipped`, checks: { range: true, confirm: true } };
  }

  return {
    symbol,
    trend: "neutral",
    price: entry,
    status: "signal",
    reason: `${direction}: bounce off the ${isLong ? "support" : "resistance"} of a ${fmt(support)}–${fmt(resistance)} range → target the opposite edge (${rr.toFixed(2)}R)`,
    checks: { range: true, confirm: true },
    direction,
    entry,
    stop,
    takeProfit,
    rr: Math.round(rr * 100) / 100,
  };
}
