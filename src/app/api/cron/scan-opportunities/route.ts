import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { marginFor } from "@/lib/forex";
import { MAJORS, buildSummary, analyzeMarket, fallbackSetup, type PairSummary } from "@/lib/forex-scan";
import { sendPushToUser } from "@/lib/push";
import { getUserAnthropicKey } from "@/lib/anthropic-key";

export const maxDuration = 60;

const fmtPair = (s: string) => s.replace(/=X$/i, "");
const fmtRate = (p: number) => (p >= 20 ? p.toFixed(3) : p.toFixed(5));
const isUsdBase = (pair: string) => /^USD/i.test(pair.replace(/=X$/i, ""));

// ── Autonomous trading ───────────────────────────────────────────────────────
// Per-account settings (accounts.auto_*) drive this now — set from the UI.
// AUTO_TRADE_ENABLED="false" is a global emergency kill-switch over all accounts.
const GLOBAL_KILL = process.env.AUTO_TRADE_ENABLED === "false";
// Fallback defaults if a column is somehow null.
const DEF_RISK_PCT = 0.01;
const DEF_MAX_OPEN = 3;
const DEF_MAX_PER_DAY = 2;
const DEF_DAILY_LOSS_PCT = 0.03;
const DEF_MIN_MINUTES = 60;

// Risk a % of account cash on the stop distance; round to a 1k-unit lot.
function suggestUnits(cash: number, entry: number, stop: number, pair: string, riskPct = 0.015): number {
  const stopDist = Math.abs(entry - stop);
  if (stopDist <= 0 || cash <= 0) return 0;
  const riskPerUnit = isUsdBase(pair) ? stopDist / entry : stopDist; // USD per unit
  return Math.max(0, Math.round((cash * riskPct) / riskPerUnit / 1000) * 1000);
}

// Hourly forex opportunity scanner. Always pushes the single best high-conviction
// setup to forex-account owners. For accounts that have opted into autonomous
// trading (AUTO_TRADE_* env), it ALSO places the trade itself within guardrails.
// Driven by an external cron pinger (Vercel Hobby crons only run once/day).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
  // Skip silently when the forex market is closed (weekends/holidays).
  const probe = await getQuote("EURUSD=X");
  if (!probe?.isMarketOpen) return NextResponse.json({ skipped: "market closed", globalKill: GLOBAL_KILL });

  // Build readings for the majors, then ask Claude for the best setup (or none).
  const summaries = (await Promise.all(MAJORS.map((p) => buildSummary(p)))).filter(
    (s): s is PairSummary => s != null
  );
  if (summaries.length === 0) return NextResponse.json({ skipped: "no data", globalKill: GLOBAL_KILL });

  // ?force=1 — testing: place a trade even if the AI finds nothing premium, and
  // bypass the dedup / same-pair / daily-cap guards below.
  const force = new URL(request.url).searchParams.get("force") === "1";

  // Recipients: forex accounts whose owner has push enabled.
  const db = createAdminClient();
  const [{ data: accounts }, { data: subs }] = await Promise.all([
    db
      .from("accounts")
      .select(
        "id, user_id, name, cash_balance, leverage, ai_instruction, auto_trade_enabled, auto_risk_pct, auto_max_open, auto_max_per_day, auto_daily_loss_pct, auto_min_minutes"
      )
      .eq("type", "forex"),
    db.from("push_subscriptions").select("user_id"),
  ]);
  const pushUsers = new Set((subs ?? []).map((r) => r.user_id));
  const targets = (accounts ?? []).filter((a) => pushUsers.has(a.user_id));

  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  // Each user's AI calls bill THEIR own Anthropic key (env key as fallback).
  const keyByUser = new Map<string, string | undefined>();
  await Promise.all(
    Array.from(new Set(targets.map((t) => t.user_id))).map(async (uid) => {
      keyByUser.set(uid, (await getUserAnthropicKey(db, uid)) || process.env.ANTHROPIC_API_KEY || undefined);
    })
  );

  // Analyze per (owner, instruction); cache so a user's multiple accounts reuse one call.
  const analysisCache = new Map<string, Awaited<ReturnType<typeof analyzeMarket>>>();
  const analysisFor = async (ownerId: string, instruction?: string | null) => {
    const cacheKey = `${ownerId}|${instruction ?? ""}`;
    const hit = analysisCache.get(cacheKey);
    if (hit) return hit;
    const result = await analyzeMarket(summaries, instruction, keyByUser.get(ownerId));
    analysisCache.set(cacheKey, result);
    return result;
  };

  let pushed = 0;
  let placed = 0;
  let aiError: string | undefined;

  for (const acc of targets) {
    const analysis = await analysisFor(acc.user_id, (acc as { ai_instruction?: string | null }).ai_instruction);
    if (analysis.error) aiError = analysis.error;
    let setup = analysis.setup;
    if (!setup && force) setup = fallbackSetup(summaries);
    if (!setup) continue;
    const symbol = setup.pair.toUpperCase();
    const liveRate = summaries.find((s) => s.pair.toUpperCase() === symbol)?.price ?? setup.entry;

    // Don't re-act on the same setup within 12h.
    const { data: recent } = await db
      .from("fx_scan_alerts")
      .select("id")
      .eq("account_id", acc.id)
      .eq("symbol", symbol)
      .eq("direction", setup.direction)
      .gte("alerted_at", since)
      .limit(1);
    if (!force && recent && recent.length) continue;

    const a = acc as {
      auto_trade_enabled?: boolean;
      auto_risk_pct?: number;
      auto_max_open?: number;
      auto_max_per_day?: number;
      auto_daily_loss_pct?: number;
      auto_min_minutes?: number;
    };
    const autoTrade = !GLOBAL_KILL && !!a.auto_trade_enabled;
    const riskPct = Number(a.auto_risk_pct) || DEF_RISK_PCT;
    const maxOpen = Number(a.auto_max_open) || DEF_MAX_OPEN;
    const maxPerDay = Number(a.auto_max_per_day) || DEF_MAX_PER_DAY;
    const dailyLossPct = Number(a.auto_daily_loss_pct) || DEF_DAILY_LOSS_PCT;
    const minMinutes = Number(a.auto_min_minutes) || DEF_MIN_MINUTES;

    // Skip if they already hold a position or pending order on this pair.
    const [{ data: pos }, { data: ord }] = await Promise.all([
      db.from("fx_positions").select("symbol").eq("account_id", acc.id).eq("status", "open"),
      db.from("fx_orders").select("symbol").eq("account_id", acc.id).eq("status", "pending"),
    ]);
    const held = [...(pos ?? []), ...(ord ?? [])];
    if (!force && held.some((o) => (o.symbol ?? "").toUpperCase() === symbol)) continue;

    // Position cap: auto-trading counts only OPEN (filled) positions, so pending
    // orders don't block it; alert-only uses the broader open + pending count.
    const countForCap = autoTrade ? (pos ?? []).length : held.length;
    const cap = autoTrade ? maxOpen : 3;
    if (countForCap >= cap) continue;

    // ── Autonomous execution path ──
    if (autoTrade) {
      const { count } = await db
        .from("fx_scan_alerts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", acc.id)
        .eq("executed", true)
        .gte("alerted_at", dayStart.toISOString());
      const tradedToday = count ?? 0;
      const cash = Number(acc.cash_balance);

      // Daily loss limit: halt new auto-trades once realized losses today exceed the cap.
      const { data: closedToday } = await db
        .from("fx_positions")
        .select("pnl")
        .eq("account_id", acc.id)
        .neq("status", "open")
        .gte("closed_at", dayStart.toISOString());
      const realizedToday = (closedToday ?? []).reduce((sum, r) => sum + Number(r.pnl ?? 0), 0);
      const lossLimitHit = realizedToday <= -Math.abs(cash * dailyLossPct);

      // Frequency throttle: require minMinutes since the last auto-trade.
      const { data: lastExec } = await db
        .from("fx_scan_alerts")
        .select("alerted_at")
        .eq("account_id", acc.id)
        .eq("executed", true)
        .order("alerted_at", { ascending: false })
        .limit(1);
      const lastAt = lastExec?.[0]?.alerted_at ? new Date(lastExec[0].alerted_at as string).getTime() : 0;
      const tooSoon = Date.now() - lastAt < minMinutes * 60_000;

      const lev = Number(acc.leverage) || 1;
      const units = suggestUnits(cash, setup.entry, setup.stop, setup.pair, riskPct);
      const margin = marginFor(units, liveRate, lev, setup.pair);

      if (
        (force || (tradedToday < maxPerDay && !lossLimitHit && !tooSoon)) &&
        units > 0 &&
        margin <= cash
      ) {
        // Open immediately at market. Place SL/TP at the same distances as the
        // plan, anchored to the live fill — preserves the reward:risk.
        const isLong = setup.direction === "LONG";
        const risk = Math.abs(setup.entry - setup.stop);
        const reward = Math.abs(setup.takeProfit - setup.entry);
        const sl = isLong ? liveRate - risk : liveRate + risk;
        const tp = isLong ? liveRate + reward : liveRate - reward;
        const { error: openErr } = await db.rpc("fx_open", {
          p_account_id: acc.id,
          p_symbol: symbol,
          p_direction: setup.direction,
          p_units: units,
          p_rate: liveRate,
          p_margin: margin,
          p_stop_loss: sl,
          p_take_profit: tp,
        });
        if (!openErr) {
          await db
            .from("fx_scan_alerts")
            .insert({ account_id: acc.id, symbol, direction: setup.direction, executed: true });
          placed++;
          // Push is best-effort — never let a notification failure undo the trade.
          try {
            await sendPushToUser(acc.user_id, {
              title: `🤖 Auto-trade opened: ${setup.direction} ${fmtPair(setup.pair)} (${setup.rr.toFixed(1)}R)`,
              body: `Opened at ${fmtRate(liveRate)} · SL ${fmtRate(sl)} · TP ${fmtRate(tp)} · ${units.toLocaleString()} units. ${setup.rationale}`,
              url: `/dashboard/${acc.id}`,
            });
          } catch {}
          continue;
        }
        // Open failed (margin / SL-TP gap) — fall through to an alert.
      }
      // Daily cap hit / can't afford / placement failed → alert instead.
    }

    // ── Alert-only path ──
    const units = suggestUnits(Number(acc.cash_balance), setup.entry, setup.stop, setup.pair);
    const entryDesc =
      setup.entryType === "limit" ? `limit ${fmtRate(setup.entry)}` : `market ~${fmtRate(setup.entry)}`;

    await db.from("fx_scan_alerts").insert({ account_id: acc.id, symbol, direction: setup.direction });
    pushed++;
    try {
      await sendPushToUser(acc.user_id, {
        title: `📊 Setup: ${setup.direction} ${fmtPair(setup.pair)} (${setup.rr.toFixed(1)}R)`,
        body: `Entry ${entryDesc} · SL ${fmtRate(setup.stop)} · TP ${fmtRate(setup.takeProfit)} · ~${units.toLocaleString()} units. ${setup.rationale}`,
        url: `/dashboard/${acc.id}`,
      });
    } catch {}
  }

  return NextResponse.json({
    targets: targets.length,
    alerted: pushed,
    autoPlaced: placed,
    globalKill: GLOBAL_KILL,
    aiError,
  });
  } catch (e) {
    return NextResponse.json(
      { error: String((e as { message?: string })?.message ?? e) },
      { status: 500 }
    );
  }
}
