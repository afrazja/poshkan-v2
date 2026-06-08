"use client";

import { useEffect, useRef, useState } from "react";
import type { SymbolSearchResult } from "@/lib/types";

export default function SymbolSearch({
  onSelect,
  placeholder = "Search symbol or company…",
  value,
}: {
  onSelect: (r: SymbolSearchResult) => void;
  placeholder?: string;
  value?: string;
}) {
  const [query, setQuery] = useState(value ?? "");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {loading && (
        <span className="absolute right-3 top-3 text-xs text-muted">…</span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
          {results.map((r) => (
            <button
              key={`${r.symbol}-${r.exchange}`}
              onClick={() => {
                onSelect(r);
                setQuery(r.symbol);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-background"
            >
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{r.symbol}</span>
                <span className="truncate text-xs text-muted">{r.name}</span>
              </span>
              <span className="text-xs text-muted">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
