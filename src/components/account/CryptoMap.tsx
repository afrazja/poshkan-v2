"use client";

import { useEffect, useRef, useState } from "react";
import type { ShowcaseRow } from "@/lib/showcase";
import { formatCurrency, changeColor } from "@/lib/format";
import Modal from "@/components/Modal";
import { loadShowcase } from "./showcase-data";

// The whole crypto market as one picture: every coin a rectangle whose AREA is
// its share of the market's value, coloured by how it moved today. It answers
// in one glance what a list of prices cannot — how much of "crypto" is simply
// Bitcoin, and whether today was a market-wide move or one coin's news.
//
// A treemap always runs out of room: once Bitcoin takes two thirds, the small
// coins are too narrow for a label, let alone a price. So the inline map is the
// overview and opens a full-size one on click, where the tiles are big enough
// to carry a price — and beneath it every coin is listed in full, so nothing on
// the map is unreadable.

interface Tile extends ShowcaseRow {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  v == null
    ? "—"
    : v >= 1e12
      ? `$${(v / 1e12).toFixed(2)}T`
      : v >= 1e9
        ? `$${(v / 1e9).toFixed(1)}B`
        : `$${(v / 1e6).toFixed(0)}M`;

// Coin prices span $0.00002 to $80,000, so a fixed 2dp is useless at one end.
const coinPrice = (v: number) =>
  v >= 1000 ? formatCurrency(v) : v >= 1 ? `$${v.toFixed(2)}` : v >= 0.01 ? `$${v.toFixed(4)}` : `$${v.toPrecision(2)}`;

const ticker = (symbol: string) => symbol.replace("-USD", "");

function Treemap({
  rows,
  width,
  height,
  onTile,
}: {
  rows: ShowcaseRow[];
  width: number;
  height: number;
  onTile?: (r: ShowcaseRow) => void;
}) {
  const tiles = squarify(rows, 0, 0, width, height);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Crypto market by size and today's move">
      {tiles.map((t) => {
        const { fill, opacity } = fillFor(t.changePct);
        const room = Math.min(t.w, t.h);
        const size = Math.max(10, Math.min(30, room * 0.26));
        // Only draw what the tile can actually hold, longest line first.
        const showTicker = t.w > 42 && t.h > 26;
        const showChange = t.w > 58 && t.h > 46;
        const showPrice = t.w > 78 && t.h > 68;
        return (
          <g
            key={t.symbol}
            onClick={onTile ? () => onTile(t) : undefined}
            className={onTile ? "cursor-pointer" : undefined}
            role={onTile ? "button" : undefined}
            aria-label={`${ticker(t.symbol)} ${coinPrice(t.price)} ${t.changePct.toFixed(2)}%`}
          >
            <title>{`${ticker(t.symbol)} · ${coinPrice(t.price)} · ${t.changePct >= 0 ? "+" : ""}${t.changePct.toFixed(2)}% · ${capLabel(t.marketCap)}`}</title>
            <rect x={t.x} y={t.y} width={t.w} height={t.h} fill={fill} fillOpacity={opacity} />
            <rect x={t.x} y={t.y} width={t.w} height={t.h} fill="none" stroke="var(--card)" strokeWidth={2} />
            {showTicker && (
              <text
                x={t.x + t.w / 2}
                y={t.y + t.h / 2 - (showPrice ? size * 0.75 : showChange ? size * 0.1 : -size * 0.35)}
                textAnchor="middle"
                fontSize={size}
                fontWeight={600}
                fill="var(--foreground)"
              >
                {ticker(t.symbol)}
              </text>
            )}
            {showPrice && (
              <text
                x={t.x + t.w / 2}
                y={t.y + t.h / 2 + size * 0.35}
                textAnchor="middle"
                fontSize={size * 0.72}
                fill="var(--foreground)"
                fillOpacity={0.85}
              >
                {coinPrice(t.price)}
              </text>
            )}
            {showChange && (
              <text
                x={t.x + t.w / 2}
                y={t.y + t.h / 2 + (showPrice ? size * 1.4 : size * 1.05)}
                textAnchor="middle"
                fontSize={size * 0.68}
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
  );
}

export default function CryptoMap({ onSelect }: { onSelect: (symbol: string, name: string) => void }) {
  const [rows, setRows] = useState<ShowcaseRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const bigRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [bigWidth, setBigWidth] = useState(0);

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

  useEffect(() => {
    if (!open) return;
    const el = bigRef.current;
    if (!el) return;
    const measure = () => setBigWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, rows]);

  if (rows && rows.length === 0) return null;

  const H = width && width < 640 ? HEIGHT_MOBILE : HEIGHT_DESKTOP;
  const total = rows?.reduce((s, r) => s + (r.marketCap ?? 0), 0) ?? 0;
  const biggest = rows?.[0];
  const bigHeight = bigWidth ? Math.max(320, Math.min(560, Math.round(bigWidth * 0.5))) : 320;

  return (
    <>
      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">The crypto market today</h2>
            <p className="text-xs text-muted">
              Each block is one coin. Its size is that coin&rsquo;s share of the market&rsquo;s total value;
              its colour is today&rsquo;s move.
            </p>
          </div>
          <div className="flex items-baseline gap-3">
            {biggest && total > 0 && (
              <p className="text-xs text-muted">
                {ticker(biggest.symbol)} alone is{" "}
                <span className="font-semibold text-foreground">
                  {Math.round(((biggest.marketCap ?? 0) / total) * 100)}%
                </span>{" "}
                of it
              </p>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-background hover:text-foreground"
            >
              Expand ⤢
            </button>
          </div>
        </div>

        {/* The whole map opens the full view: the small tiles here are too
            narrow to carry a price, and too narrow to aim at. */}
        <div
          ref={boxRef}
          onClick={() => rows && setOpen(true)}
          className="w-full cursor-zoom-in"
          role="button"
          aria-label="Open the full crypto market map"
        >
          {!rows || width === 0 ? (
            <div className="h-[260px] w-full animate-pulse rounded-lg bg-background" />
          ) : (
            <Treemap rows={rows} width={width} height={H} />
          )}
        </div>
      </section>

      {open && rows && (
        <Modal title="The crypto market today" onClose={() => setOpen(false)} xl>
          <div ref={bigRef} className="w-full">
            {bigWidth > 0 && (
              <Treemap
                rows={rows}
                width={bigWidth}
                height={bigHeight}
                onTile={(r) => {
                  setOpen(false);
                  onSelect(r.symbol, r.name);
                }}
              />
            )}
          </div>

          {/* Every coin in full. A treemap always has tiles too small to label,
              so the map never has to be the only way to read a number. */}
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-muted">Every coin on the map</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-1.5 pr-2 font-medium">Coin</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Price</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Today</th>
                    <th className="py-1.5 text-right font-medium">Market value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.symbol} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onSelect(r.symbol, r.name);
                          }}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {ticker(r.symbol)}
                        </button>{" "}
                        <span className="text-xs text-muted">{r.name.replace(" USD", "")}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{coinPrice(r.price)}</td>
                      <td className={`py-1.5 pr-2 text-right tabular-nums ${changeColor(r.changePct)}`}>
                        {r.changePct >= 0 ? "+" : ""}
                        {r.changePct.toFixed(2)}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted">{capLabel(r.marketCap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
