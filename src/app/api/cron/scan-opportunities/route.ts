import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { marginFor, clampTradeLeverage } from "@/lib/forex";
import { aiUniverse, buildSummary, analyzeMarket, fallbackSetup, type PairSummary } from "@/lib/forex-scan";
import { sendPushToUser } from "@/lib/push";
import { getUserAnthropicKey } from "@/lib/anthropic-key";
import { assetTypeError } from "@/lib/assets";
import { claimSignal, dailyLossHit } from "@/lib/scanner-shared";

export const maxDuration = 60;

const fmtSym = (s: string) => s.replace(/=X$/i, "");
const fmtRate = (p: number) => (p >= 20 ? p.toFixed(3) : p.toFixed(5));
const isUsdBase = (pair: string) => /^USD/i.test(pair.replace(/=X$/i, ""));

const MARKETS = ["forex", "stocks", "crypto"] as const;

// ── Autonomous trading ───────────────────────────────────────────────────────
// Per-account settings (accounts.auto_*) drive this. AUTO_TRADE_ENABLED="false"
// is a global emergency kill-switch over all accounts.
const GLOBAL_KILL = process.env.AUTO_TRADE_ENABLED === "false";
const DEF_RISK_PCT = 0.01;
const DEF_MAX_OPEN = 3;
const DEF_MAX_PER_DAY = 2;
const DEF_DAILY_LOSS_PCT = 0.03;
const DEF_MIN_MINUTES = 60;

// Round position size to what each market trades in.
function roundUnits(units: number, type: string): number {
  if (units <= 0) return 0;
  if (type === "stocks") return Math.floor(units); // whole shares
  if (type === "forex") return Math.max(0, Math.round(units / 1000) * 1000); // 1k lots
  return Math.floor(units * 1e6) / 1e6; // crypto — fractional
}

// Risk a % of account cash on the stop distance; round per market.
function suggestUnits(cash: number, entry: number, stop: number, pair: string, type: string, riskPct = 0.015): number {
  const stopDist = Math.abs(entry - stop);
  if (stopDist <= 0 || cash <= 0) return 0;
  const riskPerUnit = isUsdBase(pair) ? stopDist / entry : stopDist; // USD per unit
  return roundUnits((cash * riskPct) / riskPerUnit, type);
}

interface AccRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  cash_balance: number;
  leverage: number;
  auto_leverage?: number | null;
  auto_max_position_pct?: number | null;
  ai_instruction: string | null;
  ai_symbols?: string[] | null;
  auto_trade_enabled?: boolean;
  auto_risk_pct?: number;
  auto_max_open?: number;
  auto_max_per_day?: number;
  auto_daily_loss_pct?: number;
  auto_min_minutes?: number;
}

// AI opportunity scanner across every market. Pushes the single best high-conviction
// setup per account; for accounts opted into autonomous trading it ALSO places the
// trade within guardrails. Driven by the external 5-min cron pinger.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // ?force=1 — testing: place a trade even if the AI finds nothing premium.
    const force = new URL(request.url).searchParams.get("force") === "1";
    const db = createAdminClient();

    // Recipients: any account whose owner has push enabled.
    const [{ data: accounts }, { data: subs }] = await Promise.all([
      db
        .from("accounts")
        .select(
          "id, user_id, name, type, cash_balance, leverage, auto_leverage, auto_max_position_pct, ai_instruction, ai_symbols, auto_trade_enabled, auto_risk_pct, auto_max_open, auto_max_per_day, auto_daily_loss_pct, auto_min_minutes"
        ),
      db.from("push_subscriptions").select("user_id"),
    ]);
    const pushUsers = new Set((subs ?? []).map((r) => r.user_id));
    const targets = ((accounts ?? []) as AccRow[]).filter((a) => pushUsers.has(a.user_id));
    if (targets.length === 0) return NextResponse.json({ targets: 0, globalKill: GLOBAL_KILL });

    // Strictly bring-your-own-key: the AI scanner runs ONLY on the user's own
    // Anthropic key. No operator-key fallback — a user without a key simply
    // gets no AI scans (the card explains how to add one).
    const keyByUser = new Map<string, string | undefined>();
    await Promise.all(
      Array.from(new Set(targets.map((t) => t.user_id))).map(async (uid) => {
        keyByUser.set(uid, (await getUserAnthropicKey(db, uid)) || undefined);
      })
    );

    // Each account's chosen symbols (validated to its asset class; default = market universe).
    const accSymbols = (a: AccRow): string[] => {
      const list = a.ai_symbols && a.ai_symbols.length ? a.ai_symbols : aiUniverse(a.type);
      return list.filter((x) => assetTypeError(a.type, x) === null);
    };

    // Build readings once per market — the union of all accounts' chosen symbols.
    const summariesByMarket = new Map<string, PairSummary[]>();
    for (const market of MARKETS) {
      const marketAccts = targets.filter((t) => t.type === market);
      if (marketAccts.length === 0) continue;
      const symSet = new Set<string>();
      for (const a of marketAccts) for (const s of accSymbols(a)) symSet.add(s);
      const universe = Array.from(symSet);
      if (universe.length === 0) continue;
      if (market !== "crypto") {
        const probe = await getQuote(universe[0]).catch(() => null);
        if (!probe?.isMarketOpen) continue; // market closed → skip it this run
      }
      const sums = (await Promise.all(universe.map((p) => buildSummary(p)))).filter(
        (s): s is PairSummary => s != null
      );
      if (sums.length) summariesByMarket.set(market, sums);
    }
    if (summariesByMarket.size === 0)
      return NextResponse.json({ skipped: "no open markets / data", globalKill: GLOBAL_KILL });

    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    // Analyze per (owner, market, instruction) — cache so a user's accounts reuse one call.
    const analysisCache = new Map<string, Awaited<ReturnType<typeof analyzeMarket>>>();
    const analysisFor = async (acc: AccRow) => {
      // BYOK: no key on file → no AI call at all (not even a failed attempt).
      if (!keyByUser.get(acc.user_id)) return { setup: null };
      const all = summariesByMarket.get(acc.type);
      if (!all) return { setup: null };
      const want = new Set(accSymbols(acc).map((s) => s.toUpperCase()));
      const sums = all.filter((s) => want.has(s.pair.toUpperCase()));
      if (sums.length === 0) return { setup: null };
      const cacheKey = `${acc.user_id}|${acc.type}|${acc.ai_instruction ?? ""}|${[...want].sort().join(",")}`;
      const hit = analysisCache.get(cacheKey);
      if (hit) return hit;
      const result = await analyzeMarket(sums, acc.ai_instruction, keyByUser.get(acc.user_id), acc.type);
      analysisCache.set(cacheKey, result);
      return result;
    };

    let pushed = 0;
    let placed = 0;
    let aiError: string | undefined;

    for (const acc of targets) {
      const market = acc.type;
      const sums = summariesByMarket.get(market);
      if (!sums) continue; // market closed / unsupported this run

      const analysis = await analysisFor(acc);
      if (analysis.error) aiError = analysis.error;
      let setup = analysis.setup;
      if (!setup && force) setup = fallbackSetup(sums);
      if (!setup) continue;
      const symbol = setup.pair.toUpperCase();
      const liveRate = sums.find((s) => s.pair.toUpperCase() === symbol)?.price ?? setup.entry;

      // Don't re-act on the same setup within 12h. Claim-first so overlapping
      // cron runs can't both fire; the claim row doubles as the alert log.
      let claimId = await claimSignal(
        db,
        "fx_scan_alerts",
        { account_id: acc.id, symbol, direction: setup.direction, executed: false },
        since,
        "alerted_at"
      );
      if (!claimId) {
        if (!force) continue;
        // Forced runs act despite the dedupe — log a fresh row to track it.
        const { data: forced } = await db
          .from("fx_scan_alerts")
          .insert({ account_id: acc.id, symbol, direction: setup.direction, executed: false })
          .select("id")
          .single();
        claimId = forced?.id ?? null;
      }

      const autoTrade = !GLOBAL_KILL && !!acc.auto_trade_enabled;
      const riskPct = Number(acc.auto_risk_pct) || DEF_RISK_PCT;
      const maxOpen = Number(acc.auto_max_open) || DEF_MAX_OPEN;
      const maxPerDay = Number(acc.auto_max_per_day) || DEF_MAX_PER_DAY;
      const dailyLossPct = Number(acc.auto_daily_loss_pct) || DEF_DAILY_LOSS_PCT;
      const minMinutes = Number(acc.auto_min_minutes) || DEF_MIN_MINUTES;

      // Skip if they already hold a position or pending order on this symbol.
      const [{ data: pos }, { data: ord }] = await Promise.all([
        db.from("fx_positions").select("symbol, direction, units, open_rate").eq("account_id", acc.id).eq("status", "open"),
        db.from("fx_orders").select("symbol").eq("account_id", acc.id).eq("status", "pending"),
      ]);
      const held = [...(pos ?? []), ...(ord ?? [])];
      if (!force && held.some((o) => (o.symbol ?? "").toUpperCase() === symbol)) continue;

      const countForCap = autoTrade ? (pos ?? []).length : held.length;
      const cap = autoTrade ? maxOpen : 3;
      if (countForCap >= cap) continue;

      // One direction at a time — don't auto-trade opposite an already-open position.
      const opposing = (pos ?? []).some((p) => {
        const d = (p as { direction?: string }).direction;
        return d != null && d !== setup.direction;
      });

      // ── Autonomous execution path ──
      if (autoTrade && !opposing) {
        const { count } = await db
          .from("fx_scan_alerts")
          .select("id", { count: "exact", head: true })
          .eq("account_id", acc.id)
          .eq("executed", true)
          .gte("alerted_at", dayStart.toISOString());
        const tradedToday = count ?? 0;
        const cash = Number(acc.cash_balance);

        // Daily loss limit — realized losses today plus current open drawdown.
        const lossLimitHit = await dailyLossHit(
          db, acc.id, pos ?? [], dayStart.toISOString(), cash, dailyLossPct
        );

        // Frequency throttle.
        const { data: lastExec } = await db
          .from("fx_scan_alerts")
          .select("alerted_at")
          .eq("account_id", acc.id)
          .eq("executed", true)
          .order("alerted_at", { ascending: false })
          .limit(1);
        const lastAt = lastExec?.[0]?.alerted_at ? new Date(lastExec[0].alerted_at as string).getTime() : 0;
        const tooSoon = Date.now() - lastAt < minMinutes * 60_000;

        const lev = clampTradeLeverage(acc.auto_leverage);
        // Cap each trade's margin to the user's chosen slice of free cash (default 25%),
        // so one signal can't swallow the account — important now leverage can be 1×.
        const marginCap = cash * (Number(acc.auto_max_position_pct) || 0.25);
        let units = suggestUnits(cash, setup.entry, setup.stop, setup.pair, market, riskPct);
        let margin = marginFor(units, liveRate, lev, setup.pair);
        if (margin > marginCap && margin > 0) {
          units = roundUnits((marginCap / margin) * units, market);
          margin = marginFor(units, liveRate, lev, setup.pair);
        }

        // A "limit" proposal is an order for a DIFFERENT price than now — filling
        // it immediately at market would trade a plan the model never made.
        // Auto-execute market setups only; limit ideas still go out as alerts.
        const marketEntry = !setup.entryType || setup.entryType === "market";
        if (marketEntry && (force || (tradedToday < maxPerDay && !lossLimitHit && !tooSoon)) && units > 0 && margin <= cash) {
          // Open at market; anchor SL/TP to the live fill, preserving reward:risk.
          const isLong = setup.direction === "LONG";
          const risk = Math.abs(setup.entry - setup.stop);
          const reward = Math.abs(setup.takeProfit - setup.entry);
          const sl = isLong ? liveRate - risk : liveRate + risk;
          const tp = isLong ? liveRate + reward : liveRate - reward;
          const { data: newId, error: openErr } = await db.rpc("fx_open", {
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
            if (newId) await db.from("fx_positions").update({ source: "ai" }).eq("id", newId);
            if (claimId) await db.from("fx_scan_alerts").update({ executed: true }).eq("id", claimId);
            placed++;
            try {
              await sendPushToUser(acc.user_id, {
                title: `🤖 Auto-trade opened: ${setup.direction} ${fmtSym(setup.pair)} (${setup.rr.toFixed(1)}R)`,
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
      const units = suggestUnits(Number(acc.cash_balance), setup.entry, setup.stop, setup.pair, market);
      const entryDesc =
        setup.entryType === "limit" ? `limit ${fmtRate(setup.entry)}` : `market ~${fmtRate(setup.entry)}`;

      pushed++; // the claim row already logged this alert
      try {
        await sendPushToUser(acc.user_id, {
          title: `📊 Setup: ${setup.direction} ${fmtSym(setup.pair)} (${setup.rr.toFixed(1)}R)`,
          body: `Entry ${entryDesc} · SL ${fmtRate(setup.stop)} · TP ${fmtRate(setup.takeProfit)} · ~${units.toLocaleString()} units. ${setup.rationale}`,
          url: `/dashboard/${acc.id}`,
        });
      } catch {}
    }

    return NextResponse.json({
      targets: targets.length,
      alerted: pushed,
      autoPlaced: placed,
      markets: [...summariesByMarket.keys()],
      globalKill: GLOBAL_KILL,
      aiError,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}
