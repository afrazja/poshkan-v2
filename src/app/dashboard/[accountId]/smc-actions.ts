"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { clampTradeLeverage } from "@/lib/forex";
import { backtestSmc, type BtResult } from "@/lib/smc-backtest";
import { DEFAULT_PARAMS, evaluateSymbol, type SmcParams } from "@/lib/smc";

export interface SmcSettings {
  account_id: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  risk_pct: number;
  max_position_pct: number;
  tp_rr: number;
  sl_mode: "swing" | "fvg";
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
  auto_close_hours: number;
  leverage: number;
  last_run_at: string | null;
  last_status: SmcStatusItem[] | null;
}

export interface SmcStatusItem {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price: number | null;
  status: string;
  reason: string;
  checks: { retest: boolean; confirm: boolean };
}

export interface SmcSignal {
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

// Confirm the caller is signed in and owns this account (RLS returns only the
// owner's account). Returns the authenticated client + the account's market type.
async function guard(accountId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("id", accountId)
    .single();
  if (!account) return null;
  return { supabase, type: (account.type as string) ?? "" };
}

// Backtest the SMC strategy on the chosen symbols over the available history.
export async function backtestSmcAction(input: {
  accountId: string;
  symbols: string[];
  tpRR?: number;
  slMode?: "swing" | "fvg";
}): Promise<{ result?: BtResult; error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not authorized" };
  const symbols = Array.from(
    new Set((input.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))
  )
    .filter((s) => assetTypeError(g.type, s) === null)
    .slice(0, 8);
  if (symbols.length === 0) return { error: "Pick at least one valid symbol to backtest." };
  try {
    const params: SmcParams = {
      ...DEFAULT_PARAMS,
      tpRR: Number(input.tpRR) || DEFAULT_PARAMS.tpRR,
      slMode: input.slMode === "fvg" ? "fvg" : "swing",
    };
    const result = await backtestSmc(symbols, params);
    return { result };
  } catch (e) {
    return { error: `Backtest failed: ${(e as Error).message}` };
  }
}

// Manually refresh the live read for this account (no cron / no CRON_SECRET).
// Evaluates the account's symbols now and persists last_status + last_run_at.
// Read-only on positions — it never auto-trades; that stays with the cron.
export async function refreshSmcRead(
  accountId: string
): Promise<{ error?: string; status?: SmcStatusItem[] }> {
  const g = await guard(accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const { data: row } = await supabase
    .from("smc_settings")
    .select("symbols, tp_rr, sl_mode")
    .eq("account_id", accountId)
    .maybeSingle();

  const chosen = (row?.symbols?.length ? row.symbols : marketUniverse(type)) as string[];
  const watch = chosen.filter((s) => assetTypeError(type, s) === null).slice(0, 8);
  if (watch.length === 0) return { error: "No valid symbols to scan." };

  const params: SmcParams = {
    ...DEFAULT_PARAMS,
    slMode: row?.sl_mode === "fvg" ? "fvg" : "swing",
    tpRR: Number(row?.tp_rr) || DEFAULT_PARAMS.tpRR,
  };

  try {
    const evals = await Promise.all(watch.map((s) => evaluateSymbol(s, params)));
    const status: SmcStatusItem[] = evals.map((e) => ({
      symbol: e.symbol,
      trend: e.trend,
      price: e.price,
      status: e.status,
      reason: e.reason,
      checks: e.checks,
    }));
    await supabase
      .from("smc_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: status })
      .eq("account_id", accountId);
    revalidatePath(`/dashboard/${accountId}`);
    return { status };
  } catch (e) {
    return { error: `Scan failed: ${(e as Error).message}` };
  }
}

export async function getSmcData(
  accountId: string
): Promise<{ settings: SmcSettings | null; signals: SmcSignal[] } | null> {
  const g = await guard(accountId);
  if (!g) return null;
  const { supabase } = g;
  try {
    const [{ data: settings }, { data: signals }] = await Promise.all([
      supabase.from("smc_settings").select("*").eq("account_id", accountId).maybeSingle(),
      supabase
        .from("smc_signals")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      settings: (settings as SmcSettings | null) ?? null,
      signals: (signals as SmcSignal[] | null) ?? [],
    };
  } catch {
    // Migration not run yet → behave as "no data" rather than crashing.
    return { settings: null, signals: [] };
  }
}

export interface SaveSmcInput {
  accountId: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  riskPct: number;
  maxPositionPct: number;
  tpRR: number;
  slMode: "swing" | "fvg";
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number;
  autoCloseHours: number;
  leverage: number;
}

export async function saveSmcSettings(input: SaveSmcInput): Promise<{ error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const allowed = marketUniverse(type);
  const symbols = input.symbols.filter((s) => allowed.includes(s));
  if (symbols.length === 0) return { error: "Pick at least one symbol." };

  const { error } = await supabase.from("smc_settings").upsert(
    {
      account_id: input.accountId,
      enabled: input.enabled,
      mode: input.mode,
      symbols,
      risk_pct: Math.min(0.03, Math.max(0.005, input.riskPct)),
      max_position_pct: Math.min(1, Math.max(0.05, input.maxPositionPct)),
      tp_rr: Math.min(4, Math.max(1, input.tpRR)),
      sl_mode: input.slMode,
      max_open: Math.min(5, Math.max(1, Math.round(input.maxOpen))),
      max_per_day: Math.min(20, Math.max(1, Math.round(input.maxPerDay))),
      daily_loss_pct: Math.min(0.2, Math.max(0.01, input.dailyLossPct)),
      auto_close_hours: Math.max(0, Math.round(input.autoCloseHours || 0)),
      leverage: clampTradeLeverage(input.leverage),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" }
  );
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/${input.accountId}`);
  return {};
}
