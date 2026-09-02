import type { Quote } from "./types";

export interface Freshness {
  /** ISO time of the OLDEST quote in the set — everything shown is at least this fresh. */
  asOf: string | null;
  /** True if any quote is being served past its TTL because the provider failed. */
  stale: boolean;
}

// Plain module (no client/server directive) so both the server-rendered
// dashboard and the client-polled account page can summarise a quote set.
export function summarizeFreshness(quotes: Record<string, Quote> | Quote[]): Freshness {
  const list = Array.isArray(quotes) ? quotes : Object.values(quotes);
  let oldest: number | null = null;
  let stale = false;
  for (const q of list) {
    if (q.stale) stale = true;
    if (!q.asOf) continue;
    const t = Date.parse(q.asOf);
    if (Number.isFinite(t) && (oldest == null || t < oldest)) oldest = t;
  }
  return { asOf: oldest == null ? null : new Date(oldest).toISOString(), stale };
}
