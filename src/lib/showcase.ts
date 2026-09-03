import "server-only";
import { getQuotes } from "./marketdata";
import type { Quote } from "./types";
import {
  CRYPTO_MAJORS,
  CRYPTO_NOTES,
  CRYPTO_STABLE,
  CRYPTO_START,
  ETF_NOTES,
  SHOWCASE_ETFS,
  SHOWCASE_STOCKS,
  cryptoShowcaseSymbols,
  showcaseSymbols,
} from "./showcase-universe";

// Shelves for an empty account, all computed from ONE batched quote over the
// universe. The quote already carries today's move, the 52-week high and low,
// volume and market cap, so no shelf needs a screener API or per-symbol history.
//
// House rule for this feature: a row never shows a bare percentage. Every one
// carries where the price sits inside its own 12-month range, because "+8%
// today, and higher than it has been all year" teaches something that "+8%"
// alone does not. The exact percentile — cheaper than X% of days — needs daily
// closes, so it stays in the Before you buy panel a click away.

export type ShowcaseType = "stocks" | "crypto";

const TTL = 5 * 60_000;
const ROWS = 6;
const CRYPTO_ROWS = 5;
// A ticker that resolves to the wrong asset is usually a near-worthless token
// wearing a famous name. Nothing this small reaches a shelf.
const MIN_CRYPTO_CAP = 100e6;

export interface ShowcaseRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  /** 0 = at its 12-month low, 100 = at its 12-month high. Null when unknown. */
  rangePct: number | null;
  volume: number | null;
  marketCap: number | null;
  /** The one line of context that keeps this from being a hype list. */
  note: string;
}

export interface Shelf {
  key: string;
  label: string;
  blurb: string;
  rows: ShowcaseRow[];
}

const cache = new Map<ShowcaseType, { at: number; shelves: Shelf[] }>();
const inflight = new Map<ShowcaseType, Promise<Shelf[]>>();

// Money traded, at the scale people say it out loud: $35.0B, $412M.
function usd(v: number): string {
  if (!(v > 0)) return "$0";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v / 1e3)}K`;
}

// Yahoo reports a stock's volume in shares but a coin's in dollars already, so
// multiplying blindly would rank coins by dollars squared.
function dollarsTraded(r: ShowcaseRow, isCrypto: boolean): number {
  const v = r.volume ?? 0;
  return isCrypto ? v : v * r.price;
}

function rangePosition(price: number, low?: number, high?: number): number | null {
  if (low == null || high == null || !(high > low) || !(price > 0)) return null;
  return ((price - low) / (high - low)) * 100;
}

// How today's move reads against the asset's own year.
function noteFor(rangePct: number | null): string {
  if (rangePct == null) return "";
  if (rangePct >= 97) return "at the top of its 12-month range";
  if (rangePct >= 85) return `near its 12-month high · ${Math.round(rangePct)}% up the range`;
  if (rangePct <= 3) return "at the bottom of its 12-month range";
  if (rangePct <= 15) return `near its 12-month low · ${Math.round(rangePct)}% up the range`;
  return `${Math.round(rangePct)}% up its 12-month range`;
}

function toRow(q: Quote): ShowcaseRow {
  const rangePct = rangePosition(q.price, q.fiftyTwoWeekLow, q.fiftyTwoWeekHigh);
  return {
    symbol: q.symbol.toUpperCase(),
    name: q.name ?? q.symbol,
    price: q.price,
    changePct: Number.isFinite(q.percentChange) ? q.percentChange : 0,
    rangePct,
    volume: q.volume ?? null,
    marketCap: q.marketCap ?? null,
    note: noteFor(rangePct),
  };
}

async function priceAll(symbols: string[]): Promise<ShowcaseRow[]> {
  const quotes = await getQuotes(symbols);
  return Object.values(quotes)
    .filter((q) => q && Number.isFinite(q.price) && q.price > 0)
    .map(toRow);
}

function curated(all: ShowcaseRow[], order: string[], notes: Record<string, string>): ShowcaseRow[] {
  return order
    .map((s) => all.find((r) => r.symbol === s))
    .filter((r): r is ShowcaseRow => !!r)
    .map((r) => ({ ...r, note: notes[r.symbol] ?? r.note }));
}

async function buildStocks(): Promise<Shelf[]> {
  const all = await priceAll(showcaseSymbols());
  const stockSet = new Set(SHOWCASE_STOCKS);
  // Traded today, or not at all: a delisted or halted ticker keeps its last
  // price forever, which would park it permanently at the top of the
  // near-its-low shelf. Requiring volume drops those on their own.
  const stocks = all.filter((r) => stockSet.has(r.symbol) && (r.volume ?? 0) > 0);
  const withRange = stocks.filter((r) => r.rangePct != null);

  return [
    {
      key: "etfs",
      label: "Whole markets",
      blurb: "One holding that owns hundreds of companies at once. Not sure which company? Start here.",
      rows: curated(all, SHOWCASE_ETFS, ETF_NOTES),
    },
    {
      key: "gainers",
      label: "Up most today",
      blurb: "Today's biggest risers. Check what the jump has done to the price before you follow it.",
      rows: [...stocks].sort((a, b) => b.changePct - a.changePct).slice(0, ROWS),
    },
    {
      key: "losers",
      label: "Down most today",
      blurb: "Today's biggest falls. A red day is not automatically a disaster — see how far it has fallen before.",
      rows: [...stocks].sort((a, b) => a.changePct - b.changePct).slice(0, ROWS),
    },
    {
      key: "near-low",
      label: "Near 12-month low",
      blurb: "Cheaper than they have been all year. Cheap for a reason, or on sale? The evidence is a click away.",
      rows: [...withRange].sort((a, b) => (a.rangePct ?? 0) - (b.rangePct ?? 0)).slice(0, ROWS),
    },
    {
      key: "near-high",
      label: "Near 12-month high",
      blurb: "Priced higher than at any point this year. Momentum, or paying up for it?",
      rows: [...withRange].sort((a, b) => (b.rangePct ?? 0) - (a.rangePct ?? 0)).slice(0, ROWS),
    },
    {
      key: "traded",
      label: "Most traded today",
      blurb: "Where the money went today, by dollars changing hands — not share count.",
      rows: [...stocks]
        .sort((a, b) => dollarsTraded(b, false) - dollarsTraded(a, false))
        .slice(0, ROWS)
        .map((r) => ({ ...r, note: `${usd(dollarsTraded(r, false))} traded${r.note ? ` · ${r.note}` : ""}` })),
    },
  ];
}

async function buildCrypto(): Promise<Shelf[]> {
  const all = await priceAll(cryptoShowcaseSymbols());
  const majorSet = new Set(CRYPTO_MAJORS);
  const stableSet = new Set(CRYPTO_STABLE);
  // The cap floor is what stops a renamed or mis-resolved ticker — a $17k token
  // sharing a famous abbreviation — from ever reaching a beginner's screen.
  const coins = all.filter(
    (r) => majorSet.has(r.symbol) && (r.marketCap ?? 0) >= MIN_CRYPTO_CAP && (r.volume ?? 0) > 0
  );
  const withRange = coins.filter((r) => r.rangePct != null);

  return [
    {
      key: "start",
      label: "Start here",
      blurb:
        "Two coins make up most of the whole market. Before buying a third, open Before you buy and check whether it is a separate bet from Bitcoin at all.",
      rows: curated(all, CRYPTO_START, CRYPTO_NOTES),
    },
    {
      key: "gainers",
      label: "Up most today",
      blurb: "Today's biggest risers. Most coins rise and fall with Bitcoin, so check whether this is its own move.",
      rows: [...coins].sort((a, b) => b.changePct - a.changePct).slice(0, CRYPTO_ROWS),
    },
    {
      key: "losers",
      label: "Down most today",
      blurb: "Today's biggest falls. Coins fall further than shares do — see how deep it has gone before.",
      rows: [...coins].sort((a, b) => a.changePct - b.changePct).slice(0, CRYPTO_ROWS),
    },
    {
      key: "near-low",
      label: "Near 12-month low",
      blurb: "Cheaper than they have been all year. Crypto stays down for years at a time, so read the drawdown history first.",
      rows: [...withRange].sort((a, b) => (a.rangePct ?? 0) - (b.rangePct ?? 0)).slice(0, CRYPTO_ROWS),
    },
    {
      key: "near-high",
      label: "Near 12-month high",
      blurb: "Priced higher than at any point this year.",
      rows: [...withRange].sort((a, b) => (b.rangePct ?? 0) - (a.rangePct ?? 0)).slice(0, CRYPTO_ROWS),
    },
    {
      key: "traded",
      label: "Most traded today",
      blurb: "Where the money went in the last 24 hours.",
      rows: [...coins]
        .sort((a, b) => dollarsTraded(b, true) - dollarsTraded(a, true))
        .slice(0, CRYPTO_ROWS)
        .map((r) => ({ ...r, note: `${usd(dollarsTraded(r, true))} traded${r.note ? ` · ${r.note}` : ""}` })),
    },
    {
      key: "stable",
      label: "Dollar-pegged",
      blurb:
        "These aim to stay at $1 rather than grow. They are where people park money between trades — holding one is closer to holding cash than to investing.",
      rows: curated(all, CRYPTO_STABLE, CRYPTO_NOTES),
    },
  ];
}

export async function getShowcase(type: ShowcaseType): Promise<Shelf[]> {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < TTL) return hit.shelves;
  const pending = inflight.get(type);
  if (pending) return pending;

  const p = (async () => {
    const shelves = (await (type === "crypto" ? buildCrypto() : buildStocks())).filter(
      (s) => s.rows.length > 0
    );
    cache.set(type, { at: Date.now(), shelves });
    return shelves;
  })().finally(() => inflight.delete(type));

  inflight.set(type, p);
  return p;
}
