import "server-only";
import type { Quote, SymbolSearchResult } from "./types";

const BASE = "https://api.twelvedata.com";

function apiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("TWELVE_DATA_API_KEY is not set");
  return key;
}

// Twelve Data sometimes returns { status: "error", message } with HTTP 200.
function assertOk(json: Record<string, unknown>) {
  if (json && json.status === "error") {
    throw new Error(String(json.message ?? "Twelve Data error"));
  }
}

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  const url = `${BASE}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=15&apikey=${apiKey()}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  const json = await res.json();
  assertOk(json);
  const data = Array.isArray(json.data) ? json.data : [];
  // Prefer US equities for v1.
  return data
    .filter((d: Record<string, string>) => d.instrument_type !== "Digital Currency")
    .map((d: Record<string, string>) => ({
      symbol: d.symbol,
      name: d.instrument_name,
      exchange: d.exchange,
      currency: d.currency,
      instrumentType: d.instrument_type,
    }));
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

export async function getQuote(symbol: string): Promise<Quote> {
  const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey()}`;
  const res = await fetch(url, { next: { revalidate: 10 } });
  const json = await res.json();
  assertOk(json);
  return parseQuote(json);
}

// Batch quotes: Twelve Data returns a map keyed by symbol when multiple are requested.
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
  if (unique.length === 0) return {};
  if (unique.length === 1) {
    const q = await getQuote(unique[0]);
    return { [q.symbol.toUpperCase()]: q };
  }
  const url = `${BASE}/quote?symbol=${encodeURIComponent(unique.join(","))}&apikey=${apiKey()}`;
  const res = await fetch(url, { next: { revalidate: 10 } });
  const json = await res.json();
  assertOk(json);
  const out: Record<string, Quote> = {};
  for (const key of Object.keys(json)) {
    const entry = json[key];
    if (entry && entry.symbol) out[key.toUpperCase()] = parseQuote(entry);
  }
  return out;
}

export interface Candle {
  datetime: string;
  close: number;
}

export async function getTimeSeries(
  symbol: string,
  interval = "1day",
  outputsize = 90
): Promise<Candle[]> {
  const url = `${BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey()}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  const json = await res.json();
  assertOk(json);
  const values = Array.isArray(json.values) ? json.values : [];
  // Twelve Data returns newest-first; reverse for chronological charting.
  return values
    .map((v: Record<string, string>) => ({ datetime: v.datetime, close: Number(v.close) }))
    .reverse();
}
