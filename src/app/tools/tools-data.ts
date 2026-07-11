// Public, indexable forex calculators — the programmatic-SEO tool surface.
// Every page is generated from this file: pairs × calculator types. The math
// here is calculator-grade (self-contained, cross-pair aware); live positions
// in the app keep using src/lib/forex.ts.

export interface ToolPair {
  slug: string; // URL segment, matches how people search: "eurusd"
  yahoo: string; // Yahoo Finance symbol for the live rate
  name: string; // "EUR/USD"
  label: string; // "Euro / US Dollar"
  base: string;
  quote: string;
  pipSize: number;
  contractSize: number; // units per standard lot (100k FX, 100 oz gold)
  rateDp: number; // display decimals for the rate
  fallbackRate: number; // used when the live fetch fails at render time
  nickname?: string; // trader slang, gives each page unique flavor copy
}

// USD value of 1 unit of a quote currency is derived from one of the majors;
// `invert: true` means the major is quoted as USD/XXX so we divide.
export const QUOTE_USD_SOURCE: Record<string, { yahoo: string; invert: boolean; fallback: number } | null> = {
  USD: null,
  JPY: { yahoo: "USDJPY=X", invert: true, fallback: 1 / 155 },
  GBP: { yahoo: "GBPUSD=X", invert: false, fallback: 1.27 },
  CHF: { yahoo: "USDCHF=X", invert: true, fallback: 1 / 0.88 },
  AUD: { yahoo: "AUDUSD=X", invert: false, fallback: 0.66 },
  CAD: { yahoo: "USDCAD=X", invert: true, fallback: 1 / 1.36 },
};

const fx = (
  slug: string,
  name: string,
  label: string,
  fallbackRate: number,
  nickname?: string
): ToolPair => {
  const [base, quote] = name.split("/");
  const jpy = quote === "JPY";
  return {
    slug,
    yahoo: `${base}${quote}=X`,
    name,
    label,
    base,
    quote,
    pipSize: jpy ? 0.01 : 0.0001,
    contractSize: 100_000,
    rateDp: jpy ? 3 : 5,
    fallbackRate,
    nickname,
  };
};

export const TOOL_PAIRS: ToolPair[] = [
  // The 7 majors
  fx("eurusd", "EUR/USD", "Euro / US Dollar", 1.08, "the Fiber"),
  fx("gbpusd", "GBP/USD", "British Pound / US Dollar", 1.27, "Cable"),
  fx("usdjpy", "USD/JPY", "US Dollar / Japanese Yen", 155, "the Gopher"),
  fx("audusd", "AUD/USD", "Australian Dollar / US Dollar", 0.66, "the Aussie"),
  fx("usdcad", "USD/CAD", "US Dollar / Canadian Dollar", 1.36, "the Loonie"),
  fx("usdchf", "USD/CHF", "US Dollar / Swiss Franc", 0.88, "the Swissy"),
  fx("nzdusd", "NZD/USD", "New Zealand Dollar / US Dollar", 0.61, "the Kiwi"),
  // Popular crosses
  fx("eurgbp", "EUR/GBP", "Euro / British Pound", 0.855, "Chunnel"),
  fx("eurjpy", "EUR/JPY", "Euro / Japanese Yen", 167, "the Yuppy"),
  fx("gbpjpy", "GBP/JPY", "British Pound / Japanese Yen", 196, "the Beast"),
  fx("audjpy", "AUD/JPY", "Australian Dollar / Japanese Yen", 102),
  fx("eurchf", "EUR/CHF", "Euro / Swiss Franc", 0.95),
  fx("euraud", "EUR/AUD", "Euro / Australian Dollar", 1.63),
  fx("nzdjpy", "NZD/JPY", "New Zealand Dollar / Japanese Yen", 94),
  fx("cadjpy", "CAD/JPY", "Canadian Dollar / Japanese Yen", 114),
  fx("chfjpy", "CHF/JPY", "Swiss Franc / Japanese Yen", 176),
  fx("gbpchf", "GBP/CHF", "British Pound / Swiss Franc", 1.12),
  // Gold: 1 lot = 100 oz, 1 pip = $0.10 of price movement. Yahoo has no spot
  // XAUUSD quote; COMEX front-month futures track spot closely enough here.
  {
    slug: "xauusd",
    yahoo: "GC=F",
    name: "XAU/USD",
    label: "Gold / US Dollar",
    base: "XAU",
    quote: "USD",
    pipSize: 0.1,
    contractSize: 100,
    rateDp: 2,
    fallbackRate: 4100,
    nickname: "Gold",
  },
];

export function toolPairBySlug(slug: string): ToolPair | undefined {
  return TOOL_PAIRS.find((p) => p.slug === slug.toLowerCase());
}

export type CalcKey = "pip-calculator" | "position-size-calculator" | "margin-calculator" | "profit-calculator";

export interface ToolCalc {
  slug: CalcKey;
  icon: string;
  name: string; // "Pip Calculator"
  short: string; // one-line card blurb
  seoTitle: (p: ToolPair) => string;
  seoDescription: (p: ToolPair) => string;
  genericTitle: string;
  genericDescription: string;
}

const compact = (p: ToolPair) => p.name.replace("/", "");

export const TOOL_CALCS: ToolCalc[] = [
  {
    slug: "pip-calculator",
    icon: "📐",
    name: "Pip Calculator",
    short: "What one pip is worth in USD, per lot size.",
    seoTitle: (p) => `${p.name} Pip Calculator — Pip Value in USD (${compact(p)})`,
    seoDescription: (p) =>
      `Free ${p.name} pip value calculator: see what 1 pip is worth in USD for micro, mini and standard lots, with the live ${compact(p)} rate and the formula explained.`,
    genericTitle: "Forex Pip Calculator — Pip Value in USD for Every Major Pair",
    genericDescription:
      "Free pip value calculator for all major forex pairs and gold: pick a pair, set your lot size, and see exactly what one pip is worth in USD — with live rates.",
  },
  {
    slug: "position-size-calculator",
    icon: "⚖️",
    name: "Position Size Calculator",
    short: "How many lots to trade for your risk % and stop-loss.",
    seoTitle: (p) => `${p.name} Position Size Calculator — Lots by Risk % (${compact(p)})`,
    seoDescription: (p) =>
      `Free ${p.name} position size calculator: enter account balance, risk percent and stop-loss in pips to get the exact lot size for a ${compact(p)} trade.`,
    genericTitle: "Forex Position Size Calculator — Lot Size from Risk % and Stop-Loss",
    genericDescription:
      "Free position size calculator for forex and gold: enter your balance, risk percentage and stop-loss in pips to get the exact lots to trade on any major pair.",
  },
  {
    slug: "margin-calculator",
    icon: "🏦",
    name: "Margin Calculator",
    short: "Required margin for a trade at your leverage.",
    seoTitle: (p) => `${p.name} Margin Calculator — Required Margin by Leverage (${compact(p)})`,
    seoDescription: (p) =>
      `Free ${p.name} margin calculator: see the USD margin required to open a ${compact(p)} position at 30:1, 50:1, 100:1, 200:1 or 500:1 leverage, with live rates.`,
    genericTitle: "Forex Margin Calculator — Required Margin at 30:1 to 500:1 Leverage",
    genericDescription:
      "Free margin calculator for forex and gold: pick a pair, lot size and leverage to see the exact USD margin required to open the position — with live rates.",
  },
  {
    slug: "profit-calculator",
    icon: "💹",
    name: "Profit Calculator",
    short: "P&L in pips and USD between an entry and exit.",
    seoTitle: (p) => `${p.name} Profit Calculator — Pips & P&L in USD (${compact(p)})`,
    seoDescription: (p) =>
      `Free ${p.name} profit calculator: enter entry price, exit price and lot size to see the result of a long or short ${compact(p)} trade in pips and US dollars.`,
    genericTitle: "Forex Profit Calculator — Trade P&L in Pips and USD",
    genericDescription:
      "Free forex profit calculator: enter entry, exit, direction and lot size on any major pair or gold to see the trade result in pips and US dollars.",
  },
];

export function toolCalcBySlug(slug: string): ToolCalc | undefined {
  return TOOL_CALCS.find((c) => c.slug === slug.toLowerCase());
}

// ---------------------------------------------------------------------------
// Calculator math — pure, shared by the client component and the SEO copy.
// `quoteUsd` is the USD value of 1 unit of the pair's quote currency.
// ---------------------------------------------------------------------------

export function toolPipValueUsd(units: number, pair: ToolPair, quoteUsd: number): number {
  return units * pair.pipSize * quoteUsd;
}

export function toolPositionSize(
  balance: number,
  riskPct: number,
  slPips: number,
  pair: ToolPair,
  quoteUsd: number
): { riskUsd: number; units: number; lots: number } {
  const riskUsd = balance * (riskPct / 100);
  const perUnit = pair.pipSize * quoteUsd; // USD risked per pip per unit
  const units = slPips > 0 && perUnit > 0 ? riskUsd / (slPips * perUnit) : 0;
  return { riskUsd, units, lots: units / pair.contractSize };
}

export function toolMarginUsd(
  units: number,
  rate: number,
  leverage: number,
  pair: ToolPair,
  quoteUsd: number
): { notionalUsd: number; marginUsd: number } {
  // USD per unit of the base: XXX/USD pairs convert at the rate; USD/XXX are
  // natively USD; crosses go base → quote → USD.
  const baseUsd = pair.base === "USD" ? 1 : pair.quote === "USD" ? rate : rate * quoteUsd;
  const notionalUsd = units * baseUsd;
  return { notionalUsd, marginUsd: leverage > 0 ? notionalUsd / leverage : 0 };
}

export function toolProfit(
  direction: "LONG" | "SHORT",
  units: number,
  entry: number,
  exit: number,
  pair: ToolPair,
  quoteUsd: number
): { pips: number; profitUsd: number } {
  const sign = direction === "SHORT" ? -1 : 1;
  return {
    pips: (sign * (exit - entry)) / pair.pipSize,
    profitUsd: sign * (exit - entry) * units * quoteUsd,
  };
}

// The quote→USD factor, recomputed when the user edits the pair rate where the
// pair itself defines the conversion (USD-base pairs like USD/JPY).
export function effectiveQuoteUsd(pair: ToolPair, rate: number, serverQuoteUsd: number): number {
  if (pair.quote === "USD") return 1;
  if (pair.base === "USD") return rate > 0 ? 1 / rate : 0;
  return serverQuoteUsd; // cross pair: conversion comes from a different symbol
}

export const fmtUsd = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtToolRate = (n: number, pair: ToolPair) => n.toFixed(pair.rateDp);
