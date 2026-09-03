"use client";

import { useEffect, useRef, useState } from "react";
import type { ShowcaseRow } from "@/lib/showcase";
import { loadShowcase } from "./showcase-data";

// The whole crypto market as one picture: every coin a rectangle whose AREA is
// its share of the market's value, coloured by how it moved today. It answers
// in one glance what a list of prices cannot — how much of "crypto" is simply
// Bitcoin, and whether today was a market-wide move or one coin's news.

interface Tile extends ShowcaseRow {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Laid out in real pixels rather than a stretched viewBox: scaling a fixed
// viewBox to fit would squash every label with it.
const HEIGHT_MOBILE = 260;
const HEIGHT_DESKTOP = 300;

// Squarified treemap: fill the shorter side with a row of tiles, taking items
// while the worst aspect ratio in that row keeps improving. Plain slice-and-dice
// would give long slivers once Bitcoin takes half the canvas.
function squarify(items: ShowcaseRow[], x: number, y: number, w: number, h: number): Tile[] {
  const rows = items.filter((i) => (i.marketCap ?? 0) > 0);
  const total = rows.reduce((s, i) => s + (i.marketCap ?? 0), 0);
  if (!rows.length || total <= 0 || w <= 0 || h <= 0) return [];

  const out: Tile[] = [];
  const rest = [...rows].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  const scale = (w * h) / total;
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;

  while (rest.length && cw > 0.5 && ch > 0.5) {
    const vertical = cw >= ch; // stack this row down the left edge
    const side = vertical ? ch : cw;
    const row: ShowcaseRow[] = [];
    let sum = 0;
    let best = Infinity;

    while (rest.length) {
      const next = rest[0];
      const trial = sum + (next.marketCap ?? 0);
      const thickness = (trial * scale) / side;
      let worst = 0;
      for (const it of [...row, next]) {
        const len = thickness > 0 ? ((it.marketCap ?? 0) * scale) / thickness : 0;
        if (len > 0) worst = Math.max(worst, Math.max(thickness / len, len / thickness));
      }
      if (row.length === 0 || worst <= best) {
        row.push(rest.shift() as ShowcaseRow);
        sum = trial;
        best = worst;
      } else break;
    }

    const thickness = (sum * scale) / side;
    let pos = vertical ? cy : cx;
    for (const it of row) {
      const len = thickness > 0 ? ((it.marketCap ?? 0) * scale) / thickness : 0;
      out.push(
        vertical
          ? { ...it, x: cx, y: pos, w: thickness, h: len }
          : { ...it, x: pos, y: cy, w: len, h: thickness }
      );
      pos += len;
    }
    if (vertical) {
      cx += thickness;
      cw -= thickness;
    } else {
      cy += thickness;
      ch -= thickness;
    }
  }
  return out;
}

// Colour by the day's move. A dollar-pegged coin barely moves, so it lands
// near-grey on its own — which is the point of putting it on the map.
function fillFor(changePct: number): { fill: string; opacity: number } {
  if (Math.abs(changePct) < 0.15) return { fill: "var(--muted)", opacity: 0.22 };
  const magnitude = Math.min(1, Math.abs(changePct) / 6);
  return {
    fill: changePct > 0 ? "var(--positive)" : "var(--negative)",
    opacity: 0.2 + 0.6 * magnitude,
  };
}

const capLabel = (v: number | null) =>
  v == null ? "" : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;

export default function CryptoMap({ onSelect }: { onSelect: (symbol: string, name: string) => void }) {
  const [rows, setRows] = useState<ShowcaseRow[] | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true;
    loadShowcase("crypto").then((p) => live && setRows(p.map));
    return () => {
      live = false;
    };
  }, []);

  // Follow the container so the tiles keep their proportions on any width.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  const H = width && width < 640 ? HEIGHT_MOBILE : HEIGHT_DESKTOP;
  const W = width;

  if (rows && rows.length === 0) return null;
  const tiles = rows ? squarify(rows, 0, 0, W, H) : [];
  const total = rows?.reduce((s, r) => s + (r.marketCap ?? 0), 0) ?? 0;
  const biggest = tiles[0];

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">The crypto market today</h2>
          <p className="text-xs text-muted">
            Each block is one coin. Its size is that coin&rsquo;s share of the market&rsquo;s total value;
            its colour is today&rsquo;s move.
          </p>
        </div>
        {biggest && total > 0 && (
          <p className="text-xs text-muted">
            {biggest.symbol.replace("-USD", "")} alone is{" "}
            <span className="font-semibold text-foreground">
              {Math.round(((biggest.marketCap ?? 0) / total) * 100)}%
            </span>{" "}
            of it
          </p>
        )}
      </div>

      <div ref={boxRef} className="w-full">
      {!rows || W === 0 ? (
        <div className="h-[260px] w-full animate-pulse rounded-lg bg-background" />
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label="Crypto market by size and today's move"
        >
          {tiles.map((t) => {
            const { fill, opacity } = fillFor(t.changePct);
            const ticker = t.symbol.replace("-USD", "");
            // Only label a tile that can actually hold the text.
            const room = Math.min(t.w, t.h);
            const size = Math.max(11, Math.min(34, room * 0.28));
            const showTicker = t.w > 46 && t.h > 30;
            const showChange = t.w > 62 && t.h > 52;
            return (
              <g
                key={t.symbol}
                onClick={() => onSelect(t.symbol, t.name)}
                className="cursor-pointer"
                role="button"
                aria-label={`${ticker} ${t.changePct.toFixed(2)}%`}
              >
                <title>{`${ticker} · ${capLabel(t.marketCap)} · ${t.changePct >= 0 ? "+" : ""}${t.changePct.toFixed(2)}%`}</title>
                <rect x={t.x} y={t.y} width={t.w} height={t.h} fill={fill} fillOpacity={opacity} />
                <rect
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  fill="none"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                {showTicker && (
                  <text
                    x={t.x + t.w / 2}
                    y={t.y + t.h / 2 + (showChange ? -2 : size * 0.35)}
                    textAnchor="middle"
                    fontSize={size}
                    fontWeight={600}
                    fill="var(--foreground)"
                  >
                    {ticker}
                  </text>
                )}
                {showChange && (
                  <text
                    x={t.x + t.w / 2}
                    y={t.y + t.h / 2 + size * 0.95}
                    textAnchor="middle"
                    fontSize={size * 0.7}
                    fill="var(--foreground)"
                    fillOpacity={0.75}
                  >
                    {t.changePct >= 0 ? "+" : ""}
                    {t.changePct.toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      </div>
    </section>
  );
}
