"use client";

import { useEffect, useState } from "react";
import type { Shelf, ShowcaseRow } from "@/lib/showcase";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";

// The answer to an empty account. Instead of a search bar and nothing else, six
// shelves of live, changing ideas — and every row says where that price sits in
// its own 12-month range, so a jumping stock cannot be mistaken for a bargain.
// Clicking a row opens the symbol panel, which lands on Before you buy.

// Two copies of this mount on every stock account — one for the desktop column,
// one for the phone's Ideas tab — and only ever one is visible. Share the fetch
// so the hidden twin costs nothing.
let shared: Promise<Shelf[]> | null = null;
const loadShelves = () => {
  if (!shared) {
    shared = fetch("/api/showcase")
      .then((r) => (r.ok ? r.json() : { shelves: [] }))
      .then((j) => (j.shelves ?? []) as Shelf[])
      .catch(() => [] as Shelf[]);
  }
  return shared;
};

export default function StockShowcase({ onSelect }: { onSelect: (symbol: string, name: string) => void }) {
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let live = true;
    loadShelves().then((s) => live && setShelves(s));
    return () => {
      live = false;
    };
  }, []);

  if (shelves && shelves.length === 0) return null;

  const shelf = shelves?.[Math.min(active, shelves.length - 1)];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Ideas to look at</h2>
      <p className="mt-0.5 text-xs text-muted">
        Live from the largest US companies. Nothing here is a recommendation.
      </p>

      {!shelves ? (
        <div className="mt-3 animate-pulse space-y-2">
          <div className="h-7 w-full rounded-lg bg-background" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 w-full rounded-lg bg-background" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1">
            {shelves.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  i === active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {shelf && (
            <>
              <p className="mt-2.5 text-xs leading-relaxed text-muted">{shelf.blurb}</p>
              <div className="mt-2 space-y-1.5">
                {shelf.rows.map((r) => (
                  <Row key={r.symbol} r={r} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Row({ r, onSelect }: { r: ShowcaseRow; onSelect: (symbol: string, name: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(r.symbol, r.name)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left transition hover:border-primary/50"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">{r.symbol}</span>
        <span className="shrink-0 text-sm tabular-nums">{formatCurrency(r.price)}</span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted">{r.name}</span>
        <span className={`shrink-0 text-xs font-medium tabular-nums ${changeColor(r.changePct)}`}>
          {formatPercent(r.changePct)}
        </span>
      </div>
      {r.note && <div className="mt-1 text-[11px] leading-snug text-muted">{r.note}</div>}
    </button>
  );
}
