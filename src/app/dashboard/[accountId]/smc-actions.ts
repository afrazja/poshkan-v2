"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { backtestSmc, type BtResult } from "@/lib/smc-backtest";
import { DEFAULT_PARAMS, type SmcParams } from "@/lib/smc";

export interface SmcSettings {
  account_id: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  risk_pct: number;
  tp_rr: number;
  sl_mode: "swing" | "fvg";
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
  last_run_at: string | null;
  last_status: SmcStatusItem[] | null;
}

export interface SmcStatusItem {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price: number | null;
  status: string;
  reason: string;
  checks: { retest: boolean; sweep: boolean; confirm: boolean };
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
  tpRR: number;
  slMode: "swing" | "fvg";
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number;
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
      tp_rr: Math.min(4, Math.max(1, input.tpRR)),
      sl_mode: input.slMode,
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
