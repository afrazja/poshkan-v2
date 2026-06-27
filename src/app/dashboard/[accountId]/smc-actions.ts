"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

// Confirm the caller is signed in and owns this crypto account (RLS returns only
// the owner's account). Returns the authenticated supabase client, or null.
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
  if (!account || account.type !== "crypto") return null;
  return supabase;
}

export async function getSmcData(
  accountId: string
): Promise<{ settings: SmcSettings | null; signals: SmcSignal[] } | null> {
  const supabase = await guard(accountId);
  if (!supabase) return null;
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
  const supabase = await guard(input.accountId);
  if (!supabase) return { error: "Not allowed." };

  const allowed = ["BTC-USD", "ETH-USD", "SOL-USD"];
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
