import "server-only";
import type { Quote, SymbolSearchResult } from "./types";

const BASE = "https://api.twelvedata.com";

function apiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("TWELVE_DATA_API_KEY is not set");
  return key;
}

// Twelve Data sometimes returns { status: "error", message } with HTTP 200
// (e.g. rate-limit: "You have run out of API credits for the current minute").
function assertOk(json: Record<string, unknown>) {
  if (json && json.status === "error") {
    throw new Error(String(json.message ?? "Twelve Data error"));
  }
}

// ---------------------------------------------------------------------------
// In-memory cache + in-flight de-dup to stay under the free-tier rate limit
// (8 req/min). The free tier is the main constraint, so we (a) serve recent
// results from cache, (b) collapse concurrent identical requests into one
// fetch, and (c) fall back to stale data when a refetch is rate-limited.
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
      // Rate-limited or transient failure: serve the last good value if we have one.
      if (hit) return hit.data;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  return cached(`search:${query.toLowerCase()}`, 60_000, async () => {
    const url = `${BASE}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=15&apikey=${apiKey()}`;
    const res = await fetch(url);
    const json = await res.json();
    assertOk(json);
    const data = Array.isArray(json.data) ? json.data : [];
    return data
      .filter((d: Record<string, string>) => d.instrument_type !== "Digital Currency")
      .map((d: Record<string, string>) => ({
        symbol: d.symbol,
        name: d.instrument_name,
        exchange: d.exchange,
        currency: d.currency,
        instrumentType: d.instrument_type,
      }));
  });
}

function parseQuote(q: Record<string, string>): Quote {
  const price = Number(q.close);
  const previousClose = Number(q.previous_close);
  const change = Number(q.change);
  return {
    symbol: q.symbol,
    name: q.name ?? q.symbol,
    price,
    previousClose,
    change: Number.isFinite(change) ? change : price - previousClose,
    percentChange: Number(q.percent_change),
    currency: q.currency ?? "USD",
    isMarketOpen: String(q.is_market_open) === "true",
  };
}

const QUOTE_TTL = 15_000;

export async function getQuote(symbol: string): Promise<Quote> {
  const sym = symbol.toUpperCase();
  return cached(`quote:${sym}`, QUOTE_TTL, async () => {
    const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey()}`;
    const res = await fetch(url);
    const json = await res.json();
    assertOk(json);
    return parseQuote(json);
  });
}

// Batch quotes: serve cached symbols, fetch only the missing ones in one call,
// and fall back to stale cache for anything the API couldn't return.
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
    const url = `${BASE}/quote?symbol=${encodeURIComponent(missing.join(","))}&apikey=${apiKey()}`;
    const res = await fetch(url);
    const json = await res.json();
    assertOk(json);
    // One symbol returns a flat object; multiple return a map keyed by symbol.
    const entries = missing.length === 1 ? { [missing[0]]: json } : json;
    for (const key of Object.keys(entries)) {
      const entry = entries[key];
      if (entry && entry.symbol) {
        const q = parseQuote(entry);
        const sym = q.symbol.toUpperCase();
        out[sym] = q;
        cache.set(`quote:${sym}`, { at: Date.now(), data: q });
      }
    }
  } catch {
    // Rate-limited: fill whatever we still have cached (even if stale).
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

// Daily candles barely change intraday, so cache for 10 minutes.
const TIMESERIES_TTL = 600_000;

export async function getTimeSeries(
  symbol: string,
  interval = "1day",
  outputsize = 90
): Promise<Candle[]> {
  const key = `ts:${symbol.toUpperCase()}:${interval}:${outputsize}`;
  return cached(key, TIMESERIES_TTL, async () => {
    const url = `${BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey()}`;
    const res = await fetch(url);
    const json = await res.json();
    assertOk(json);
    const values = Array.isArray(json.values) ? json.values : [];
    // Twelve Data returns newest-first; reverse for chronological charting.
    return values
      .map((v: Record<string, string>) => ({ datetime: v.datetime, close: Number(v.close) }))
      .reverse();
  });
}
