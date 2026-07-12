import "server-only";
import { getOhlc } from "./marketdata";
import { rsi } from "./indicators";
import { SCAN_UNIVERSE, type ScanRow } from "@/app/scans/scans-data";

// Computes all six public daily scans in one pass over the universe: each
// symbol's daily candles are fetched once and every signal is evaluated from
// that series. Called by /api/cron/daily-scans, results stored in
// public.market_scans and rendered by /scans/[slug].

const CROSS_LOOKBACK = 5; // "happened this week" window, in sessions
const HIGH_BAND = 0.02; // within 2% of the 52-week high

function smaAt(closes: number[], period: number, end: number): number | null {
  if (end + 1 < period) return null;
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) sum += closes[i];
  return sum / period;
}

// Did `fast` cross above `slow` at any of the last `lookback` sessions?
function crossedAbove(
  fast: (i: number) => number | null,
  slow: (i: number) => number | null,
  last: number,
  lookback: number
): boolean {
  for (let i = last - lookback + 1; i <= last; i++) {
    const fPrev = fast(i - 1);
    const sPrev = slow(i - 1);
    const f = fast(i);
    const s = slow(i);
    if (fPrev != null && sPrev != null && f != null && s != null && fPrev <= sPrev && f > s) return true;
  }
  return false;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export async function computePublicScans(): Promise<Record<string, ScanRow[]>> {
  const results: Record<string, ScanRow[]> = {
    "golden-cross": [],
    "death-cross": [],
    "crossing-200-day-moving-average": [],
    "rsi-oversold": [],
    "rsi-overbought": [],
    "52-week-high": [],
  };

  await mapLimit(SCAN_UNIVERSE, 8, async ({ t, n }) => {
    let candles;
    try {
      candles = await getOhlc(t, "1day", 260);
    } catch {
      return; // one bad symbol must not sink the run
    }
    if (!candles || candles.length < 210) return;

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const last = closes.length - 1;
    const close = closes[last];
    const prevClose = closes[last - 1];
    const changePct = prevClose ? ((close - prevClose) / prevClose) * 100 : 0;

    const sma50 = (i: number) => smaAt(closes, 50, i);
    const sma200 = (i: number) => smaAt(closes, 200, i);
    const price = (i: number) => (i >= 0 && i <= last ? closes[i] : null);

    const s50 = sma50(last);
    const s200 = sma200(last);
    const row = (value: number): ScanRow => ({
      symbol: t,
      name: n,
      close: +close.toFixed(2),
      changePct: +changePct.toFixed(2),
      value: +value.toFixed(2),
    });

    if (s50 != null && s200 != null) {
      const maSpreadPct = ((s50 - s200) / s200) * 100;
      if (crossedAbove(sma50, sma200, last, CROSS_LOOKBACK)) {
        results["golden-cross"].push(row(maSpreadPct));
      }
      if (crossedAbove(sma200, sma50, last, CROSS_LOOKBACK)) {
        results["death-cross"].push(row(maSpreadPct));
      }
      if (crossedAbove(price, sma200, last, CROSS_LOOKBACK) && close > s200) {
        results["crossing-200-day-moving-average"].push(row(((close - s200) / s200) * 100));
      }
    }

    const r = rsi(closes, 14);
    if (r != null && r < 30) results["rsi-oversold"].push(row(r));
    if (r != null && r > 70) results["rsi-overbought"].push(row(r));

    const high52 = Math.max(...highs.slice(-252));
    if (close >= high52 * (1 - HIGH_BAND)) {
      results["52-week-high"].push(row(((close - high52) / high52) * 100));
    }
  });

  // Deterministic, most-interesting-first ordering per scan.
  results["golden-cross"].sort((a, b) => b.value - a.value);
  results["death-cross"].sort((a, b) => a.value - b.value);
  results["crossing-200-day-moving-average"].sort((a, b) => b.value - a.value);
  results["rsi-oversold"].sort((a, b) => a.value - b.value);
  results["rsi-overbought"].sort((a, b) => b.value - a.value);
  results["52-week-high"].sort((a, b) => b.value - a.value);

  return results;
}
