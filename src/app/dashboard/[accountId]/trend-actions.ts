"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { backtestTrend, type TrendBtResult } from "@/lib/trend-backtest";
import { TREND_DEFAULTS, evaluateTrendSymbol, type TrendParams } from "@/lib/trend";

export interface TrendSettings {
  account_id: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  risk_pct: number;
  donchian_n: number;
  tp_rr: number;
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
  last_run_at: string | null;
  last_status: TrendStatusItem[] | null;
}

export interface TrendStatusItem {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price: number | null;
  status: string;
  reason: string;
  checks: { trend: boolean; breakout: boolean };
}

export interface TrendSignal {
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

function paramsFrom(donchianN?: number, tpRR?: number): TrendParams {
  return {
    ...TREND_DEFAULTS,
    donchianN: Math.min(100, Math.max(5, Math.round(Number(donchianN) || TREND_DEFAULTS.donchianN))),
    tpRR: Math.min(8, Math.max(1, Number(tpRR) || TREND_DEFAULTS.tpRR)),
  };
}

export async function backtestTrendAction(input: {
  accountId: string;
  symbols: string[];
  donchianN?: number;
  tpRR?: number;
}): Promise<{ result?: TrendBtResult; error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not authorized" };
  const symbols = Array.from(
    new Set((input.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))
  )
    .filter((s) => assetTypeError(g.type, s) === null)
    .slice(0, 8);
  if (symbols.length === 0) return { error: "Pick at least one valid symbol to backtest." };
  try {
    const result = await backtestTrend(symbols, paramsFrom(input.donchianN, input.tpRR));
    return { result };
  } catch (e) {
    return { error: `Backtest failed: ${(e as Error).message}` };
  }
}

export async function refreshTrendRead(
  accountId: string
): Promise<{ error?: string; status?: TrendStatusItem[] }> {
  const g = await guard(accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const { data: row } = await supabase
    .from("trend_settings")
    .select("symbols, donchian_n, tp_rr")
    .eq("account_id", accountId)
    .maybeSingle();

  const chosen = (row?.symbols?.length ? row.symbols : marketUniverse(type)) as string[];
  const watch = chosen.filter((s) => assetTypeError(type, s) === null).slice(0, 8);
  if (watch.length === 0) return { error: "No valid symbols to scan." };

  const params = paramsFrom(row?.donchian_n, row?.tp_rr);
  try {
    const evals = await Promise.all(watch.map((s) => evaluateTrendSymbol(s, params)));
    const status: TrendStatusItem[] = evals.map((e) => ({
      symbol: e.symbol,
      trend: e.trend,
      price: e.price,
      status: e.status,
      reason: e.reason,
      checks: e.checks,
    }));
    await supabase
      .from("trend_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: status })
      .eq("account_id", accountId);
    revalidatePath(`/dashboard/${accountId}`);
    return { status };
  } catch (e) {
    return { error: `Scan failed: ${(e as Error).message}` };
  }
}

export async function getTrendData(
  accountId: string
): Promise<{ settings: TrendSettings | null; signals: TrendSignal[] } | null> {
  const g = await guard(accountId);
  if (!g) return null;
  const { supabase } = g;
  try {
    const [{ data: settings }, { data: signals }] = await Promise.all([
      supabase.from("trend_settings").select("*").eq("account_id", accountId).maybeSingle(),
      supabase
        .from("trend_signals")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      settings: (settings as TrendSettings | null) ?? null,
      signals: (signals as TrendSignal[] | null) ?? [],
    };
  } catch {
    return { settings: null, signals: [] };
  }
}

export interface SaveTrendInput {
  accountId: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  riskPct: number;
  donchianN: number;
  tpRR: number;
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number;
}

export async function saveTrendSettings(input: SaveTrendInput): Promise<{ error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const symbols = Array.from(
    new Set(input.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  ).filter((s) => assetTypeError(type, s) === null);
  if (symbols.length === 0) return { error: "Pick at least one symbol." };

  const { error } = await supabase.from("trend_settings").upsert(
    {
      account_id: input.accountId,
      enabled: input.enabled,
      mode: input.mode,
      symbols,
      risk_pct: Math.min(0.03, Math.max(0.005, input.riskPct)),
      donchian_n: Math.min(100, Math.max(5, Math.round(input.donchianN))),
      tp_rr: Math.min(8, Math.max(1, input.tpRR)),
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
