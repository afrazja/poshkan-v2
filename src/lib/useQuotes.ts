"use client";

import { useQuery } from "@tanstack/react-query";
import type { Quote } from "./types";

async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!res.ok) throw new Error("Failed to load quotes");
  const json = await res.json();
  return json.quotes ?? {};
}

// Polls quotes for the given symbols every 20s while the tab is focused.
// Cheap now: the server answers from the shared market_quotes table and only
// asks the provider for rows older than 15s, so ten viewers of the same
// symbols cost one fetch, not ten. Still paused in the background — nobody
// looking, nothing fetched.
export function useQuotes(symbols: string[]) {
  const key = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).sort();
  return useQuery({
    queryKey: ["quotes", key],
    queryFn: () => fetchQuotes(key),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false, // stop polling when the tab isn't focused
    staleTime: 15_000,
    enabled: key.length > 0,
  });
}
