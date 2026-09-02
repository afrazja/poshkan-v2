import "server-only";

import { createAdminClient } from "./supabase/admin";

const PROVIDER = "twelve";
const PAGE_SIZE = 1_000;
const MAX_CANDLES = 5_000;

export interface CachedCandle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandleCacheMeta {
  requestedSize: number;
  availableBars: number;
  lastOpenTime: string | null;
}

export interface CandleCacheHit {
  candles: CachedCandle[];
  fresh: boolean;
  meta: CandleCacheMeta;
}

let disabledUntil = 0;
let warned = false;

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function disableTemporarily(error: unknown) {
  disabledUntil = Date.now() + 5 * 60_000;
  if (!warned) {
    warned = true;
    // Supabase errors are plain objects, not Error instances - read .message
    // off either so the log names the real cause instead of "[object Object]".
    const message = (error as { message?: string } | null)?.message ?? String(error ?? "unknown error");
    console.warn(`[marketdata] persistent candle cache unavailable: ${message}`);
  }
}

export function candleCacheTtl(interval: string): number {
  return interval === "1day" || interval === "1week" ? 10 * 60_000 : 60_000;
}

export async function readCandleCache(
  symbol: string,
  timeframe: string,
  outputsize: number,
  ttlMs: number
): Promise<CandleCacheHit | null> {
  if (!configured() || Date.now() < disabledUntil) return null;

  try {
    const db = createAdminClient();
    const { data: sync, error: syncError } = await db
      .from("market_data_syncs")
      .select("requested_size,available_bars,last_open_time,synced_at")
      .eq("provider", PROVIDER)
      .eq("symbol", symbol.toUpperCase())
      .eq("timeframe", timeframe)
      .maybeSingle();
    if (syncError) throw syncError;
    if (!sync) return null;

    const target = Math.max(1, Math.min(Math.floor(outputsize), MAX_CANDLES));
    const rows: Array<Record<string, unknown>> = [];
    for (let from = 0; from < target; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE, target) - 1;
      const { data, error } = await db
        .from("market_candles")
        .select("open_time,open,high,low,close,volume")
        .eq("provider", PROVIDER)
        .eq("symbol", symbol.toUpperCase())
        .eq("timeframe", timeframe)
        .order("open_time", { ascending: false })
        .range(from, to);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < to - from + 1) break;
    }

    const dateOnly = timeframe === "1day" || timeframe === "1week";
    const candles = rows
      .map((row) => ({
        datetime: dateOnly
          ? String(row.open_time).slice(0, 10)
          : new Date(String(row.open_time)).toISOString(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        ...(row.volume != null ? { volume: Number(row.volume) } : {}),
      }))
      .filter((row) =>
        [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0)
      )
      .reverse();

    const requestedSize = Number(sync.requested_size) || 0;
    const availableBars = Number(sync.available_bars) || candles.length;
    const syncedAt = new Date(String(sync.synced_at)).getTime();
    const hasRequestedDepth = requestedSize >= target || availableBars < requestedSize;
    return {
      candles,
      fresh: candles.length > 0 && hasRequestedDepth && Date.now() - syncedAt < ttlMs,
      meta: {
        requestedSize,
        availableBars,
        lastOpenTime: sync.last_open_time ? String(sync.last_open_time) : null,
      },
    };
  } catch (error) {
    disableTemporarily(error);
    return null;
  }
}

function incrementalCandles(candles: CachedCandle[], previous?: CandleCacheMeta): CachedCandle[] {
  if (!previous?.lastOpenTime) return candles;
  const previousTime = new Date(previous.lastOpenTime).getTime();
  const firstChanged = candles.findIndex(
    (candle) => new Date(candle.datetime).getTime() >= previousTime
  );
  if (firstChanged < 0) return candles.slice(-3);
  return candles.slice(Math.max(0, firstChanged - 2));
}

export async function writeCandleCache(
  symbol: string,
  providerSymbol: string,
  timeframe: string,
  candles: CachedCandle[],
  requestedSize: number,
  previous?: CandleCacheMeta
): Promise<void> {
  if (!configured() || Date.now() < disabledUntil || candles.length === 0) return;

  try {
    const db = createAdminClient();
    const needsDeeperBackfill = !previous || requestedSize > previous.requestedSize;
    const changed = needsDeeperBackfill ? candles : incrementalCandles(candles, previous);

    for (let start = 0; start < changed.length; start += 500) {
      const rows = changed.slice(start, start + 500).map((candle) => ({
        provider: PROVIDER,
        symbol: symbol.toUpperCase(),
        provider_symbol: providerSymbol,
        timeframe,
        open_time: candle.datetime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? null,
        ingested_at: new Date().toISOString(),
      }));
      const { error } = await db
        .from("market_candles")
        .upsert(rows, { onConflict: "provider,symbol,timeframe,open_time" });
      if (error) throw error;
    }

    const effectiveRequested = Math.max(previous?.requestedSize ?? 0, requestedSize);
    const effectiveAvailable = Math.max(previous?.availableBars ?? 0, candles.length);
    const { error } = await db.from("market_data_syncs").upsert(
      {
        provider: PROVIDER,
        symbol: symbol.toUpperCase(),
        provider_symbol: providerSymbol,
        timeframe,
        requested_size: effectiveRequested,
        available_bars: effectiveAvailable,
        first_open_time: candles[0].datetime,
        last_open_time: candles[candles.length - 1].datetime,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "provider,symbol,timeframe" }
    );
    if (error) throw error;
  } catch (error) {
    disableTemporarily(error);
  }
}
