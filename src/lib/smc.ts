import "server-only";
import { getOhlc, getQuote, type OhlcCandle } from "./marketdata";

// ─────────────────────────────────────────────────────────────────────────────
// SMC PRO MTF — deterministic engine (see docs/smc-strategy-spec.md).
// Pure, reproducible math: H1 trend via BOS, M5 entry via FVG + liquidity sweep
// + confirmation candle. NO AI in the decision — same candles → same answer.
// ─────────────────────────────────────────────────────────────────────────────

// Liquid crypto majors only (clean structure; microcaps break FVG/swing logic).
export const SMC_UNIVERSE = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;

export interface SmcParams {
  swingN: number; // fractal lookback each side
  atrPeriod: number;
  fvgMinAtr: number; // FVG must be ≥ this × ATR
  fvgExpiryBars: number; // discard FVGs not retested within N bars
  slMode: "swing" | "fvg";
  slBufferAtr: number; // SL buffer = this × ATR
  tpRR: number; // take-profit reward:risk
}

export const DEFAULT_PARAMS: SmcParams = {
  swingN: 2,
  atrPeriod: 14,
  fvgMinAtr: 0.5,
  fvgExpiryBars: 50,
  slMode: "swing",
  slBufferAtr: 0.1,
  tpRR: 2,
};

export type Trend = "bullish" | "bearish" | "neutral";
export type SmcStatus = "signal" | "waiting" | "no-setup" | "neutral" | "no-data";

export interface SmcEval {
  symbol: string;
  trend: Trend;
  price: number | null;
  status: SmcStatus;
  reason: string;
  checks: { retest: boolean; sweep: boolean; confirm: boolean };
  // present only when status === "signal"
  direction?: "LONG" | "SHORT";
  entry?: number;
  stop?: number;
  takeProfit?: number;
  rr?: number;
}

interface Swing {
  i: number;
  price: number;
}

// Keep only fully-closed, grid-aligned candles. Yahoo appends a live "snapshot"
// bar (O=H=L=C, datetime off-grid) — judging a confirmation on that bar is the
// exact bug we hit reading SMC by hand, so it's dropped here for good.
function realBars(cs: OhlcCandle[], stepMin: number): OhlcCandle[] {
  return cs.filter((c) => {
    const d = new Date(c.datetime);
    if (isNaN(d.getTime())) return false;
    if (d.getUTCSeconds() !== 0) return false;
    return stepMin >= 60 ? d.getUTCMinutes() === 0 : d.getUTCMinutes() % stepMin === 0;
  });
}

// Fractal swings: high/low strictly beyond N bars on each side. Confirmed only
// after N bars close to the right (the loop bound), so it never repaints.
function swings(c: OhlcCandle[], k: number): { sh: Swing[]; sl: Swing[] } {
  const sh: Swing[] = [];
  const sl: Swing[] = [];
  for (let i = k; i < c.length - k; i++) {
    let isH = true;
    let isL = true;
    for (let j = 1; j <= k; j++) {
      if (c[i].high <= c[i - j].high || c[i].high <= c[i + j].high) isH = false;
      if (c[i].low >= c[i - j].low || c[i].low >= c[i + j].low) isL = false;
    }
    if (isH) sh.push({ i, price: c[i].high });
    if (isL) sl.push({ i, price: c[i].low });
  }
  return { sh, sl };
}

// Trend = direction of the most recent close-based Break of Structure. Flips only
// on an opposite BOS. Neutral when none, or when the last bull & bear BOS are
// within 3 bars of each other (whipsaw / chop → stand aside).
function trendBOS(c: OhlcCandle[], k: number): Trend {
  const { sh, sl } = swings(c, k);
  let lastBull = -1;
  let lastBear = -1;
  for (let i = k; i < c.length; i++) {
    const close = c[i].close;
    const priorH = sh.filter((s) => s.i < i).slice(-1)[0];
    const priorL = sl.filter((s) => s.i < i).slice(-1)[0];
    if (priorH && close > priorH.price) lastBull = i;
    if (priorL && close < priorL.price) lastBear = i;
  }
  if (lastBull < 0 && lastBear < 0) return "neutral";
  if (lastBull >= 0 && lastBear >= 0 && Math.abs(lastBull - lastBear) <= 3) return "neutral";
  return lastBull > lastBear ? "bullish" : "bearish";
}

function atr(c: OhlcCandle[], n: number): number {
  if (c.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const h = c[i].high;
    const l = c[i].low;
    const pc = c[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const last = trs.slice(-n);
  return last.reduce((a, b) => a + b, 0) / (last.length || 1);
}

interface Fvg {
  type: "bullish" | "bearish";
  i: number; // index of the 3rd candle (where the gap is confirmed)
  top: number;
  bottom: number;
  size: number;
}

// 3-candle fair value gaps, filtered to ≥ minSize and aligned with the trend.
function fvgs(c: OhlcCandle[], trend: Trend, minSize: number): Fvg[] {
  const out: Fvg[] = [];
  for (let i = 2; i < c.length; i++) {
    if (c[i - 2].high < c[i].low) {
      const size = c[i].low - c[i - 2].high;
      if (size >= minSize) out.push({ type: "bullish", i, top: c[i].low, bottom: c[i - 2].high, size });
    }
    if (c[i - 2].low > c[i].high) {
      const size = c[i - 2].low - c[i].high;
      if (size >= minSize) out.push({ type: "bearish", i, top: c[i - 2].low, bottom: c[i].high, size });
    }
  }
  if (trend === "bullish") return out.filter((f) => f.type === "bullish");
  if (trend === "bearish") return out.filter((f) => f.type === "bearish");
  return out;
}

/**
 * Evaluate one symbol against the full SMC spec, on the last CLOSED M5 bar.
 * Returns a status + reason for the live feed, and a trade plan when status==="signal".
 */
export async function evaluateSymbol(symbol: string, params: SmcParams = DEFAULT_PARAMS): Promise<SmcEval> {
  const [h1raw, m5raw, quote] = await Promise.all([
    getOhlc(symbol, "1h", 120),
    getOhlc(symbol, "5min", 150),
    getQuote(symbol).catch(() => null),
  ]);
  const h1 = realBars(h1raw, 60);
  const m5 = realBars(m5raw, 5);
  const price = quote?.price ?? (m5.length ? m5[m5.length - 1].close : null);
  const base: SmcEval = {
    symbol,
    trend: "neutral",
    price,
    status: "no-data",
    reason: "insufficient candle data",
    checks: { retest: false, sweep: false, confirm: false },
  };
  if (h1.length < 30 || m5.length < 30) return base;

  const trend = trendBOS(h1, params.swingN);
  base.trend = trend;
  if (trend === "neutral") {
    return { ...base, status: "neutral", reason: "H1 trend neutral — no clean BOS / chop" };
  }

  const a = atr(m5, params.atrPeriod);
  const minSize = a * params.fvgMinAtr;
  const fv = fvgs(m5, trend, minSize);
  const dirWord = trend === "bullish" ? "bullish" : "bearish";
  if (!fv.length) {
    return { ...base, status: "no-setup", reason: `${trend} trend, but no valid ${dirWord} FVG (≥ ${minSize.toFixed(4)})` };
  }

  const { sh, sl } = swings(m5, params.swingN);
  const lastIdx = m5.length - 1;

  // Most recent FVG that price has retested and that isn't mitigated or stale.
  let chosen: Fvg | null = null;
  for (let k = fv.length - 1; k >= 0; k--) {
    const f = fv[k];
    if (lastIdx - f.i > params.fvgExpiryBars) break; // older than expiry → all stale
    let mitigated = false;
    let retested = false;
    for (let j = f.i + 1; j < m5.length; j++) {
      const cc = m5[j];
      if (cc.low <= f.top && cc.high >= f.bottom) retested = true;
      // A CLOSE fully beyond the far edge kills the FVG (wick-through is allowed).
      if (f.type === "bullish" && cc.close < f.bottom) { mitigated = true; break; }
      if (f.type === "bearish" && cc.close > f.top) { mitigated = true; break; }
    }
    if (mitigated || !retested) continue;
    chosen = f;
    break;
  }
  if (!chosen) {
    return { ...base, status: "no-setup", reason: `${trend} trend, ${dirWord} FVG present but not yet retested (or mitigated)` };
  }

  const f = chosen;

  // Liquidity sweep: the most recent prior swing (low for longs / high for shorts)
  // must be taken (wicked beyond) at some point after the FVG formed.
  let sweep = false;
  if (f.type === "bullish") {
    const pl = sl.filter((s) => s.i < f.i).slice(-1)[0];
    if (pl) sweep = m5.slice(f.i).some((cc) => cc.low < pl.price);
  } else {
    const ph = sh.filter((s) => s.i < f.i).slice(-1)[0];
    if (ph) sweep = m5.slice(f.i).some((cc) => cc.high > ph.price);
  }

  // Confirmation candle on the last CLOSED bar: in-zone + trend-direction close.
  const last = m5[lastIdx];
  const inZone = last.close >= f.bottom && last.close <= f.top;
  const dirOk = f.type === "bullish" ? last.close > last.open : last.close < last.open;
  const confirm = inZone && dirOk;
  const checks = { retest: true, sweep, confirm };

  if (!sweep) {
    return { ...base, status: "waiting", reason: `${trend}: FVG retested — waiting for a liquidity sweep`, checks };
  }
  if (!confirm) {
    return { ...base, status: "waiting", reason: `${trend}: retest + sweep done — waiting for a confirmation candle in the FVG`, checks };
  }

  // ── Signal ──
  const direction: "LONG" | "SHORT" = f.type === "bullish" ? "LONG" : "SHORT";
  const buffer = a * params.slBufferAtr;
  let stop: number;
  if (params.slMode === "swing") {
    if (f.type === "bullish") {
      const pl = sl.filter((s) => s.i < f.i).slice(-1)[0];
      stop = (pl?.price ?? f.bottom) - buffer;
    } else {
      const ph = sh.filter((s) => s.i < f.i).slice(-1)[0];
      stop = (ph?.price ?? f.top) + buffer;
    }
  } else {
    stop = f.type === "bullish" ? f.bottom - buffer : f.top + buffer;
  }
  const entry = last.close;
  const risk = Math.abs(entry - stop);
  const takeProfit = f.type === "bullish" ? entry + params.tpRR * risk : entry - params.tpRR * risk;

  return {
    symbol,
    trend,
    price: entry,
    status: "signal",
    reason: `${direction}: ${trend} BOS + FVG retest + liquidity sweep + confirmation candle`,
    checks,
    direction,
    entry,
    stop,
    takeProfit,
    rr: params.tpRR,
  };
}
