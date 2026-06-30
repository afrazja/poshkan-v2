import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { marginFor, clampTradeLeverage } from "@/lib/forex";
import { evaluateTrendSymbol, TREND_DEFAULTS, type TrendEval, type TrendParams } from "@/lib/trend";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5));

interface TrendRow {
  account_id: string;
  enabled: boolean;
  mode: string;
  symbols: string[];
  risk_pct: number;
  max_position_pct: number;
  donchian_n: number;
  tp_rr: number;
  adx_min: number;
  ma_slope: boolean;
  max_chase_atr: number;
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
  auto_close_hours: number;
  leverage: number;
}
interface AccRow {
  id: string;
  user_id: string;
  cash_balance: number;
  leverage: number;
  type: string;
}

// Deterministic Trend-Breakout scanner (no AI). Bundled into /api/cron/scanners.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  let settings: TrendRow[];
  try {
    const { data, error } = await db.from("trend_settings").select("*").eq("enabled", true);
    if (error) return NextResponse.json({ skipped: "trend_settings unavailable", detail: error.message });
    settings = (data ?? []) as TrendRow[];
  } catch {
    return NextResponse.json({ skipped: "trend_settings table missing" });
  }
  if (settings.length === 0) return NextResponse.json({ enabled: 0 });

  const ids = settings.map((s) => s.account_id);
  const { data: accData } = await db
    .from("accounts")
    .select("id, user_id, cash_balance, leverage, type")
    .in("id", ids);
  const live = (accData ?? []) as AccRow[];
  if (live.length === 0) return NextResponse.json({ enabled: settings.length, accounts: 0 });

  const evalCache = new Map<string, TrendEval>();
  const evalFor = async (symbol: string, p: TrendParams): Promise<TrendEval> => {
    const ckey = `${symbol}|${p.donchianN}|${p.trendMa}|${p.tpRR}`;
    const hit = evalCache.get(ckey);
    if (hit) return hit;
    const res = await evaluateTrendSymbol(symbol, p);
    evalCache.set(ckey, res);
    return res;
  };

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dedupeSince = new Date(Date.now() - 4 * 3600 * 1000).toISOString();

  let alerted = 0;
  let placed = 0;

  for (const s of settings) {
    const acc = live.find((a) => a.id === s.account_id);
    if (!acc) continue;

    const params: TrendParams = {
      ...TREND_DEFAULTS,
      donchianN: Math.min(100, Math.max(5, Math.round(Number(s.donchian_n) || TREND_DEFAULTS.donchianN))),
      tpRR: Math.min(8, Math.max(1, Number(s.tp_rr) || TREND_DEFAULTS.tpRR)),
      adxMin: Math.min(60, Math.max(0, Math.round(s.adx_min == null ? TREND_DEFAULTS.adxMin : Number(s.adx_min)))),
      maSlope: s.ma_slope ?? TREND_DEFAULTS.maSlope,
      maxChaseAtr: Math.min(10, Math.max(0, s.max_chase_atr == null ? TREND_DEFAULTS.maxChaseAtr : Number(s.max_chase_atr))),
    };
    const universe = marketUniverse(acc.type);
    const chosen = s.symbols && s.symbols.length ? s.symbols : universe;
    const watch = chosen.filter((x) => assetTypeError(acc.type, x) === null);
    if (watch.length === 0) continue;

    if (acc.type !== "crypto") {
      const probe = await getQuote(watch[0]).catch(() => null);
      if (!probe?.isMarketOpen) {
        await db.from("trend_settings").update({ last_run_at: new Date().toISOString() }).eq("account_id", s.account_id);
        continue;
      }
    }

    const evals: TrendEval[] = [];
    for (const sym of watch) evals.push(await evalFor(sym, params));

    await db
      .from("trend_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: evals })
      .eq("account_id", s.account_id);

    for (const ev of evals) {
      if (ev.status !== "signal" || !ev.direction || ev.entry == null || ev.stop == null || ev.takeProfit == null)
        continue;
      const symbol = ev.symbol.toUpperCase();

      const { data: recent } = await db
        .from("trend_signals")
        .select("id")
        .eq("account_id", acc.id)
        .eq("symbol", symbol)
        .eq("direction", ev.direction)
        .gte("created_at", dedupeSince)
        .limit(1);
      if (recent && recent.length) continue;

      const isLong = ev.direction === "LONG";
      const autoMode = s.mode === "auto";

      const { data: pos } = await db
        .from("fx_positions")
        .select("symbol, direction")
        .eq("account_id", acc.id)
        .eq("status", "open");
      const open = pos ?? [];
      if (open.some((p) => (p.symbol ?? "").toUpperCase() === symbol)) continue; // already in it

      // Decide whether to auto-trade; capture WHY we don't, to explain in the alert.
      let why = autoMode ? "" : "scanner is in Alert-only mode";
      let didTrade = false;

      if (autoMode) {
        if (open.length >= (Number(s.max_open) || 2)) {
          why = "max open positions reached";
        } else if (open.some((p) => p.direction !== ev.direction)) {
          // One direction at a time — never hold a long and a short together.
          why = "already holding an opposite-direction position (one direction at a time)";
        } else {
          const { count: tradesToday } = await db
            .from("trend_signals")
            .select("id", { count: "exact", head: true })
            .eq("account_id", acc.id)
            .eq("executed", true)
            .gte("created_at", dayStart.toISOString());
          const { data: closedToday } = await db
            .from("fx_positions")
            .select("pnl")
            .eq("account_id", acc.id)
            .neq("status", "open")
            .gte("closed_at", dayStart.toISOString());
          const realizedToday = (closedToday ?? []).reduce((sum, r) => sum + Number(r.pnl ?? 0), 0);
          const cash = Number(acc.cash_balance);
          const lossHit = realizedToday <= -Math.abs(cash * (Number(s.daily_loss_pct) || 0.04));

          if ((tradesToday ?? 0) >= (Number(s.max_per_day) || 5)) {
            why = "daily trade cap reached";
          } else if (lossHit) {
            why = "daily loss limit hit";
          } else {
            const q = await getQuote(symbol).catch(() => null);
            const liveRate = q?.price ?? ev.entry;
            const riskDist = Math.abs(ev.entry - ev.stop);
            const rewardDist = Math.abs(ev.takeProfit - ev.entry);
            const sl = isLong ? liveRate - riskDist : liveRate + riskDist;
            const tp = isLong ? liveRate + rewardDist : liveRate - rewardDist;

            const lev = clampTradeLeverage(s.leverage);
            // Cap each trade's margin to the user's chosen slice of free cash (default 25%),
            // so one signal can't swallow the account — important now leverage can be 1×.
            const marginCap = cash * (Number(s.max_position_pct) || 0.25);
            let units = roundUnits(riskDist > 0 ? (cash * (Number(s.risk_pct) || 0.02)) / riskDist : 0, acc.type);
            let margin = marginFor(units, liveRate, lev, symbol);
            if (margin > marginCap && margin > 0) {
              units = roundUnits((marginCap / margin) * units, acc.type);
              margin = marginFor(units, liveRate, lev, symbol);
            }

            if (units <= 0) {
              why = "position rounds to 0 — account cash too small for this symbol's minimum size";
            } else if (margin > cash) {
              why = "not enough free cash for the required margin";
            } else {
              const { data: newId, error } = await db.rpc("fx_open", {
                p_account_id: acc.id,
                p_symbol: symbol,
                p_direction: ev.direction,
                p_units: units,
                p_rate: liveRate,
                p_margin: margin,
                p_stop_loss: sl,
                p_take_profit: tp,
              });
              if (!error) {
                await db.from("fx_positions").update({ source: "trend" }).eq("account_id", acc.id).eq("symbol", symbol).eq("status", "open");
                if (Number(s.auto_close_hours) > 0 && newId) {
                  await db.rpc("fx_set_auto_close", { p_position_id: newId, p_minutes: Math.round(Number(s.auto_close_hours) * 60) });
                }
                await logAlert(db, acc, { ...ev, entry: liveRate, stop: sl, takeProfit: tp }, true);
                placed++;
                didTrade = true;
                try {
                  await sendPushToUser(acc.user_id, {
                    title: `🚀 Trend auto-trade: ${ev.direction} ${symbol}`,
                    body: `${units} @ ${fmt(liveRate)} · SL ${fmt(sl)} · TP ${fmt(tp)} (${ev.rr}R). ${ev.reason}`,
                    url: `/dashboard/${acc.id}`,
                  });
                } catch {}
              } else {
                why = `order rejected (${error.message})`;
              }
            }
          }
        }
      }

      if (didTrade) continue;

      await logAlert(db, acc, ev, false);
      alerted++;
      try {
        await sendPushToUser(acc.user_id, {
          title: autoMode
            ? `🚀 Trend: ${ev.direction} ${symbol} — auto-trade skipped`
            : `🚀 Trend signal: ${ev.direction} ${symbol} (${ev.rr}R)`,
          body: autoMode
            ? `Auto-trade skipped: ${why}. Setup: entry ~${fmt(ev.entry)} · SL ${fmt(ev.stop)} · TP ${fmt(ev.takeProfit)}.`
            : `Alert-only mode — no trade placed. Entry ~${fmt(ev.entry)} · SL ${fmt(ev.stop)} · TP ${fmt(ev.takeProfit)}. ${ev.reason}`,
          url: `/dashboard/${acc.id}`,
        });
      } catch {}
    }
  }

  return NextResponse.json({ enabled: settings.length, accounts: live.length, alerted, placed });
}

function roundUnits(units: number, type: string): number {
  if (units <= 0) return 0;
  if (type === "stocks") return Math.floor(units);
  if (type === "forex") return Math.max(0, Math.round(units / 1000) * 1000);
  return Math.floor(units * 1e6) / 1e6;
}

async function logAlert(
  db: ReturnType<typeof createAdminClient>,
  acc: AccRow,
  ev: TrendEval,
  executed: boolean
) {
  await db.from("trend_signals").insert({
    account_id: acc.id,
    symbol: ev.symbol.toUpperCase(),
    direction: ev.direction,
    entry: ev.entry,
    stop: ev.stop,
    take_profit: ev.takeProfit,
    rr: ev.rr,
    reason: ev.reason,
    executed,
  });
}
