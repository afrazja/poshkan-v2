import "server-only";
import { getQuotes } from "./marketdata";
import { todaysMovers } from "./yahoo-screener";
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
// A shelf must mean what its name says. With 400 stocks something is always
// genuinely red and something is always genuinely near a high; with 15 coins
// neither holds, and "Down most today" ends up listing gains. Rows that do not
// qualify are dropped, and a shelf left empty disappears for the day — which is
// itself the honest answer to "what is near its high?" when nothing is.
// Movers come from the whole US market, not our list, so they need a floor of
// their own: big enough that a beginner might have heard of it, which also
// keeps out the pumped micro-caps that dominate an unfiltered gainers list.
const MIN_MOVER_CAP = 2e9;
const NEAR_LOW_MAX = 25;
const NEAR_HIGH_MIN = 75;

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

/** Shelves, plus the flat list the crypto treemap sizes its tiles from. */
export interface Showcase {
  shelves: Shelf[];
  map: ShowcaseRow[];
}

const cache = new Map<ShowcaseType, { at: number; data: Showcase }>();
const inflight = new Map<ShowcaseType, Promise<Showcase>>();

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

async function buildStocks(): Promise<Showcase> {
  // Who moved most today is a question about the whole market, not about any
  // list we keep: our 400 names missed Snowflake at +20.9% and Ciena at -9.7%
  // on the day this was found. Ask Yahoo which symbols actually moved, then
  // price them through the same cached path as everything else. If the
  // screener is unreachable the shelves fall back to the universe alone.
  const extra = await todaysMovers(MIN_MOVER_CAP).catch(() => [] as string[]);
  const all = await priceAll(Array.from(new Set([...showcaseSymbols(), ...extra])));

  const stockSet = new Set(SHOWCASE_STOCKS);
  const extraSet = new Set(extra);
  // Traded today, or not at all: a delisted or halted ticker keeps its last
  // price forever, which would park it permanently at the top of the
  // near-its-low shelf. Requiring volume drops those on their own.
  const tradedToday = (r: ShowcaseRow) => (r.volume ?? 0) > 0;
  const stocks = all.filter((r) => stockSet.has(r.symbol) && tradedToday(r));
  // The movers pool: our own large caps plus whatever the market threw up today.
  const movers = all.filter((r) => (stockSet.has(r.symbol) || extraSet.has(r.symbol)) && tradedToday(r));
  const withRange = stocks.filter((r) => r.rangePct != null);

  const shelves: Shelf[] = [
    {
      key: "etfs",
      label: "Whole markets",
      blurb: "One holding that owns hundreds of companies at once. Not sure which company? Start here.",
      rows: curated(all, SHOWCASE_ETFS, ETF_NOTES),
    },
    {
      key: "gainers",
      label: "Up most today",
      blurb:
        "The biggest risers across the US market today. Check what the jump has done to the price before you follow it.",
      rows: movers.filter((r) => r.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, ROWS),
    },
    {
      key: "losers",
      label: "Down most today",
      blurb:
        "The biggest falls across the US market today. A red day is not automatically a disaster — see how far it has fallen before.",
      rows: movers.filter((r) => r.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, ROWS),
    },
    {
      key: "near-low",
      label: "Near 12-month low",
      blurb:
        "Large US companies cheaper than they have been all year. Cheap for a reason, or on sale? The evidence is a click away.",
      rows: withRange.filter((r) => (r.rangePct ?? 100) <= NEAR_LOW_MAX).sort((a, b) => (a.rangePct ?? 0) - (b.rangePct ?? 0)).slice(0, ROWS),
    },
    {
      key: "near-high",
      label: "Near 12-month high",
      blurb: "Large US companies priced higher than at any point this year. Momentum, or paying up for it?",
      rows: withRange.filter((r) => (r.rangePct ?? 0) >= NEAR_HIGH_MIN).sort((a, b) => (b.rangePct ?? 0) - (a.rangePct ?? 0)).slice(0, ROWS),
    },
    {
      key: "traded",
      label: "Most traded today",
      blurb: "Where the money went today, by dollars changing hands — not share count.",
      rows: [...movers]
        .sort((a, b) => dollarsTraded(b, false) - dollarsTraded(a, false))
        .slice(0, ROWS)
        .map((r) => ({ ...r, note: `${usd(dollarsTraded(r, false))} traded${r.note ? ` · ${r.note}` : ""}` })),
    },
  ];

  return { shelves, map: [] };
}

async function buildCrypto(): Promise<Showcase> {
  const all = await priceAll(cryptoShowcaseSymbols());
  const majorSet = new Set(CRYPTO_MAJORS);
  const stableSet = new Set(CRYPTO_STABLE);
  // The cap floor is what stops a renamed or mis-resolved ticker — a $17k token
  // sharing a famous abbreviation — from ever reaching a beginner's screen.
  const coins = all.filter(
    (r) => majorSet.has(r.symbol) && (r.marketCap ?? 0) >= MIN_CRYPTO_CAP && (r.volume ?? 0) > 0
  );
  const withRange = coins.filter((r) => r.rangePct != null);

  // The treemap wants the whole market including the dollar-pegged coins: they
  // are a real share of it, and seeing them sit flat while everything else
  // moves is the clearest explanation of what a stablecoin is.
  const map = all
    .filter((r) => (r.marketCap ?? 0) >= MIN_CRYPTO_CAP)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  const shelves: Shelf[] = [
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
      rows: coins.filter((r) => r.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, CRYPTO_ROWS),
    },
    {
      key: "losers",
      label: "Down most today",
      blurb: "Today's biggest falls. Coins fall further than shares do — see how deep it has gone before.",
      rows: coins.filter((r) => r.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, CRYPTO_ROWS),
    },
    {
      key: "near-low",
      label: "Near 12-month low",
      blurb: "Cheaper than they have been all year. Crypto stays down for years at a time, so read the drawdown history first.",
      rows: withRange.filter((r) => (r.rangePct ?? 100) <= NEAR_LOW_MAX).sort((a, b) => (a.rangePct ?? 0) - (b.rangePct ?? 0)).slice(0, CRYPTO_ROWS),
    },
    {
      key: "near-high",
      label: "Near 12-month high",
      blurb: "Priced higher than at any point this year.",
      rows: withRange.filter((r) => (r.rangePct ?? 0) >= NEAR_HIGH_MIN).sort((a, b) => (b.rangePct ?? 0) - (a.rangePct ?? 0)).slice(0, CRYPTO_ROWS),
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

  return { shelves, map };
}

export async function getShowcase(type: ShowcaseType): Promise<Showcase> {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const pending = inflight.get(type);
  if (pending) return pending;

  const p = (async () => {
    const built = await (type === "crypto" ? buildCrypto() : buildStocks());
    const data: Showcase = {
      shelves: built.shelves.filter((s) => s.rows.length > 0),
      map: built.map,
    };
    cache.set(type, { at: Date.now(), data });
    return data;
  })().finally(() => inflight.delete(type));

  inflight.set(type, p);
  return p;
}
