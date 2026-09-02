import "server-only";
import { getOhlc, type OhlcCandle } from "./marketdata";

// Where today's price sits in the thing's own history, in terms a holder can
// act on: "30% above this year's low", "cheaper than today 40% of the time",
// and — the card that changes behaviour — how often it has fallen this hard
// before and how long it took to come back. Pure arithmetic over daily closes.

const TRADING_DAYS_YEAR = 252;
const DRAWDOWN_THRESHOLD = 20; // percent from a running peak that counts as an episode
const MS_MONTH = 30.44 * 86_400_000;

export interface Drawdown {
  peakDate: string;
  troughDate: string;
  depthPct: number; // positive number, e.g. 34.2
  recoveredDate: string | null; // first close back at or above the peak
  monthsToRecover: number | null;
}

export interface RangeContext {
  low: number;
  high: number;
  lowDate: string;
  highDate: string;
  /** How far today's price sits above the window's low, in percent. */
  aboveLowPct: number;
  /** How far today's price sits below the window's high, in percent. */
  belowHighPct: number;
  /** Share of closes in the window that were BELOW today's price, 0–100. */
  percentile: number;
  days: number;
}

export interface PriceContext {
  symbol: string;
  asOf: string;
  price: number;
  since: string;
  years: number;
  year: RangeContext | null;
  all: RangeContext | null;
  /** Today's price versus the 200-day average, in percent. */
  vs200dPct: number | null;
  drawdowns: {
    thresholdPct: number;
    episodes: Drawdown[];
    count: number;
    maxDepthPct: number | null;
    avgMonthsToRecover: number | null;
    longestMonthsToRecover: number | null;
    allRecovered: boolean;
    /** Where the price sits right now relative to its running peak. */
    current: { depthPct: number; peakDate: string } | null;
  };
}

function rangeOf(closes: { t: string; c: number }[], price: number): RangeContext | null {
  if (closes.length === 0) return null;
  let low = closes[0], high = closes[0], below = 0;
  for (const p of closes) {
    if (p.c < low.c) low = p;
    if (p.c > high.c) high = p;
    if (p.c < price) below++;
  }
  return {
    low: low.c,
    high: high.c,
    lowDate: low.t,
    highDate: high.t,
    aboveLowPct: low.c > 0 ? ((price - low.c) / low.c) * 100 : 0,
    belowHighPct: high.c > 0 ? ((high.c - price) / high.c) * 100 : 0,
    percentile: (below / closes.length) * 100,
    days: closes.length,
  };
}

export function computePriceContext(symbol: string, candles: OhlcCandle[]): PriceContext | null {
  const closes = candles
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .map((c) => ({ t: c.datetime, c: c.close }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (closes.length < 30) return null;

  const last = closes[closes.length - 1];
  const price = last.c;
  const year = closes.slice(-TRADING_DAYS_YEAR);

  const tail200 = closes.slice(-200);
  const avg200 = tail200.reduce((s, p) => s + p.c, 0) / tail200.length;

  // Drawdown episodes: track a running peak; each time the price falls at least
  // the threshold below it, that's an episode, closed when a close gets back
  // to the peak. Recovery is measured peak-to-recovery, which is what a holder
  // actually lived through.
  const episodes: Drawdown[] = [];
  let peak = closes[0];
  let trough = closes[0];
  let inDrawdown = false;
  for (const p of closes) {
    if (p.c >= peak.c) {
      if (inDrawdown) {
        const depth = ((peak.c - trough.c) / peak.c) * 100;
        if (depth >= DRAWDOWN_THRESHOLD) {
          episodes.push({
            peakDate: peak.t,
            troughDate: trough.t,
            depthPct: depth,
            recoveredDate: p.t,
            monthsToRecover: (Date.parse(p.t) - Date.parse(peak.t)) / MS_MONTH,
          });
        }
        inDrawdown = false;
      }
      peak = p;
      trough = p;
      continue;
    }
    inDrawdown = true;
    if (p.c < trough.c) trough = p;
  }
  const currentDepth = ((peak.c - price) / peak.c) * 100;
  if (inDrawdown && currentDepth >= DRAWDOWN_THRESHOLD) {
    episodes.push({
      peakDate: peak.t,
      troughDate: trough.t,
      depthPct: ((peak.c - trough.c) / peak.c) * 100,
      recoveredDate: null,
      monthsToRecover: null,
    });
  }
  const recovered = episodes.filter((e) => e.monthsToRecover != null).map((e) => e.monthsToRecover as number);

  return {
    symbol: symbol.toUpperCase(),
    asOf: last.t,
    price,
    since: closes[0].t,
    years: (Date.parse(last.t) - Date.parse(closes[0].t)) / (365.25 * 86_400_000),
    year: rangeOf(year, price),
    all: rangeOf(closes, price),
    vs200dPct: avg200 > 0 ? ((price - avg200) / avg200) * 100 : null,
    drawdowns: {
      thresholdPct: DRAWDOWN_THRESHOLD,
      episodes,
      count: episodes.length,
      maxDepthPct: episodes.length ? Math.max(...episodes.map((e) => e.depthPct)) : null,
      avgMonthsToRecover: recovered.length ? recovered.reduce((a, b) => a + b, 0) / recovered.length : null,
      longestMonthsToRecover: recovered.length ? Math.max(...recovered) : null,
      allRecovered: episodes.every((e) => e.recoveredDate != null),
      current: currentDepth > 0.5 ? { depthPct: currentDepth, peakDate: peak.t } : null,
    },
  };
}

/** Ten years of daily closes, through the same cached candle path everything else uses. */
export async function getPriceContext(symbol: string): Promise<PriceContext | null> {
  const candles = await getOhlc(symbol, "1day", 2600, 3700);
  return computePriceContext(symbol, candles);
}
