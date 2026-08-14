import "server-only";

import type { Quote } from "./types";

const BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CREDITS_PER_MINUTE = 8;
const MAX_OUTPUT_SIZE = 5_000;

type JsonObject = Record<string, unknown>;

export class TwelveDataError extends Error {
  constructor(
    message: string,
    readonly rateLimited = false
  ) {
    super(message);
    this.name = "TwelveDataError";
  }
}

let creditWindow = -1;
let creditsUsed = 0;
let pausedUntil = 0;
let announced = false;

export function isTwelveDataConfigured(): boolean {
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  return Boolean(key && key !== "[sensitive]" && !key.startsWith("your-"));
}

function apiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!key || key === "[sensitive]" || key.startsWith("your-")) {
    throw new TwelveDataError("TWELVE_DATA_API_KEY is not configured");
  }
  return key;
}

function creditsPerMinute(): number {
  const configured = Number(process.env.TWELVE_DATA_CREDITS_PER_MINUTE);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_CREDITS_PER_MINUTE;
  return Math.min(Math.floor(configured), 100_000);
}

function reserveCredits(credits: number) {
  const now = Date.now();
  if (now < pausedUntil) {
    throw new TwelveDataError("Twelve Data is temporarily paused after a rate-limit response", true);
  }

  const window = Math.floor(now / 60_000);
  if (window !== creditWindow) {
    creditWindow = window;
    creditsUsed = 0;
  }

  if (creditsUsed + credits > creditsPerMinute()) {
    throw new TwelveDataError("Local Twelve Data credit budget exhausted for this minute", true);
  }
  creditsUsed += credits;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRateLimit(message: string, code?: unknown): boolean {
  return Number(code) === 429 || /rate.?limit|api credits|run out of credits|too many requests/i.test(message);
}

async function request(path: string, params: Record<string, string>, credits: number): Promise<JsonObject> {
  reserveCredits(credits);
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("apikey", apiKey());

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TwelveDataError(`Twelve Data request failed: ${(error as Error).message}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new TwelveDataError(`Twelve Data returned HTTP ${response.status} without JSON`);
  }

  const object = isObject(json) ? json : {};
  const message = String(object.message ?? `Twelve Data returned HTTP ${response.status}`);
  const limited = response.status === 429 || isRateLimit(message, object.code);
  if (!response.ok || object.status === "error") {
    if (limited) pausedUntil = Date.now() + 60_000;
    throw new TwelveDataError(message, limited);
  }

  if (!announced) {
    announced = true;
    console.info("[marketdata] Twelve Data provider active");
  }
  return object;
}

const CRYPTO_QUOTES = new Set(["USD", "USDT", "USDC", "EUR", "GBP", "BTC", "ETH"]);

export function toTwelveSymbol(symbol: string): string {
  const value = symbol.trim().toUpperCase();
  const forex = value.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (forex) return `${forex[1]}/${forex[2]}`;

  const crypto = value.match(/^(.+)-([A-Z0-9]{3,5})$/);
  if (crypto && CRYPTO_QUOTES.has(crypto[2])) return `${crypto[1]}/${crypto[2]}`;
  return value;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseQuote(raw: JsonObject, canonicalSymbol: string): Quote {
  const price = numberValue(raw.close);
  if (price == null || price <= 0) throw new TwelveDataError(`No valid quote for ${canonicalSymbol}`);

  const previousClose = numberValue(raw.previous_close) ?? price;
  const change = numberValue(raw.change) ?? price - previousClose;
  const percentChange = numberValue(raw.percent_change) ?? (previousClose ? (change / previousClose) * 100 : 0);
  const range = isObject(raw.fifty_two_week) ? raw.fifty_two_week : {};

  return {
    symbol: canonicalSymbol.toUpperCase(),
    name: String(raw.name ?? canonicalSymbol),
    price,
    previousClose,
    change,
    percentChange,
    currency: String(raw.currency ?? "USD"),
    isMarketOpen: raw.is_market_open === true || raw.is_market_open === "true",
    open: numberValue(raw.open),
    dayHigh: numberValue(raw.high),
    dayLow: numberValue(raw.low),
    fiftyTwoWeekHigh: numberValue(range.high),
    fiftyTwoWeekLow: numberValue(range.low),
  };
}

function quoteObjects(response: JsonObject): JsonObject[] {
  if (response.symbol) return [response];
  return Object.values(response).filter(isObject);
}

export async function getTwelveQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const unique = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))).filter(Boolean);
  if (unique.length === 0) return {};

  const providerToCanonical = new Map(unique.map((symbol) => [toTwelveSymbol(symbol), symbol]));
  const response = await request(
    "/quote",
    { symbol: Array.from(providerToCanonical.keys()).join(",") },
    providerToCanonical.size
  );

  const quotes: Record<string, Quote> = {};
  for (const raw of quoteObjects(response)) {
    if (raw.status === "error") continue;
    const providerSymbol = String(raw.symbol ?? "").toUpperCase();
    const canonical = providerToCanonical.get(providerSymbol);
    if (!canonical) continue;
    try {
      quotes[canonical] = parseQuote(raw, canonical);
    } catch {
      // A bad symbol in a batch should not discard valid siblings.
    }
  }
  return quotes;
}

export async function getTwelveQuote(symbol: string): Promise<Quote> {
  const canonical = symbol.trim().toUpperCase();
  const quotes = await getTwelveQuotes([canonical]);
  const quote = quotes[canonical];
  if (!quote) throw new TwelveDataError(`No Twelve Data quote for ${canonical}`);
  return quote;
}

export interface TwelveCandle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

function twelveInterval(interval: string): string {
  if (interval === "1week" || interval === "1wk") return "1week";
  return interval.replace(/^(\d+)m$/, "$1min");
}

function normalizedDatetime(value: unknown, daily: boolean): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (daily) return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;

  const isoLike = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(isoLike) ? isoLike : `${isoLike}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseCandles(values: unknown, daily: boolean): TwelveCandle[] {
  if (!Array.isArray(values)) return [];
  const byTime = new Map<string, TwelveCandle>();

  for (const value of values) {
    if (!isObject(value)) continue;
    const datetime = normalizedDatetime(value.datetime, daily);
    const open = numberValue(value.open);
    const high = numberValue(value.high);
    const low = numberValue(value.low);
    const close = numberValue(value.close);
    const volume = numberValue(value.volume);
    if (!datetime || open == null || high == null || low == null || close == null) continue;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    byTime.set(datetime, {
      datetime,
      open,
      high,
      low,
      close,
      ...(volume != null && volume >= 0 ? { volume } : {}),
    });
  }

  return Array.from(byTime.values()).sort(
    (left, right) => new Date(left.datetime).getTime() - new Date(right.datetime).getTime()
  );
}

export async function getTwelveOhlc(
  symbol: string,
  interval: string,
  outputsize: number,
  lookbackDays?: number
): Promise<TwelveCandle[]> {
  const normalizedInterval = twelveInterval(interval);
  const daily = normalizedInterval === "1day" || normalizedInterval === "1week";
  const size = Math.max(1, Math.min(Math.floor(outputsize), MAX_OUTPUT_SIZE));
  const params: Record<string, string> = {
    symbol: toTwelveSymbol(symbol),
    interval: normalizedInterval,
    outputsize: String(size),
    order: "asc",
    adjust: "splits",
  };
  if (!daily) params.timezone = "UTC";
  if (lookbackDays && lookbackDays > 0) {
    const start = new Date(Date.now() - Math.ceil(lookbackDays) * 86_400_000);
    params.start_date = daily ? start.toISOString().slice(0, 10) : start.toISOString().slice(0, 19);
  }

  const response = await request("/time_series", params, 1);
  const candles = parseCandles(response.values, daily);
  if (candles.length === 0) throw new TwelveDataError(`No valid Twelve Data candles for ${symbol}`);
  return candles.slice(-size);
}
