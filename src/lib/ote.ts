import "server-only";
import { getOhlc, getQuote, type OhlcCandle } from "./marketdata";
import { realBars, swings, atr, trendBOS, type Trend } from "./smc";

// ─────────────────────────────────────────────────────────────────────────────
// OTE (Optimal Trade Entry) — deterministic ICT-style engine.
//   Phase 1  H1 trend (BOS) + Fibonacci OTE zone (62–79%) of the last external leg
//   Phase 2  M15 entry: a swing inside the zone is SWEPT (wick beyond it)
//   Phase 3  confirmation: one M15 close back beyond the sweep candle's extreme
//   Phase 4  SL beyond the sweep, TP at the external swing, must clear min R:R
// Pure, reproducible math — same candles → same answer (no AI in the decision).
// ─────────────────────────────────────────────────────────────────────────────

export interface OteParams {
  swingN: number; // fractal lookback each side
  atrPeriod: number;
  oteLow: number; // OTE zone near edge (0.62)
  oteHigh: number; // OTE zone far edge (0.79)
  minRR: number; // reject setups below this reward:risk
  slBufferAtr: number; // SL buffer beyond the sweep = this × ATR
}

export const OTE_DEFAULTS: OteParams = {
  swingN: 2,
  atrPeriod: 14,
  oteLow: 0.62,
  oteHigh: 0.79,
  minRR: 2.5,
  slBufferAtr: 0.1,
};

export type OteStatus = "signal" | "waiting" | "no-setup" | "neutral" | "no-data";

export interface OteEval {
  symbol: string;
  trend: Trend;
  price: number | null;
  status: OteStatus;
  reason: string;
  checks: { zone: boolean; sweep: boolean; confirm: boolean };
  // present only when status === "signal"
  direction?: "LONG" | "SHORT";
  entry?: number;
  stop?: number;
  takeProfit?: number;
  rr?: number;
}

// Most recent confirmed swing high / low (fractals never repaint once formed).
function lastSwing(s: { i: number; price: number }[]): { i: number; price: number } | null {
  return s.length ? s[s.length - 1] : null;
}

export async function evaluateOteSymbol(symbol: string, params: OteParams = OTE_DEFAULTS): Promise<OteEval> {
  const [h1raw, m15raw, quote] = await Promise.all([
    getOhlc(symbol, "15min", 200), // higher-timeframe trend
    getOhlc(symbol, "5min", 250), // entry timeframe
    getQuote(symbol).catch(() => null),
  ]);
  const res = evaluateOteAt(symbol, realBars(h1raw, 15), realBars(m15raw, 5), params);
  if (quote?.price) res.price = quote.price; // live price for display only
  return res;
}

// Pure evaluation on already-cleaned H1 + M15 windows — the last M15 bar is "now".
export function evaluateOteAt(
  symbol: string,
  h1: OhlcCandle[],
  m15: OhlcCandle[],
  params: OteParams = OTE_DEFAULTS
): OteEval {
  const price = m15.length ? m15[m15.length - 1].close : null;
  const base: OteEval = {
    symbol,
    trend: "neutral",
    price,
    status: "no-data",
    reason: "insufficient candle data",
    checks: { zone: false, sweep: false, confirm: false },
  };
  if (h1.length < 30 || m15.length < 30) return base;

  const trend = trendBOS(h1, params.swingN);
  base.trend = trend;
  if (trend === "neutral") {
    return { ...base, status: "neutral", reason: "H1 trend neutral — no clean BOS / chop" };
  }

  // ── Phase 1: Fibonacci OTE zone from the last external H1 leg ──
  const { sh, sl } = swings(h1, params.swingN);
  const swH = lastSwing(sh);
  const swL = lastSwing(sl);
  if (!swH || !swL) {
    return { ...base, status: "no-setup", reason: "no external H1 swing high/low to anchor the OTE" };
  }
  const hi = swH.price;
  const lo = swL.price;
  const range = hi - lo;
  if (range <= 0) return { ...base, status: "no-setup", reason: "degenerate H1 range" };

  const isShort = trend === "bearish";
  // Short: down-leg high→low, retrace UP into [lo+0.62R, lo+0.79R].
  // Long:  up-leg   low→high, retrace DOWN into [hi-0.79R, hi-0.62R].
  const zoneLow = isShort ? lo + params.oteLow * range : hi - params.oteHigh * range;
  const zoneHigh = isShort ? lo + params.oteHigh * range : hi - params.oteLow * range;

  const px = price ?? 0;
  const inZone = px >= zoneLow && px <= zoneHigh;
  const dirWord = isShort ? "SHORT" : "LONG";
  if (!inZone) {
    return {
      ...base,
      status: "no-setup",
      reason: `${trend}: price ${px.toFixed(4)} outside the ${dirWord} OTE zone (${zoneLow.toFixed(4)}–${zoneHigh.toFixed(4)})`,
    };
  }

  // ── Phase 2: M15 establishment + liquidity sweep ──
  const { sh: m15sh, sl: m15sl } = swings(m15, params.swingN);
  const a = atr(m15, params.atrPeriod);
  const lastIdx = m15.length - 1;
  const inZonePrice = (p: number) => p >= zoneLow && p <= zoneHigh;

  // The establishment swing: most recent M15 swing (high for shorts / low for longs)
  // that itself formed inside the OTE zone.
  const estPool = (isShort ? m15sh : m15sl).filter((s) => inZonePrice(s.price));
  const est = lastSwing(estPool);
  if (!est) {
    return {
      ...base,
      status: "no-setup",
      reason: `${trend}: in OTE zone, waiting for an M15 ${isShort ? "high" : "low"} to establish`,
      checks: { zone: true, sweep: false, confirm: false },
    };
  }

  // Sweep: a later bar wicks beyond the establishment swing. Trigger = that bar.
  let triggerIdx = -1;
  let sweepExtreme = isShort ? -Infinity : Infinity;
  for (let j = est.i + 1; j < m15.length; j++) {
    if (isShort && m15[j].high > est.price) {
      triggerIdx = j;
      sweepExtreme = Math.max(sweepExtreme, m15[j].high);
    } else if (!isShort && m15[j].low < est.price) {
      triggerIdx = j;
      sweepExtreme = Math.min(sweepExtreme, m15[j].low);
    }
  }
  const checks = { zone: true, sweep: triggerIdx >= 0, confirm: false };
  if (triggerIdx < 0) {
    return {
      ...base,
      status: "waiting",
      reason: `${trend}: M15 ${isShort ? "high" : "low"} established — waiting for a liquidity sweep`,
      checks,
    };
  }

  // ── Phase 3: confirmation — a close back beyond the trigger candle's extreme ──
  const trig = m15[triggerIdx];
  const last = m15[lastIdx];
  const confirm = isShort ? last.close < trig.low : last.close > trig.high;
  checks.confirm = confirm;
  if (!confirm) {
    return {
      ...base,
      status: "waiting",
      reason: `${trend}: sweep done — waiting for a close ${isShort ? "below" : "above"} the trigger candle`,
      checks,
    };
  }

  // ── Phase 4: build & gate the trade plan ──
  const direction: "LONG" | "SHORT" = isShort ? "SHORT" : "LONG";
  const buffer = a * params.slBufferAtr;
  const entry = last.close;
  const stop = isShort ? sweepExtreme + buffer : sweepExtreme - buffer;
  const takeProfit = isShort ? lo : hi; // the external swing the OTE was drawn to
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(takeProfit - entry);
  const rr = risk > 0 ? reward / risk : 0;

  if (rr < params.minRR) {
    return {
      ...base,
      status: "no-setup",
      reason: `${trend}: valid OTE sweep+confirm, but target is only ${rr.toFixed(2)}R (< ${params.minRR}R) — skipped`,
      checks,
    };
  }

  return {
    symbol,
    trend,
    price: entry,
    status: "signal",
    reason: `${direction}: H1 ${trend} + OTE zone + M15 sweep + confirmation close (${rr.toFixed(2)}R)`,
    checks,
    direction,
    entry,
    stop,
    takeProfit,
    rr: Math.round(rr * 100) / 100,
  };
}
