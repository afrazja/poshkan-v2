import "server-only";
import YahooFinance from "yahoo-finance2";
import type { Quote, SymbolSearchResult } from "./types";
import { candleCacheTtl, readCandleCache, writeCandleCache } from "./market-candle-cache";
import {
  getTwelveOhlc,
  getTwelveQuotes,
  isTwelveDataConfigured,
  toTwelveSymbol,
} from "./twelve-data";
import { readQuoteCache, writeQuoteCache } from "./market-quote-cache";

// Quotes: Yahoo is primary — one batched request answers a whole symbol list
// with no per-symbol credit, which is what lets a 50-holding account refresh
// every 20 seconds on a free tier. Twelve Data fills only the symbols Yahoo
// cannot resolve, inside its small free budget. Every fetched quote is written
// to the shared market_quotes table so instances and users stop paying for
// the same second twice.
//
// OHLC/candles: Twelve Data when configured, with Yahoo as the fail-open
// fallback. Yahoo also remains the discovery/news source.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

let lastFallbackLog = 0;

function logTwelveFallback(error: unknown) {
  if (Date.now() - lastFallbackLog < 60_000) return;
  lastFallbackLog = Date.now();
  console.warn(`[marketdata] Twelve Data fallback: ${(error as Error).message ?? "unknown error"}`);
}

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
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChangePercent?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  marketCap?: number;
  trailingPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  dividendRate?: number;
  trailingAnnualDividendRate?: number;
  earningsTimestamp?: number | Date;
  regularMarketVolume?: number;
  volume24Hr?: number;
  circulatingSupply?: number;
  maxSupply?: number;
}
interface YCandle {
  date?: Date | string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  return cached(`search:${query.toLowerCase()}`, 60_000, async () => {
    const r = (await yf.search(
      query,
      { quotesCount: 15, newsCount: 0 },
      { validateResult: false }
    )) as unknown as { quotes?: YSearchQuote[] };
    const quotes = Array.isArray(r.quotes) ? r.quotes : [];
    const allowed = new Set(["EQUITY", "ETF", "CRYPTOCURRENCY"]);
    return quotes
      .filter((q) => q.isYahooFinance && q.symbol && allowed.has(q.quoteType ?? ""))
      .map((q) => ({
        symbol: q.symbol as string,
        name: q.shortname ?? q.longname ?? (q.symbol as string),
        exchange: q.quoteType === "CRYPTOCURRENCY" ? "Crypto" : q.exchDisp ?? q.exchange ?? "",
        currency: "USD",
        instrumentType: q.quoteType ?? "EQUITY",
      }));
  });
}

function toQuote(q: YQuote): Quote {
  const regularPrice = Number(q.regularMarketPrice ?? 0);
  const previousClose = Number(q.regularMarketPreviousClose ?? regularPrice);
  const change = Number(q.regularMarketChange ?? regularPrice - previousClose);

  // Outside regular hours the latest actual trade is the extended-session
  // print (Yahoo: marketState PRE / POST / POSTPOST / CLOSED plus pre/post
  // prices). Surface it as `price` so holdings and watchlists keep moving
  // with pre-market and after-hours action instead of freezing at the close.
  let price = regularPrice;
  let extendedSession: "pre" | "post" | undefined;
  let extendedChangePercent: number | undefined;
  const state = q.marketState ?? "";
  if (state === "PRE" && Number(q.preMarketPrice) > 0) {
    price = Number(q.preMarketPrice);
    extendedSession = "pre";
    extendedChangePercent = Number(q.preMarketChangePercent ?? 0);
  } else if (state !== "REGULAR" && Number(q.postMarketPrice) > 0) {
    price = Number(q.postMarketPrice);
    extendedSession = "post";
    extendedChangePercent = Number(q.postMarketChangePercent ?? 0);
  }

  return {
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.displayName ?? q.symbol,
    price,
    previousClose,
    change,
    percentChange: Number(q.regularMarketChangePercent ?? 0),
    currency: q.currency ?? "USD",
    isMarketOpen: q.marketState === "REGULAR",
    extendedSession,
    regularPrice: extendedSession ? regularPrice : undefined,
    extendedChangePercent,
    open: q.regularMarketOpen,
    dayHigh: q.regularMarketDayHigh,
    dayLow: q.regularMarketDayLow,
    marketCap: q.marketCap,
    peRatio: q.trailingPE,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    dividendRate: q.dividendRate ?? q.trailingAnnualDividendRate,
    earningsDate: toIso(q.earningsTimestamp),
    volume: q.volume24Hr ?? q.regularMarketVolume,
    circulatingSupply: q.circulatingSupply,
    // Yahoo reports an uncapped coin (ETH) as maxSupply 0, which would read as
    // "a maximum of 0". Only a positive cap is a real one.
    maxSupply: q.maxSupply && q.maxSupply > 0 ? q.maxSupply : undefined,
  };
}

function toIso(v: number | Date | undefined): string | undefined {
  if (v == null) return undefined;
  const d = v instanceof Date ? v : new Date(v * 1000);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

// How old a quote may be before someone asks the provider again. The browser
// polls every 20s, so 15s means each poll can land on a fresh row without two
// polls ever both paying for the same second. Trade fills read through the
// same layer, so a fill is never older than the memory cache already allowed.
const QUOTE_TTL = 15_000;

let lastYahooLog = 0;
function logYahooFailure(error: unknown) {
  if (Date.now() - lastYahooLog < 60_000) return;
  lastYahooLog = Date.now();
  console.warn(`[marketdata] Yahoo quote batch failed: ${(error as Error).message ?? "unknown error"}`);
}

async function getYahooQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const response = await yf.quote(symbols, {}, { validateResult: false });
  const rows = (Array.isArray(response) ? response : [response]) as unknown as YQuote[];
  const quotes: Record<string, Quote> = {};
  for (const raw of rows) {
    if (!raw?.symbol) continue;
    const quote = toQuote(raw);
    quotes[quote.symbol.toUpperCase()] = quote;
  }
  return quotes;
}

// One provider round-trip for a symbol set. Yahoo answers the whole list in a
// single request; Twelve Data is asked only for what Yahoo left unresolved.
async function fetchQuotesFromProviders(
  symbols: string[]
): Promise<{ quotes: Record<string, Quote>; source: Record<string, string> }> {
  const quotes: Record<string, Quote> = {};
  const source: Record<string, string> = {};
  try {
    const yahoo = await getYahooQuotes(symbols);
    for (const [sym, q] of Object.entries(yahoo)) {
      quotes[sym] = q;
      source[sym] = "yahoo";
    }
  } catch (error) {
    logYahooFailure(error);
  }
  const unresolved = symbols.filter((sym) => !quotes[sym]);
  if (unresolved.length > 0 && isTwelveDataConfigured()) {
    try {
      const twelve = await getTwelveQuotes(unresolved);
      for (const [sym, q] of Object.entries(twelve)) {
        quotes[sym] = q;
        source[sym] = "twelve";
      }
    } catch (error) {
      logTwelveFallback(error);
    }
  }
  return { quotes, source };
}

// Identical symbol sets requested at the same moment share one fetch.
const quoteInflight = new Map<string, Promise<Record<string, Quote>>>();

/**
 * Three layers, cheapest first: this instance's memory, the shared
 * market_quotes table, then the provider. Whatever the provider returns is
 * written back to the table so the next reader — any instance, any user —
 * finds it there.
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
  if (unique.length === 0) return {};

  const out: Record<string, Quote> = {};
  let missing: string[] = [];
  for (const sym of unique) {
    const hit = cache.get(`quote:${sym}`) as Entry<Quote> | undefined;
    if (hit && Date.now() - hit.at < QUOTE_TTL) out[sym] = hit.data;
    else missing.push(sym);
  }
  if (missing.length === 0) return out;

  const shared = await readQuoteCache(missing, QUOTE_TTL);
  for (const [sym, q] of Object.entries(shared.fresh)) {
    out[sym] = q;
    cache.set(`quote:${sym}`, { at: Date.now(), data: q });
  }
  missing = missing.filter((sym) => !out[sym]);
  if (missing.length === 0) return out;

  const key = missing.join(",");
  let pending = quoteInflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const { quotes, source } = await fetchQuotesFromProviders(missing);
        // Stamp the fetch time on the way in, so every later reader — memory,
        // table, UI — can say how old the price is.
        const now = new Date().toISOString();
        const stamped: Record<string, Quote> = {};
        for (const [sym, q] of Object.entries(quotes)) stamped[sym] = { ...q, asOf: now, stale: false };
        for (const [sym, q] of Object.entries(stamped)) cache.set(`quote:${sym}`, { at: Date.now(), data: q });
        await writeQuoteCache(stamped, source);
        return stamped;
      } finally {
        quoteInflight.delete(key);
      }
    })();
    quoteInflight.set(key, pending);
  }
  Object.assign(out, await pending);

  // Provider failed on something: a stale row beats an empty cell.
  for (const sym of missing) {
    if (out[sym]) continue;
    const stale = shared.stale[sym] ?? (cache.get(`quote:${sym}`) as Entry<Quote> | undefined)?.data;
    // Flagged, never silent: the UI turns this into "prices delayed".
    if (stale) out[sym] = { ...stale, stale: true };
  }
  return out;
}

export async function getQuote(symbol: string): Promise<Quote> {
  const sym = symbol.toUpperCase();
  const quote = (await getQuotes([sym]))[sym];
  if (!quote) throw new Error(`No quote available for ${sym}`);
  return quote;
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string | null;
}

interface YNews {
  title?: string;
  link?: string;
  publisher?: string;
  providerPublishTime?: number | Date;
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  return cached(`news:${symbol.toUpperCase()}`, 600_000, async () => {
    const r = (await yf.search(
      symbol,
      { quotesCount: 0, newsCount: 6 },
      { validateResult: false }
    )) as unknown as { news?: YNews[] };
    return (Array.isArray(r.news) ? r.news : [])
      .filter((n) => n.title && n.link)
      .map((n) => ({
        title: n.title as string,
        link: n.link as string,
        publisher: n.publisher ?? "",
        publishedAt: toIso(n.providerPublishTime) ?? null,
      }));
  });
}

export interface Candle {
  datetime: string;
  close: number;
}

export interface OhlcCandle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

async function getYahooOhlc(
  symbol: string,
  interval: string,
  outputsize: number,
  lookbackDays?: number
): Promise<OhlcCandle[]> {
  const weekly = interval === "1week" || interval.startsWith("1w");
  const intraday = !weekly && interval !== "1day" && /\d+(min|m|h)$/i.test(interval);
  let yInterval: string;
  let days: number;
  if (intraday) {
    const isHour = interval.includes("h");
    yInterval = interval.replace("min", "m");
    const base = lookbackDays ?? (isHour ? Math.ceil(outputsize / 7) + 5 : 10);
    // Yahoo caps intraday history: ~730d for hourly, ~60d for sub-hour bars.
    days = Math.min(base, isHour ? 720 : 59);
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
  return rows
    .filter((c) => c.close != null && c.open != null && c.high != null && c.low != null && c.date)
    .map((c) => {
      const iso = new Date(c.date as Date | string).toISOString();
      return {
        datetime: intraday ? iso : iso.slice(0, 10),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        ...(c.volume != null ? { volume: Number(c.volume) } : {}),
      };
    })
    .slice(-outputsize);
}

function mergeOhlc(older: OhlcCandle[], newer: OhlcCandle[], outputsize: number): OhlcCandle[] {
  const merged = new Map<string, OhlcCandle>();
  for (const candle of older) merged.set(candle.datetime, candle);
  for (const candle of newer) merged.set(candle.datetime, candle);
  return Array.from(merged.values())
    .sort((left, right) => new Date(left.datetime).getTime() - new Date(right.datetime).getTime())
    .slice(-outputsize);
}

// Full OHLC candles for charts, indicators, backtests, and scanners. Twelve
// Data is preferred; the persistent cache and Yahoo fallback keep it fail-open.
export async function getOhlc(
  symbol: string,
  interval = "1day",
  outputsize = 120,
  lookbackDays?: number
): Promise<OhlcCandle[]> {
  const weekly = interval === "1week" || interval.startsWith("1w");
  const intraday = !weekly && interval !== "1day" && /\d+(min|m|h)$/i.test(interval);
  const key = `ohlc:${symbol.toUpperCase()}:${interval}:${outputsize}:${lookbackDays ?? ""}`;
  const ttl = intraday ? 60_000 : 600_000;

  return cached(key, ttl, async () => {
    if (!isTwelveDataConfigured()) {
      return getYahooOhlc(symbol, interval, outputsize, lookbackDays);
    }

    const requestedSize = Math.max(1, Math.min(Math.floor(outputsize), 5_000));
    const persisted = await readCandleCache(
      symbol,
      interval,
      requestedSize,
      candleCacheTtl(interval)
    );
    if (persisted?.fresh) return persisted.candles.slice(-requestedSize);

    try {
      const candles = await getTwelveOhlc(symbol, interval, requestedSize, lookbackDays);
      await writeCandleCache(
        symbol,
        toTwelveSymbol(symbol),
        interval,
        candles,
        requestedSize,
        persisted?.meta
      );
      return candles;
    } catch (error) {
      logTwelveFallback(error);
      try {
        const yahoo = await getYahooOhlc(symbol, interval, outputsize, lookbackDays);
        return persisted?.candles.length
          ? mergeOhlc(persisted.candles, yahoo, outputsize)
          : yahoo;
      } catch {
        if (persisted?.candles.length) return persisted.candles.slice(-outputsize);
        throw error;
      }
    }
  });
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
    const candles = (await getOhlc(symbol, interval, outputsize)).map((candle) => ({
      datetime: candle.datetime,
      close: candle.close,
    }));

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
