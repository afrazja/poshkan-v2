import "server-only";
import YahooFinance from "yahoo-finance2";
import type { Quote, SymbolSearchResult } from "./types";

// Yahoo Finance (unofficial) market data. No API key or daily limit. (v3 class API)
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ---------------------------------------------------------------------------
// In-memory cache + in-flight de-dup + stale fallback. Keeps request volume low
// and shields the UI from transient upstream failures.
// ---------------------------------------------------------------------------
type Entry<T> = { at: number; data: T };
const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      if (hit) return hit.data; // serve last good value on failure
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// Loose shapes for the fields we read off the Yahoo responses.
interface YSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  quoteType?: string;
  isYahooFinance?: boolean;
}
interface YQuote {
  symbol: string;
  longName?: string;
  shortName?: string;
  displayName?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  marketState?: string;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  marketCap?: number;
  trailingPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  dividendRate?: number;
  trailingAnnualDividendRate?: number;
}
interface YCandle {
  date?: Date | string;
  close?: number | null;
}

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  return cached(`search:${query.toLowerCase()}`, 60_000, async () => {
    const r = (await yf.search(
      query,
      { quotesCount: 15, newsCount: 0 },
      { validateResult: false }
    )) as unknown as { quotes?: YSearchQuote[] };
    const quotes = Array.isArray(r.quotes) ? r.quotes : [];
    return quotes
      .filter((q) => q.isYahooFinance && q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
      .map((q) => ({
        symbol: q.symbol as string,
        name: q.shortname ?? q.longname ?? (q.symbol as string),
        exchange: q.exchDisp ?? q.exchange ?? "",
        currency: "USD",
        instrumentType: q.quoteType ?? "EQUITY",
      }));
  });
}

function toQuote(q: YQuote): Quote {
  const price = Number(q.regularMarketPrice ?? 0);
  const previousClose = Number(q.regularMarketPreviousClose ?? price);
  const change = Number(q.regularMarketChange ?? price - previousClose);
  return {
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.displayName ?? q.symbol,
    price,
    previousClose,
    change,
    percentChange: Number(q.regularMarketChangePercent ?? 0),
    currency: q.currency ?? "USD",
    isMarketOpen: q.marketState === "REGULAR",
    open: q.regularMarketOpen,
    dayHigh: q.regularMarketDayHigh,
    dayLow: q.regularMarketDayLow,
    marketCap: q.marketCap,
    peRatio: q.trailingPE,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    dividendRate: q.dividendRate ?? q.trailingAnnualDividendRate,
  };
}

const QUOTE_TTL = 15_000;

export async function getQuote(symbol: string): Promise<Quote> {
  const sym = symbol.toUpperCase();
  return cached(`quote:${sym}`, QUOTE_TTL, async () => {
    const q = (await yf.quote(symbol, {}, { validateResult: false })) as unknown as YQuote;
    return toQuote(q);
  });
}

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
  if (unique.length === 0) return {};

  const out: Record<string, Quote> = {};
  const missing: string[] = [];
  for (const sym of unique) {
    const hit = cache.get(`quote:${sym}`) as Entry<Quote> | undefined;
    if (hit && Date.now() - hit.at < QUOTE_TTL) out[sym] = hit.data;
    else missing.push(sym);
  }
  if (missing.length === 0) return out;

  try {
    const res = await yf.quote(missing, {}, { validateResult: false });
    const arr = (Array.isArray(res) ? res : [res]) as unknown as YQuote[];
    for (const raw of arr) {
      if (raw && raw.symbol) {
        const q = toQuote(raw);
        const sym = q.symbol.toUpperCase();
        out[sym] = q;
        cache.set(`quote:${sym}`, { at: Date.now(), data: q });
      }
    }
  } catch {
    for (const sym of missing) {
      const hit = cache.get(`quote:${sym}`) as Entry<Quote> | undefined;
      if (hit && !out[sym]) out[sym] = hit.data;
    }
  }
  return out;
}

export interface Candle {
  datetime: string;
  close: number;
}

const TIMESERIES_TTL = 600_000;
const INTRADAY_TTL = 60_000;

export async function getTimeSeries(
  symbol: string,
  interval = "1day",
  outputsize = 90
): Promise<Candle[]> {
  const weekly = interval === "1week" || interval.startsWith("1w");
  // Intraday: e.g. "5min", "15min", "1h" — used for the 1-day view.
  const intraday = !weekly && interval !== "1day" && /\d+(min|m|h)$/i.test(interval);
  const key = `ts:${symbol.toUpperCase()}:${interval}:${outputsize}`;
  return cached(key, intraday ? INTRADAY_TTL : TIMESERIES_TTL, async () => {
    let yInterval: string;
    let days: number;
    if (intraday) {
      yInterval = interval.replace("min", "m"); // "5min" -> "5m", "1h" stays
      days = 5; // span a few days so we always catch the latest full session
    } else if (weekly) {
      yInterval = "1wk";
      days = outputsize * 7 + 14;
    } else {
      yInterval = "1d";
      days = Math.ceil(outputsize * 1.6) + 7;
    }
    const period1 = new Date(Date.now() - days * 86_400_000);
    const chart = (await yf.chart(
      symbol,
      { period1, interval: yInterval as "1d" },
      { validateResult: false }
    )) as unknown as { quotes?: YCandle[] };
    const rows = Array.isArray(chart.quotes) ? chart.quotes : [];
    const candles = rows
      .filter((c) => c.close != null && c.date)
      .map((c) => {
        const iso = new Date(c.date as Date | string).toISOString();
        // Keep full timestamp for intraday (so the x-axis can show times); date only for daily/weekly.
        return { datetime: intraday ? iso : iso.slice(0, 10), close: Number(c.close) };
      });

    if (intraday) {
      // 1D = just the latest session (today's live session while open, else the
      // most recent trading day) — don't bleed the previous day's tail in.
      if (candles.length === 0) return candles;
      const lastDay = candles[candles.length - 1].datetime.slice(0, 10);
      return candles.filter((c) => c.datetime.slice(0, 10) === lastDay);
    }
    return candles.slice(-outputsize);
  });
}
