import "server-only";
import YahooFinance from "yahoo-finance2";
import { isCryptoSymbol, isForexPairSymbol } from "./assets";

// The Owner's View data layer: what a long-term holder wants to know about the
// thing they own — what it is, whether it makes money, whether it is healthy,
// what it costs, what is coming, and what others are doing. All of it is free
// from Yahoo with no key. Fundamentals change quarterly, so a day-long cache is
// generous; one call per symbol per instance per day.
//
// Everything here is *evidence* for the holder to interpret. Nothing in this
// module recommends anything.

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const TTL_OK = 24 * 60 * 60_000;
const TTL_FAIL = 10 * 60_000; // a failed fetch is retried in ten minutes, not hammered
const cache = new Map<string, { at: number; ttl: number; data: Fundamentals | null }>();

export type AssetKind = "stock" | "etf" | "crypto" | "forex";

export interface YearMoney {
  year: number;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
}

export interface Fundamentals {
  symbol: string;
  kind: AssetKind;
  asOf: string;
  name: string | null;
  marketCap: number | null;
  profile: { sector: string | null; industry: string | null; summary: string | null; website: string | null } | null;
  money: { years: YearMoney[]; profitMargin: number | null; revenueGrowth: number | null } | null;
  health: { cash: number | null; debt: number | null; freeCashflow: number | null } | null;
  valuation: { pe: number | null; forwardPe: number | null; dividendYield: number | null } | null;
  events: { nextEarnings: string | null; exDividend: string | null } | null;
  analysts: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    targetMean: number | null;
    targetLow: number | null;
    targetHigh: number | null;
  } | null;
  insiders: { buys6m: number; sells6m: number } | null;
  crypto: { circulatingSupply: number | null; maxSupply: number | null; volume24h: number | null } | null;
}

export function assetKind(symbol: string): AssetKind {
  if (isCryptoSymbol(symbol)) return "crypto";
  if (isForexPairSymbol(symbol)) return "forex";
  return "stock";
}

// Yahoo returns plain numbers with validateResult:false, but older payload
// shapes wrap them as { raw, fmt }. Accept either; reject the rest.
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "raw" in v) return num((v as { raw: unknown }).raw);
  return null;
}
function iso(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  if (Array.isArray(v)) return iso(v[0]);
  return null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type Loose = Record<string, unknown>;
const get = (o: unknown, k: string): unknown => (o && typeof o === "object" ? (o as Loose)[k] : undefined);

export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;

  let data: Fundamentals | null = null;
  try {
    data = await fetchFundamentals(sym);
  } catch (error) {
    console.warn(`[fundamentals] ${sym}: ${(error as Error).message ?? "fetch failed"}`);
  }
  cache.set(sym, { at: Date.now(), ttl: data ? TTL_OK : TTL_FAIL, data });
  return data;
}

async function fetchFundamentals(sym: string): Promise<Fundamentals> {
  const kind = assetKind(sym);
  const asOf = new Date().toISOString();

  if (kind === "forex") {
    // A currency pair has no business behind it; the price context is the story.
    return { symbol: sym, kind, asOf, name: null, marketCap: null, profile: null, money: null, health: null, valuation: null, events: null, analysts: null, insiders: null, crypto: null };
  }

  if (kind === "crypto") {
    const r = (await yf.quoteSummary(sym, { modules: ["price", "summaryDetail"] }, { validateResult: false })) as Loose;
    const price = get(r, "price");
    const sd = get(r, "summaryDetail");
    return {
      symbol: sym, kind, asOf,
      name: str(get(price, "longName")) ?? str(get(price, "shortName")),
      marketCap: num(get(price, "marketCap")) ?? num(get(sd, "marketCap")),
      profile: null, money: null, health: null, valuation: null, events: null, analysts: null, insiders: null,
      crypto: {
        circulatingSupply: num(get(price, "circulatingSupply")) ?? num(get(sd, "circulatingSupply")),
        maxSupply: num(get(sd, "maxSupply")),
        volume24h: num(get(sd, "volume24Hr")) ?? num(get(sd, "volume")) ?? num(get(price, "volume24Hr")),
      },
    };
  }

  const [summary, series] = await Promise.all([
    yf.quoteSummary(
      sym,
      {
        modules: [
          "price", "summaryProfile", "financialData", "defaultKeyStatistics", "summaryDetail",
          "calendarEvents", "recommendationTrend", "insiderTransactions", "earnings",
        ],
      },
      { validateResult: false }
    ) as Promise<Loose>,
    // The legacy statement modules have been near-empty since late 2024; the
    // time series is the reliable source for revenue and profit history.
    yf.fundamentalsTimeSeries(
      sym,
      { period1: new Date(Date.now() - 6 * 365 * 86_400_000).toISOString().slice(0, 10), type: "annual", module: "financials" },
      { validateResult: false }
    ).catch(() => null) as Promise<Loose[] | null>,
  ]);

  const price = get(summary, "price");
  const profile = get(summary, "summaryProfile");
  const fin = get(summary, "financialData");
  const stats = get(summary, "defaultKeyStatistics");
  const sd = get(summary, "summaryDetail");
  const cal = get(summary, "calendarEvents");
  const quoteType = str(get(price, "quoteType"));
  const resolvedKind: AssetKind = quoteType === "ETF" ? "etf" : kind;

  // Revenue / profit history: time series first, the earnings chart as fallback.
  let years: YearMoney[] = [];
  if (Array.isArray(series) && series.length) {
    years = series
      .map((row) => {
        const d = iso(get(row, "date"));
        return {
          year: d ? new Date(d).getUTCFullYear() : NaN,
          revenue: num(get(row, "totalRevenue")),
          netIncome: num(get(row, "netIncome")),
          eps: num(get(row, "dilutedEPS")),
        };
      })
      .filter((y) => Number.isFinite(y.year) && (y.revenue != null || y.netIncome != null));
  }
  if (years.length === 0) {
    const yearly = get(get(get(summary, "earnings"), "financialsChart"), "yearly");
    if (Array.isArray(yearly)) {
      years = yearly
        .map((row) => ({
          year: Number(get(row, "date")),
          revenue: num(get(row, "revenue")),
          netIncome: num(get(row, "earnings")),
          eps: null,
        }))
        .filter((y) => Number.isFinite(y.year));
    }
  }
  years.sort((a, b) => a.year - b.year);
  years = years.slice(-5);

  // Insider activity in the last six months, from the readable transaction text.
  const since = Date.now() - 182 * 86_400_000;
  let buys6m = 0;
  let sells6m = 0;
  const tx = get(get(summary, "insiderTransactions"), "transactions");
  if (Array.isArray(tx)) {
    for (const t of tx) {
      const when = iso(get(t, "startDate"));
      if (!when || Date.parse(when) < since) continue;
      const text = (str(get(t, "transactionText")) ?? "").toLowerCase();
      if (/purchase|buy|bought/.test(text)) buys6m++;
      else if (/sale|sold|sell/.test(text)) sells6m++;
    }
  }

  const trend = get(get(summary, "recommendationTrend"), "trend");
  const now = Array.isArray(trend) ? trend.find((t) => get(t, "period") === "0m") ?? trend[0] : null;

  return {
    symbol: sym,
    kind: resolvedKind,
    asOf,
    name: str(get(price, "longName")) ?? str(get(price, "shortName")),
    marketCap: num(get(price, "marketCap")) ?? num(get(sd, "marketCap")),
    profile: profile
      ? {
          sector: str(get(profile, "sector")),
          industry: str(get(profile, "industry")),
          summary: str(get(profile, "longBusinessSummary")),
          website: str(get(profile, "website")),
        }
      : null,
    money: years.length || fin
      ? {
          years,
          profitMargin: num(get(stats, "profitMargins")) ?? num(get(fin, "profitMargins")),
          revenueGrowth: num(get(fin, "revenueGrowth")),
        }
      : null,
    health: fin
      ? { cash: num(get(fin, "totalCash")), debt: num(get(fin, "totalDebt")), freeCashflow: num(get(fin, "freeCashflow")) }
      : null,
    valuation: {
      pe: num(get(sd, "trailingPE")) ?? num(get(stats, "trailingPE")),
      forwardPe: num(get(stats, "forwardPE")) ?? num(get(sd, "forwardPE")),
      dividendYield: num(get(sd, "dividendYield")),
    },
    events: {
      nextEarnings: iso(get(get(get(cal, "earnings"), "earningsDate"), "0") ?? get(get(cal, "earnings"), "earningsDate")),
      exDividend: iso(get(cal, "exDividendDate")),
    },
    analysts: now
      ? {
          strongBuy: num(get(now, "strongBuy")) ?? 0,
          buy: num(get(now, "buy")) ?? 0,
          hold: num(get(now, "hold")) ?? 0,
          sell: num(get(now, "sell")) ?? 0,
          strongSell: num(get(now, "strongSell")) ?? 0,
          targetMean: num(get(fin, "targetMeanPrice")),
          targetLow: num(get(fin, "targetLowPrice")),
          targetHigh: num(get(fin, "targetHighPrice")),
        }
      : null,
    insiders: Array.isArray(tx) ? { buys6m, sells6m } : null,
    crypto: null,
  };
}
