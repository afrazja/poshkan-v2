import "server-only";

import { createAdminClient } from "./supabase/admin";
import type { Quote } from "./types";

// The shared quote layer that sits between the per-instance memory cache and
// the provider. Mirrors market-candle-cache.ts: if the migration has not been
// run (or Supabase is unreachable) it steps aside for five minutes and the
// app falls back to fetching, exactly as it did before this table existed.

let disabledUntil = 0;
let warned = false;

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function disableTemporarily(error: unknown) {
  disabledUntil = Date.now() + 5 * 60_000;
  if (!warned) {
    warned = true;
    // Supabase errors are plain objects, not Error instances - read .message
    // off either so the log names the real cause instead of "[object Object]".
    const message = (error as { message?: string } | null)?.message ?? String(error ?? "unknown error");
    console.warn(`[marketdata] shared quote cache unavailable: ${message}`);
  }
}

export interface QuoteCacheHit {
  /** Rows younger than maxAgeMs — safe to serve as-is. */
  fresh: Record<string, Quote>;
  /** Older rows — a fallback if the provider fails, never a first choice. */
  stale: Record<string, Quote>;
}

const EMPTY: QuoteCacheHit = { fresh: {}, stale: {} };

export async function readQuoteCache(symbols: string[], maxAgeMs: number): Promise<QuoteCacheHit> {
  if (!configured() || Date.now() < disabledUntil || symbols.length === 0) return EMPTY;
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("market_quotes")
      .select("symbol, quote, fetched_at")
      .in("symbol", symbols);
    if (error) throw error;

    const fresh: Record<string, Quote> = {};
    const stale: Record<string, Quote> = {};
    const cutoff = Date.now() - maxAgeMs;
    for (const row of (data ?? []) as { symbol: string; quote: Quote; fetched_at: string }[]) {
      const at = new Date(row.fetched_at).getTime();
      (at >= cutoff ? fresh : stale)[row.symbol.toUpperCase()] = row.quote;
    }
    return { fresh, stale };
  } catch (error) {
    disableTemporarily(error);
    return EMPTY;
  }
}

/**
 * Upsert freshly fetched quotes. A quote with no usable price (a delisted or
 * unknown symbol) is skipped rather than allowed to fail the whole batch on
 * the table's price > 0 check.
 */
export async function writeQuoteCache(
  quotes: Record<string, Quote>,
  source: Record<string, string>
): Promise<void> {
  if (!configured() || Date.now() < disabledUntil) return;
  const now = new Date().toISOString();
  const rows = Object.values(quotes)
    .filter((q) => Number.isFinite(q.price) && q.price > 0)
    .map((q) => ({
      symbol: q.symbol.toUpperCase(),
      provider: source[q.symbol.toUpperCase()] ?? "unknown",
      price: q.price,
      quote: q,
      fetched_at: now,
    }));
  if (rows.length === 0) return;
  try {
    const db = createAdminClient();
    const { error } = await db.from("market_quotes").upsert(rows, { onConflict: "symbol" });
    if (error) throw error;
  } catch (error) {
    disableTemporarily(error);
  }
}
