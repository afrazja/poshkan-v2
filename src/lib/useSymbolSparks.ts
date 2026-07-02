"use client";

import { useEffect, useState } from "react";

// Fetches 7-day close series for a set of symbols (one batched request) for
// row sparklines. Keyed on the sorted symbol list so re-renders don't refetch.
export function useSymbolSparks(symbols: string[]): Record<string, number[]> {
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const key = Array.from(new Set(symbols.map((s) => s.toUpperCase())))
    .sort()
    .join(",");

  useEffect(() => {
    if (!key) return;
    let active = true;
    fetch(`/api/sparks?symbols=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((j) => active && setSparks(j.sparks ?? {}))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);

  return sparks;
}
