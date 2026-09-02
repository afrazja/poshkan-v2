import "server-only";
import { getOhlc, type OhlcCandle } from "./marketdata";

// A beginner holding four coins usually holds one bet four times. Nothing on
// the screen says so, because every coin gets its own chart, its own line, its
// own colour. This module answers the question those charts hide: does this
// coin move on its own, or is it Bitcoin wearing a different name?
//
// All of it is arithmetic over daily closes we already cache, so it costs one
// extra candle fetch for BTC that every coin and every user then shares.

const BENCHMARK = "BTC-USD";
const WINDOW = 252; // one year of daily closes
const WORST_DAYS = 10;
const MIN_DAYS = 60; // below this the numbers are noise, so we say nothing

export interface BitcoinComparison {
  benchmark: string;
  days: number;
  /** Share of days the coin closed the same direction as Bitcoin, 0–100. */
  sameDirectionPct: number;
  /** Pearson correlation of daily returns, -1 to 1. */
  correlation: number;
  /** How far the coin moves when Bitcoin moves 1%. */
  beta: number;
  /** The coin's own typical daily move, in percent. */
  dailyMovePct: number;
  /** What happened on Bitcoin's worst days — the test of a real hedge. */
  worstDays: { count: number; bitcoinAvgPct: number; coinAvgPct: number } | null;
}

interface Ret {
  t: string;
  r: number;
}

function returnsOf(candles: OhlcCandle[]): Map<string, number> {
  const rows = candles
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .map((c) => ({ t: c.datetime.slice(0, 10), c: c.close }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const out = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    out.set(rows[i].t, rows[i].c / rows[i - 1].c - 1);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function computeBitcoinComparison(
  symbol: string,
  coinCandles: OhlcCandle[],
  bitcoinCandles: OhlcCandle[]
): BitcoinComparison | null {
  if (symbol.toUpperCase() === BENCHMARK) return null;

  const coinReturns = returnsOf(coinCandles);
  const btcReturns = returnsOf(bitcoinCandles);

  // Only days both actually traded, newest last.
  const paired: { coin: Ret; btc: Ret }[] = [];
  for (const [t, r] of coinReturns) {
    const b = btcReturns.get(t);
    if (b != null) paired.push({ coin: { t, r }, btc: { t, r: b } });
  }
  paired.sort((a, b) => (a.coin.t < b.coin.t ? -1 : 1));
  const window = paired.slice(-WINDOW);
  if (window.length < MIN_DAYS) return null;

  const coin = window.map((p) => p.coin.r);
  const btc = window.map((p) => p.btc.r);
  const coinMean = mean(coin);
  const btcMean = mean(btc);

  let cov = 0;
  let coinVar = 0;
  let btcVar = 0;
  for (let i = 0; i < window.length; i++) {
    const dc = coin[i] - coinMean;
    const db = btc[i] - btcMean;
    cov += dc * db;
    coinVar += dc * dc;
    btcVar += db * db;
  }
  const denom = Math.sqrt(coinVar * btcVar);
  const correlation = denom > 0 ? cov / denom : 0;
  const beta = btcVar > 0 ? cov / btcVar : 0;

  let same = 0;
  let counted = 0;
  for (let i = 0; i < window.length; i++) {
    if (coin[i] === 0 || btc[i] === 0) continue;
    counted++;
    if (coin[i] > 0 === btc[i] > 0) same++;
  }

  // Bitcoin's worst days in the window, and what this coin did on those days.
  const worst = [...window].sort((a, b) => a.btc.r - b.btc.r).slice(0, WORST_DAYS);
  const worstDays = worst.length
    ? {
        count: worst.length,
        bitcoinAvgPct: mean(worst.map((p) => p.btc.r)) * 100,
        coinAvgPct: mean(worst.map((p) => p.coin.r)) * 100,
      }
    : null;

  return {
    benchmark: BENCHMARK,
    days: window.length,
    sameDirectionPct: counted ? (same / counted) * 100 : 0,
    correlation,
    beta,
    dailyMovePct: Math.sqrt(coinVar / window.length) * 100,
    worstDays,
  };
}

/** Fetches Bitcoin's candles (shared cache) and compares this coin to them. */
export async function getBitcoinComparison(
  symbol: string,
  coinCandles: OhlcCandle[]
): Promise<BitcoinComparison | null> {
  if (symbol.toUpperCase() === BENCHMARK) return null;
  const bitcoinCandles = await getOhlc(BENCHMARK, "1day", 400, 500);
  return computeBitcoinComparison(symbol, coinCandles, bitcoinCandles);
}
