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

// Polls quotes for the given symbols every ~15s. Returns a symbol->Quote map.
export function useQuotes(symbols: string[]) {
  const key = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).sort();
  return useQuery({
    queryKey: ["quotes", key],
    queryFn: () => fetchQuotes(key),
    refetchInterval: 15_000,
    enabled: key.length > 0,
  });
}
