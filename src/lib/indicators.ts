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
