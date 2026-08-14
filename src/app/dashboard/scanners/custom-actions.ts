"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assetTypeError } from "@/lib/assets";
import { backtestCustomStrategy } from "@/lib/custom-strategy-backtest";
import {
  customStrategyFromDb,
  customStrategyInputSchema,
  type CustomBacktestResult,
  type CustomStrategyInput,
  type CustomStrategyRow,
} from "@/lib/custom-strategy-types";

async function ownedStrategy(id: string): Promise<{
  strategy?: CustomStrategyRow;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized" };

  const { data, error } = await supabase
    .from("custom_strategies")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !data) return { error: error?.message ?? "Strategy not found" };
  return { strategy: customStrategyFromDb(data as Record<string, unknown>) };
}

export async function saveCustomStrategy(
  rawInput: CustomStrategyInput,
  strategyId?: string
): Promise<{ id?: string; error?: string }> {
  const parsed = customStrategyInputSchema.safeParse(rawInput);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid strategy" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized" };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("id", parsed.data.accountId)
    .eq("user_id", user.id)
    .single();
  if (!account) return { error: "Account not found" };

  const symbols = Array.from(new Set(parsed.data.symbols.map((symbol) => symbol.trim().toUpperCase())))
    .filter((symbol) => assetTypeError(account.type as string, symbol) === null)
    .slice(0, 5);
  if (symbols.length !== parsed.data.symbols.length) {
    return { error: "One or more symbols do not belong to the selected account market." };
  }

  const payload = {
    user_id: user.id,
    account_id: parsed.data.accountId,
    name: parsed.data.name,
    description: parsed.data.description,
    timeframe: parsed.data.timeframe,
    symbols,
    direction: parsed.data.direction,
    match_mode: parsed.data.matchMode,
    rules: parsed.data.rules,
    stop_atr: parsed.data.stopAtr,
    take_profit_rr: parsed.data.takeProfitRr,
    max_hold_bars: parsed.data.maxHoldBars,
    status: "draft",
    last_backtest: null,
    last_backtested_at: null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (strategyId) {
      const existing = await ownedStrategy(strategyId);
      if (!existing.strategy) return { error: existing.error ?? "Strategy not found" };
      const { error } = await supabase
        .from("custom_strategies")
        .update({ ...payload, version: existing.strategy.version + 1 })
        .eq("id", strategyId)
        .eq("user_id", user.id);
      if (error) return { error: error.message };
      revalidatePath("/dashboard/scanners");
      revalidatePath(`/dashboard/scanners/${strategyId}`);
      return { id: strategyId };
    }

    const { data, error } = await supabase
      .from("custom_strategies")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Could not save strategy" };
    revalidatePath("/dashboard/scanners");
    return { id: data.id as string };
  } catch (error) {
    return { error: `Could not save strategy: ${(error as Error).message}` };
  }
}

export async function runCustomBacktestAction(
  strategyId: string
): Promise<{ result?: CustomBacktestResult; error?: string }> {
  const owned = await ownedStrategy(strategyId);
  if (!owned.strategy) return { error: owned.error ?? "Strategy not found" };

  const input: CustomStrategyInput = owned.strategy;
  const parsed = customStrategyInputSchema.safeParse(input);
  if (!parsed.success) return { error: "The saved strategy has invalid rules." };

  try {
    const result = await backtestCustomStrategy(parsed.data);
    const supabase = await createClient();
    const { error } = await supabase
      .from("custom_strategies")
      .update({
        status: "backtested",
        last_backtest: result,
        last_backtested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", strategyId);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/scanners");
    revalidatePath(`/dashboard/scanners/${strategyId}`);
    return { result };
  } catch (error) {
    return { error: `Backtest failed: ${(error as Error).message}` };
  }
}

export async function setCustomStrategyLive(
  strategyId: string,
  live: boolean
): Promise<{ error?: string }> {
  const owned = await ownedStrategy(strategyId);
  if (!owned.strategy) return { error: owned.error ?? "Strategy not found" };
  if (live && !owned.strategy.lastBacktestedAt) {
    return { error: "Run a backtest before starting live paper alerts." };
  }

  const supabase = await createClient();
  if (live) {
    const { count } = await supabase
      .from("custom_strategies")
      .select("id", { count: "exact", head: true })
      .eq("status", "live")
      .neq("id", strategyId);
    if ((count ?? 0) >= 3) return { error: "You can run up to three custom experiments at once." };
  }

  const { error } = await supabase
    .from("custom_strategies")
    .update({ status: live ? "live" : "paused", updated_at: new Date().toISOString() })
    .eq("id", strategyId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/scanners");
  revalidatePath(`/dashboard/scanners/${strategyId}`);
  return {};
}

export async function deleteCustomStrategy(strategyId: string): Promise<{ error?: string }> {
  const owned = await ownedStrategy(strategyId);
  if (!owned.strategy) return { error: owned.error ?? "Strategy not found" };
  const supabase = await createClient();
  const { error } = await supabase.from("custom_strategies").delete().eq("id", strategyId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/scanners");
  return {};
}
