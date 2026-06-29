"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { backtestCandleRange, type CandleRangeBtResult } from "@/lib/candlerange-backtest";
import { CANDLERANGE_DEFAULTS, evaluateCandleRangeSymbol, type CandleRangeParams } from "@/lib/candlerange";

export interface CandleRangeSettings {
  account_id: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  risk_pct: number;
  range_period: number;
  edge_zone: number;
  sl_atr_mult: number;
  confirm_candle: boolean;
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
  last_run_at: string | null;
  last_status: CandleRangeStatusItem[] | null;
}

export interface CandleRangeStatusItem {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price: number | null;
  status: string;
  reason: string;
  checks: { range: boolean; confirm: boolean };
}

export interface CandleRangeSignal {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number | null;
  stop: number | null;
  take_profit: number | null;
  rr: number | null;
  reason: string | null;
  executed: boolean;
  created_at: string;
}

async function guard(accountId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase.from("accounts").select("id, type").eq("id", accountId).single();
  if (!account) return null;
  return { supabase, type: (account.type as string) ?? "" };
}

function paramsFrom(
  rangePeriod?: number,
  edgeZone?: number,
  slAtrMult?: number,
  confirmCandle?: boolean
): CandleRangeParams {
  return {
    ...CANDLERANGE_DEFAULTS,
    rangePeriod: Math.min(100, Math.max(8, Math.round(Number(rangePeriod) || CANDLERANGE_DEFAULTS.rangePeriod))),
    edgeZone: Math.min(0.45, Math.max(0.1, Number(edgeZone) || CANDLERANGE_DEFAULTS.edgeZone)),
    slAtrMult: Math.min(3, Math.max(0.1, Number(slAtrMult) || CANDLERANGE_DEFAULTS.slAtrMult)),
    confirmCandle: confirmCandle ?? CANDLERANGE_DEFAULTS.confirmCandle,
  };
}

export async function backtestCandleRangeAction(input: {
  accountId: string;
  symbols: string[];
  rangePeriod?: number;
  edgeZone?: number;
  slAtrMult?: number;
  confirmCandle?: boolean;
}): Promise<{ result?: CandleRangeBtResult; error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not authorized" };
  const symbols = Array.from(new Set((input.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean)))
    .filter((s) => assetTypeError(g.type, s) === null)
    .slice(0, 8);
  if (symbols.length === 0) return { error: "Pick at least one valid symbol to backtest." };
  try {
    const result = await backtestCandleRange(
      symbols,
      paramsFrom(input.rangePeriod, input.edgeZone, input.slAtrMult, input.confirmCandle)
    );
    return { result };
  } catch (e) {
    return { error: `Backtest failed: ${(e as Error).message}` };
  }
}

export async function refreshCandleRangeRead(
  accountId: string
): Promise<{ error?: string; status?: CandleRangeStatusItem[] }> {
  const g = await guard(accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const { data: row } = await supabase
    .from("candlerange_settings")
    .select("symbols, range_period, edge_zone, sl_atr_mult, confirm_candle")
    .eq("account_id", accountId)
    .maybeSingle();

  const chosen = (row?.symbols?.length ? row.symbols : marketUniverse(type)) as string[];
  const watch = chosen.filter((s) => assetTypeError(type, s) === null).slice(0, 8);
  if (watch.length === 0) return { error: "No valid symbols to scan." };

  const params = paramsFrom(row?.range_period, row?.edge_zone, row?.sl_atr_mult, row?.confirm_candle);
  try {
    const evals = await Promise.all(watch.map((s) => evaluateCandleRangeSymbol(s, params)));
    const status: CandleRangeStatusItem[] = evals.map((e) => ({
      symbol: e.symbol,
      trend: e.trend,
      price: e.price,
      status: e.status,
      reason: e.reason,
      checks: e.checks,
    }));
    await supabase
      .from("candlerange_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: status })
      .eq("account_id", accountId);
    revalidatePath(`/dashboard/${accountId}`);
    return { status };
  } catch (e) {
    return { error: `Scan failed: ${(e as Error).message}` };
  }
}

export async function getCandleRangeData(
  accountId: string
): Promise<{ settings: CandleRangeSettings | null; signals: CandleRangeSignal[] } | null> {
  const g = await guard(accountId);
  if (!g) return null;
  const { supabase } = g;
  try {
    const [{ data: settings }, { data: signals }] = await Promise.all([
      supabase.from("candlerange_settings").select("*").eq("account_id", accountId).maybeSingle(),
      supabase
        .from("candlerange_signals")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      settings: (settings as CandleRangeSettings | null) ?? null,
      signals: (signals as CandleRangeSignal[] | null) ?? [],
    };
  } catch {
    return { settings: null, signals: [] };
  }
}

export interface SaveCandleRangeInput {
  accountId: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  riskPct: number;
  rangePeriod: number;
  edgeZone: number;
  slAtrMult: number;
  confirmCandle: boolean;
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number;
}

export async function saveCandleRangeSettings(input: SaveCandleRangeInput): Promise<{ error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const symbols = Array.from(new Set(input.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))).filter(
    (s) => assetTypeError(type, s) === null
  );
  if (symbols.length === 0) return { error: "Pick at least one symbol." };

  const { error } = await supabase.from("candlerange_settings").upsert(
    {
      account_id: input.accountId,
      enabled: input.enabled,
      mode: input.mode,
      symbols,
      risk_pct: Math.min(0.03, Math.max(0.005, input.riskPct)),
      range_period: Math.min(100, Math.max(8, Math.round(input.rangePeriod))),
      edge_zone: Math.min(0.45, Math.max(0.1, input.edgeZone)),
      sl_atr_mult: Math.min(3, Math.max(0.1, input.slAtrMult)),
      confirm_candle: !!input.confirmCandle,
      max_open: Math.min(5, Math.max(1, Math.round(input.maxOpen))),
      max_per_day: Math.min(20, Math.max(1, Math.round(input.maxPerDay))),
      daily_loss_pct: Math.min(0.2, Math.max(0.01, input.dailyLossPct)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" }
  );
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}
