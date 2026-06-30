"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { clampTradeLeverage } from "@/lib/forex";
import { backtestOte, type OteBtResult } from "@/lib/ote-backtest";
import { OTE_DEFAULTS, evaluateOteSymbol, type OteParams } from "@/lib/ote";

export interface OteSettings {
  account_id: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  risk_pct: number;
  max_position_pct: number;
  min_rr: number;
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
  auto_close_hours: number;
  leverage: number;
  last_run_at: string | null;
  last_status: OteStatusItem[] | null;
}

export interface OteStatusItem {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price: number | null;
  status: string;
  reason: string;
  checks: { zone: boolean; sweep: boolean; confirm: boolean };
}

export interface OteSignal {
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

function paramsFrom(minRr?: number): OteParams {
  return { ...OTE_DEFAULTS, minRR: Math.min(6, Math.max(1.5, Number(minRr) || OTE_DEFAULTS.minRR)) };
}

// Backtest the OTE strategy on the chosen symbols over the available history.
export async function backtestOteAction(input: {
  accountId: string;
  symbols: string[];
  minRr?: number;
}): Promise<{ result?: OteBtResult; error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not authorized" };
  const symbols = Array.from(
    new Set((input.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))
  )
    .filter((s) => assetTypeError(g.type, s) === null)
    .slice(0, 8);
  if (symbols.length === 0) return { error: "Pick at least one valid symbol to backtest." };
  try {
    const result = await backtestOte(symbols, paramsFrom(input.minRr));
    return { result };
  } catch (e) {
    return { error: `Backtest failed: ${(e as Error).message}` };
  }
}

// Manually refresh the live read for this account (no cron / no CRON_SECRET).
// Read-only on positions — it never auto-trades; that stays with the cron.
export async function refreshOteRead(
  accountId: string
): Promise<{ error?: string; status?: OteStatusItem[] }> {
  const g = await guard(accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const { data: row } = await supabase
    .from("ote_settings")
    .select("symbols, min_rr")
    .eq("account_id", accountId)
    .maybeSingle();

  const chosen = (row?.symbols?.length ? row.symbols : marketUniverse(type)) as string[];
  const watch = chosen.filter((s) => assetTypeError(type, s) === null).slice(0, 8);
  if (watch.length === 0) return { error: "No valid symbols to scan." };

  const params = paramsFrom(row?.min_rr);
  try {
    const evals = await Promise.all(watch.map((s) => evaluateOteSymbol(s, params)));
    const status: OteStatusItem[] = evals.map((e) => ({
      symbol: e.symbol,
      trend: e.trend,
      price: e.price,
      status: e.status,
      reason: e.reason,
      checks: e.checks,
    }));
    await supabase
      .from("ote_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: status })
      .eq("account_id", accountId);
    revalidatePath(`/dashboard/${accountId}`);
    return { status };
  } catch (e) {
    return { error: `Scan failed: ${(e as Error).message}` };
  }
}

export async function getOteData(
  accountId: string
): Promise<{ settings: OteSettings | null; signals: OteSignal[] } | null> {
  const g = await guard(accountId);
  if (!g) return null;
  const { supabase } = g;
  try {
    const [{ data: settings }, { data: signals }] = await Promise.all([
      supabase.from("ote_settings").select("*").eq("account_id", accountId).maybeSingle(),
      supabase
        .from("ote_signals")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      settings: (settings as OteSettings | null) ?? null,
      signals: (signals as OteSignal[] | null) ?? [],
    };
  } catch {
    return { settings: null, signals: [] };
  }
}

export interface SaveOteInput {
  accountId: string;
  enabled: boolean;
  mode: "alert" | "auto";
  symbols: string[];
  riskPct: number;
  maxPositionPct: number;
  minRr: number;
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number;
  autoCloseHours: number;
  leverage: number;
}

export async function saveOteSettings(input: SaveOteInput): Promise<{ error?: string }> {
  const g = await guard(input.accountId);
  if (!g) return { error: "Not allowed." };
  const { supabase, type } = g;

  const symbols = Array.from(
    new Set(input.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  ).filter((s) => assetTypeError(type, s) === null);
  if (symbols.length === 0) return { error: "Pick at least one symbol." };

  const { error } = await supabase.from("ote_settings").upsert(
    {
      account_id: input.accountId,
      enabled: input.enabled,
      mode: input.mode,
      symbols,
      risk_pct: Math.min(0.03, Math.max(0.005, input.riskPct)),
      max_position_pct: Math.min(1, Math.max(0.05, input.maxPositionPct)),
      min_rr: Math.min(6, Math.max(1.5, input.minRr)),
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
