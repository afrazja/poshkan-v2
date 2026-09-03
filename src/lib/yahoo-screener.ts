import "server-only";

// Yahoo's own predefined screeners, over the WHOLE US market rather than any
// list we maintain. The hand-written universe in showcase-universe.ts is a good
// pool for "near its 12-month low", but it is the wrong tool for "who moved
// most today": on 3 Sep 2026 the real top gainer was Snowflake at +20.9% and
// the real worst faller was Ciena at −9.7%, and neither is in that list, so the
// shelves quietly understated the day.
//
// yahoo-finance2's own screener() rejects this payload against its schema, so
// we ask the endpoint directly. It needs no key and no cookie.

const BASE = "https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved";

export type ScreenerId = "day_gainers" | "day_losers" | "most_actives";

export interface ScreenerHit {
  symbol: string;
  marketCap: number | null;
}

interface RawQuote {
  symbol?: unknown;
  marketCap?: unknown;
}

export async function screenerSymbols(id: ScreenerId, count = 15): Promise<ScreenerHit[]> {
  const url = `${BASE}?scrIds=${encodeURIComponent(id)}&count=${count}&formatted=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    // The showcase caches its own result for five minutes; don't add another layer.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`screener ${id}: HTTP ${res.status}`);
  const json = (await res.json()) as {
    finance?: { result?: { quotes?: RawQuote[] }[] };
  };
  const rows = json?.finance?.result?.[0]?.quotes ?? [];
  return rows
    .map((q) => ({
      symbol: typeof q.symbol === "string" ? q.symbol.toUpperCase() : "",
      marketCap: typeof q.marketCap === "number" ? q.marketCap : null,
    }))
    .filter((h) => h.symbol.length > 0);
}

/** Every symbol the mover shelves should consider, beyond our own universe. */
export async function todaysMovers(minMarketCap: number): Promise<string[]> {
  const ids: ScreenerId[] = ["day_gainers", "day_losers", "most_actives"];
  const lists = await Promise.all(
    ids.map((id) => screenerSymbols(id).catch(() => [] as ScreenerHit[]))
  );
  const out = new Set<string>();
  for (const list of lists) {
    for (const hit of list) {
      // A cap floor keeps the shelves to companies a beginner might plausibly
      // have heard of, and keeps out the pumped micro-caps that dominate an
      // unfiltered gainers list.
      if ((hit.marketCap ?? 0) >= minMarketCap) out.add(hit.symbol);
    }
  }
  return Array.from(out);
}
