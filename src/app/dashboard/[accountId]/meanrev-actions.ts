"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { backtestMeanRev, type MeanRevBtResult } from "@/lib/meanrev-backtest";
import { MEANREV_DEFAULTS, evaluateMeanRevSymbol, type MeanRevParams } from "@/lib/meanrev";

export interface MeanRevSettings {
  account_id: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  risk_pct: number;
  bb_period: number;
  bb_k: number;
  trend_ma: number;
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
  last_run_at: string | null;
  last_status: MeanRevStatusItem[] | null;
}

export interface MeanRevStatusItem {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price: number | null;
  status: string;
  reason: string;
  checks: { band: boolean; trend: boolean };
}

export interface MeanRevSignal {
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

function paramsFrom(bbPeriod?: number, bbK?: number, trendMa?: number): MeanRevParams {
  return {
    ...MEANREV_DEFAULTS,
    bbPeriod: Math.min(100, Math.max(5, Math.round(Number(bbPeriod) || MEANREV_DEFAULTS.bbPeriod))),
    bbK: Math.min(4, Math.max(1, Number(bbK) || MEANREV_DEFAULTS.bbK)),
    trendMa: Math.min(400, Math.max(0, Math.round(Number(trendMa) ?? MEANREV_DEFAULTS.trendMa))),
  };
}

export async function backtestMeanRevAction(input: {
  accountId: string;
  symbols: string[];
  bbPeriod?: number;
  bbK?: number;
  trendMa?: number;
}): Promise<{ result?: MeanRevBtResult; error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not authorized" };
  const symbols = Array.from(
    new Set((input.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))
  )
    .filter((s) => assetTypeError(g.type, s) === null)
    .slice(0, 8);
  if (symbols.length === 0) return { error: "Pick at least one valid symbol to backtest." };
  try {
    const result = await backtestMeanRev(symbols, paramsFrom(input.bbPeriod, input.bbK, input.trendMa));
    return { result };
  } catch (e) {
    return { error: `Backtest failed: ${(e as Error).message}` };
  }
}

export async function refreshMeanRevRead(
  accountId: string
): Promise<{ error?: string; status?: MeanRevStatusItem[] }> {
  const g = await guard(accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const { data: row } = await supabase
    .from("meanrev_settings")
    .select("symbols, bb_period, bb_k, trend_ma")
    .eq("account_id", accountId)
    .maybeSingle();

  const chosen = (row?.symbols?.length ? row.symbols : marketUniverse(type)) as string[];
  const watch = chosen.filter((s) => assetTypeError(type, s) === null).slice(0, 8);
  if (watch.length === 0) return { error: "No valid symbols to scan." };

  const params = paramsFrom(row?.bb_period, row?.bb_k, row?.trend_ma);
  try {
    const evals = await Promise.all(watch.map((s) => evaluateMeanRevSymbol(s, params)));
    const status: MeanRevStatusItem[] = evals.map((e) => ({
      symbol: e.symbol,
      trend: e.trend,
      price: e.price,
      status: e.status,
      reason: e.reason,
      checks: e.checks,
    }));
    await supabase
      .from("meanrev_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: status })
      .eq("account_id", accountId);
    revalidatePath(`/dashboard/${accountId}`);
    return { status };
  } catch (e) {
    return { error: `Scan failed: ${(e as Error).message}` };
  }
}

export async function getMeanRevData(
  accountId: string
): Promise<{ settings: MeanRevSettings | null; signals: MeanRevSignal[] } | null> {
  const g = await guard(accountId);
  if (!g) return null;
  const { supabase } = g;
  try {
    const [{ data: settings }, { data: signals }] = await Promise.all([
      supabase.from("meanrev_settings").select("*").eq("account_id", accountId).maybeSingle(),
      supabase
        .from("meanrev_signals")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      settings: (settings as MeanRevSettings | null) ?? null,
      signals: (signals as MeanRevSignal[] | null) ?? [],
    };
  } catch {
    return { settings: null, signals: [] };
  }
}

export interface SaveMeanRevInput {
  accountId: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  riskPct: number;
  bbPeriod: number;
  bbK: number;
  trendMa: number;
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number;
}

export async function saveMeanRevSettings(input: SaveMeanRevInput): Promise<{ error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const symbols = Array.from(
    new Set(input.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  ).filter((s) => assetTypeError(type, s) === null);
  if (symbols.length === 0) return { error: "Pick at least one symbol." };

  const { error } = await supabase.from("meanrev_settings").upsert(
    {
      account_id: input.accountId,
      enabled: input.enabled,
      mode: input.mode,
      symbols,
      risk_pct: Math.min(0.03, Math.max(0.005, input.riskPct)),
      bb_period: Math.min(100, Math.max(5, Math.round(input.bbPeriod))),
      bb_k: Math.min(4, Math.max(1, input.bbK)),
      trend_ma: Math.min(400, Math.max(0, Math.round(input.trendMa))),
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
