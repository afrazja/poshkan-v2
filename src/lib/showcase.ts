import "server-only";
import { getQuotes } from "./marketdata";
import { ETF_NOTES, SHOWCASE_ETFS, SHOWCASE_STOCKS, showcaseSymbols } from "./showcase-universe";

// Six shelves for an empty stock account, all computed from ONE batched quote
// over the universe. The quote already carries today's move, the 52-week high
// and low, volume and market cap, so no shelf needs a screener API or any
// per-symbol history.
//
// House rule for this feature: a row never shows a bare percentage. Every one
// carries where the price sits inside its own 12-month range, because "+8%
// today, and higher than it has been all year" teaches something that "+8%"
// alone does not. The exact percentile — cheaper than X% of days — needs daily
// closes, so it stays in the Before you buy panel a click away.

const TTL = 5 * 60_000;
const ROWS = 6;

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

let cache: { at: number; shelves: Shelf[] } | null = null;
let inflight: Promise<Shelf[]> | null = null;

// Money traded, at the scale people say it out loud: $35.0B, $412M.
function usd(v: number): string {
  if (!(v > 0)) return "$0";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v / 1e3)}K`;
}

function rangePosition(price: number, low?: number, high?: number): number | null {
  if (low == null || high == null || !(high > low) || !(price > 0)) return null;
  return ((price - low) / (high - low)) * 100;
}

// How today's move reads against the stock's own year.
function noteFor(r: { rangePct: number | null; changePct: number }): string {
  const p = r.rangePct;
  if (p == null) return "";
  if (p >= 97) return "at the top of its 12-month range";
  if (p >= 85) return `near its 12-month high · ${Math.round(p)}% up the range`;
  if (p <= 3) return "at the bottom of its 12-month range";
  if (p <= 15) return `near its 12-month low · ${Math.round(p)}% up the range`;
  return `${Math.round(p)}% up its 12-month range`;
}

export async function getStockShowcase(): Promise<Shelf[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.shelves;
  if (inflight) return inflight;

  inflight = (async () => {
    const quotes = await getQuotes(showcaseSymbols());

    const all = Object.values(quotes)
      .filter((q) => q && Number.isFinite(q.price) && q.price > 0)
      .map((q) => {
        const rangePct = rangePosition(q.price, q.fiftyTwoWeekLow, q.fiftyTwoWeekHigh);
        const row: ShowcaseRow = {
          symbol: q.symbol.toUpperCase(),
          name: q.name ?? q.symbol,
          price: q.price,
          changePct: Number.isFinite(q.percentChange) ? q.percentChange : 0,
          rangePct,
          volume: q.volume ?? null,
          marketCap: q.marketCap ?? null,
          note: "",
        };
        row.note = noteFor(row);
        return row;
      });

    const stockSet = new Set(SHOWCASE_STOCKS);
    // Traded today, or not at all: a delisted or halted ticker keeps its last
    // price forever, which would park it permanently at the top of the
    // near-its-low shelf. Requiring volume drops those on their own, including
    // ones that get acquired long after this list was written.
    const stocks = all.filter((r) => stockSet.has(r.symbol) && (r.volume ?? 0) > 0);
    const withRange = stocks.filter((r) => r.rangePct != null);
    // Rank by money traded rather than share count: a $9 stock swapping 40m
    // shares is not busier than Apple swapping 30m.
    const traded = stocks.filter((r) => r.volume != null && r.volume > 0);

    const shelves: Shelf[] = [
      {
        key: "etfs",
        label: "Whole markets",
        blurb: "One holding that owns hundreds of companies at once. Not sure which company? Start here.",
        rows: SHOWCASE_ETFS.map((s) => all.find((r) => r.symbol === s))
          .filter((r): r is ShowcaseRow => !!r)
          .map((r) => ({ ...r, note: ETF_NOTES[r.symbol] ?? r.note })),
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
        // This shelf is about size of flow, so lead the note with the figure
        // that ranked it rather than making the reader take it on trust.
        rows: [...traded]
          .sort((a, b) => (b.volume ?? 0) * b.price - (a.volume ?? 0) * a.price)
          .slice(0, ROWS)
          .map((r) => ({
            ...r,
            note: `${usd((r.volume ?? 0) * r.price)} traded${r.note ? ` · ${r.note}` : ""}`,
          })),
      },
    ];

    const kept = shelves.filter((s) => s.rows.length > 0);
    cache = { at: Date.now(), shelves: kept };
    return kept;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
