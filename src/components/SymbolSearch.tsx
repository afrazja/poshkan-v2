"use client";

import { useEffect, useRef, useState } from "react";
import type { SymbolSearchResult } from "@/lib/types";

export default function SymbolSearch({
  onSelect,
  placeholder = "Search a stock by symbol or name…",
  value,
  size = "md",
  autoFocus = false,
}: {
  onSelect: (r: SymbolSearchResult) => void;
  placeholder?: string;
  value?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
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

  const lg = size === "lg";
  return (
    <div ref={ref} className="relative">
      <SearchIcon
        className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary ${lg ? "h-5 w-5" : "h-4 w-4"}`}
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full rounded-lg border border-border bg-input outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${
          lg ? "py-3.5 pl-11 pr-4 text-base" : "py-2.5 pl-9 pr-3 text-sm"
        }`}
      />
      {loading && (
        <span className={`absolute right-3 text-xs text-muted ${lg ? "top-4" : "top-3"}`}>…</span>
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l4 4" />
    </svg>
  );
}
