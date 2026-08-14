import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { sendPushToUser } from "@/lib/push";
import { symbolLabel } from "@/lib/assets";
import { evaluateCustomStrategyAt } from "@/lib/custom-strategy";
import { getCustomStrategyBars } from "@/lib/custom-strategy-backtest";
import {
  customStrategyFromDb,
  customStrategyInputSchema,
  type CustomStrategyInput,
  type CustomStrategyRow,
} from "@/lib/custom-strategy-types";

export const maxDuration = 60;

interface AccountRow {
  id: string;
  user_id: string;
  type: string;
}

const throttleMs = (timeframe: CustomStrategyInput["timeframe"]) =>
  timeframe === "15min" ? 10 * 60_000 : timeframe === "1h" ? 20 * 60_000 : 60 * 60_000;

const fmt = (value: number) =>
  value >= 100 ? value.toFixed(2) : value >= 1 ? value.toFixed(3) : value.toFixed(5);

// User-built strategies produce paper alerts only. They never place trades.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret &&
    (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("custom_strategies")
    .select("*")
    .eq("status", "live")
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(25);
  if (error) return NextResponse.json({ skipped: "custom strategies unavailable", detail: error.message });

  const strategies = (data ?? []).map((row) => customStrategyFromDb(row as Record<string, unknown>));
  if (!strategies.length) return NextResponse.json({ enabled: 0 });

  const accountIds = Array.from(new Set(strategies.map((strategy) => strategy.accountId)));
  const { data: accountsRaw } = await db
    .from("accounts")
    .select("id, user_id, type")
    .in("id", accountIds);
  const accounts = (accountsRaw ?? []) as AccountRow[];
  const barsCache = new Map<string, Awaited<ReturnType<typeof getCustomStrategyBars>>>();
  let scanned = 0;
  let alerted = 0;

  for (const strategy of strategies) {
    const account = accounts.find((item) => item.id === strategy.accountId);
    if (!account) continue;
    if (
      strategy.lastRunAt &&
      Date.now() - new Date(strategy.lastRunAt).getTime() < throttleMs(strategy.timeframe)
    ) continue;

    const parsed = customStrategyInputSchema.safeParse(strategy as CustomStrategyRow);
    if (!parsed.success) {
      await db
        .from("custom_strategies")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", strategy.id);
      continue;
    }

    if (account.type !== "crypto") {
      const quote = await getQuote(strategy.symbols[0]).catch(() => null);
      if (!quote?.isMarketOpen) {
        await db
          .from("custom_strategies")
          .update({ last_run_at: new Date().toISOString() })
          .eq("id", strategy.id);
        continue;
      }
    }

    for (const symbol of strategy.symbols) {
      const cacheKey = `${symbol}|${strategy.timeframe}`;
      let candles = barsCache.get(cacheKey);
      if (!candles) {
        candles = await getCustomStrategyBars(symbol, strategy.timeframe).catch(() => []);
        barsCache.set(cacheKey, candles);
      }
      const evaluation = evaluateCustomStrategyAt(candles.slice(-240), parsed.data);
      if (
        evaluation.status !== "signal" ||
        !evaluation.direction ||
        evaluation.entry == null ||
        evaluation.stop == null ||
        evaluation.takeProfit == null ||
        !evaluation.barTime
      ) continue;

      const { error: insertError } = await db.from("custom_strategy_signals").insert({
        strategy_id: strategy.id,
        account_id: strategy.accountId,
        symbol,
        direction: evaluation.direction,
        bar_time: evaluation.barTime,
        entry: evaluation.entry,
        stop: evaluation.stop,
        take_profit: evaluation.takeProfit,
        rr: evaluation.rr,
        reason: evaluation.reason,
      });
      if (insertError) {
        // The unique bar key means this completed candle already alerted.
        if (insertError.code === "23505") continue;
        continue;
      }

      alerted++;
      try {
        await sendPushToUser(account.user_id, {
          title: `${strategy.name}: ${evaluation.direction} ${symbolLabel(symbol)}`,
          body: `Paper alert only. Entry ~${fmt(evaluation.entry)} / stop ${fmt(evaluation.stop)} / target ${fmt(evaluation.takeProfit)} (${evaluation.rr}R).`,
          url: `/dashboard/scanners/${strategy.id}`,
        });
      } catch {}
    }

    scanned++;
    await db
      .from("custom_strategies")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", strategy.id);
  }

  return NextResponse.json({ enabled: strategies.length, scanned, alerted });
}
