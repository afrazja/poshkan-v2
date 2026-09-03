"use client";

import type { Shelf, ShowcaseRow, ShowcaseType } from "@/lib/showcase";

// Up to three components can want this at once on a crypto account — the
// treemap above the summary, the desktop column's shelves, and the phone's
// Ideas tab — and only some are ever visible. One promise per asset type means
// they share a single request no matter how many mount.
export interface ShowcasePayload {
  shelves: Shelf[];
  map: ShowcaseRow[];
}

const shared = new Map<ShowcaseType, Promise<ShowcasePayload>>();

export function loadShowcase(type: ShowcaseType): Promise<ShowcasePayload> {
  let p = shared.get(type);
  if (!p) {
    p = fetch(`/api/showcase?type=${type}`)
      .then((r) => (r.ok ? r.json() : { shelves: [], map: [] }))
      .then((j) => ({ shelves: j.shelves ?? [], map: j.map ?? [] }) as ShowcasePayload)
      .catch(() => ({ shelves: [], map: [] }) as ShowcasePayload);
    shared.set(type, p);
  }
  return p;
}
