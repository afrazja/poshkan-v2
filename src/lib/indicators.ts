import type { OhlcCandle } from "./marketdata";

// Lightweight technical indicators computed from a series of closing prices.
// Pure functions — no external data, easy to test.

// Simple moving average of the last `period` values (null if not enough data).
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Wilder's RSI over the last `period` changes (0–100; null if not enough data).
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Trend read from price vs the two moving averages.
export function trendFromSma(last: number, smaFast: number | null, smaSlow: number | null): string {
  if (smaFast == null || smaSlow == null) return "insufficient data";
  if (last > smaFast && smaFast > smaSlow) return "uptrend";
  if (last < smaFast && smaFast < smaSlow) return "downtrend";
  return "sideways/mixed";
}

// Nearest swing support/resistance from recent lows/highs.
export function support(lows: number[], lookback = 20): number {
  return Math.min(...lows.slice(-lookback));
}
export function resistance(highs: number[], lookback = 20): number {
  return Math.max(...highs.slice(-lookback));
}

// ─────────────────────────────────────────────────────────────────────────────
// Candle helpers. These lived in lib/smc.ts until the built-in scanners were
// removed; they are generic, and the OHLC endpoint and the custom-strategy
// engine still depend on them.
// ─────────────────────────────────────────────────────────────────────────────

// Keep only fully-closed, grid-aligned candles. Yahoo appends a live "snapshot"
// bar (O=H=L=C, datetime off-grid) — judging a signal on that bar reads a
// half-formed candle as a finished one, so it is dropped here for good.
export function realBars(cs: OhlcCandle[], stepMin: number): OhlcCandle[] {
  return cs.filter((c) => {
    const d = new Date(c.datetime);
    if (isNaN(d.getTime())) return false;
    // The live snapshot bar lands on the current wall-clock (non-zero seconds);
    // every real closed bar is on an exact boundary. seconds===0 drops it.
    if (d.getUTCSeconds() !== 0) return false;
    // Intraday must sit on the step grid. Hourly bars differ by market (crypto/
    // forex at :00 UTC, US stocks at :30), so only require a whole-minute bar.
    return stepMin >= 60 ? true : d.getUTCMinutes() % stepMin === 0;
  });
}

// Average true range over the last `n` bars.
export function atr(c: OhlcCandle[], n: number): number {
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
