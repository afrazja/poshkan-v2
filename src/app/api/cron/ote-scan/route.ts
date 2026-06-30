import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { marginFor, clampTradeLeverage } from "@/lib/forex";
import { evaluateOteSymbol, OTE_DEFAULTS, type OteEval, type OteParams } from "@/lib/ote";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5));

interface OteRow {
  account_id: string;
  enabled: boolean;
  mode: string;
  symbols: string[];
  risk_pct: number;
  min_rr: number;
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

// Deterministic OTE scanner (no AI). Runs via the external pinger (bundled in
// /api/cron/scanners). Processes every account that enabled the scanner.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  let settings: OteRow[];
  try {
    const { data, error } = await db.from("ote_settings").select("*").eq("enabled", true);
    if (error) return NextResponse.json({ skipped: "ote_settings unavailable", detail: error.message });
    settings = (data ?? []) as OteRow[];
  } catch {
    return NextResponse.json({ skipped: "ote_settings table missing" });
  }
  if (settings.length === 0) return NextResponse.json({ enabled: 0 });

  const ids = settings.map((s) => s.account_id);
  const { data: accData } = await db
    .from("accounts")
    .select("id, user_id, cash_balance, leverage, type")
    .in("id", ids);
  const live = (accData ?? []) as AccRow[];
  if (live.length === 0) return NextResponse.json({ enabled: settings.length, accounts: 0 });

  const evalCache = new Map<string, OteEval>();
  const evalFor = async (symbol: string, p: OteParams): Promise<OteEval> => {
    const ckey = `${symbol}|${p.minRR}`;
    const hit = evalCache.get(ckey);
    if (hit) return hit;
    const res = await evaluateOteSymbol(symbol, p);
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

    const params: OteParams = {
      ...OTE_DEFAULTS,
      minRR: Math.min(6, Math.max(1.5, Number(s.min_rr) || OTE_DEFAULTS.minRR)),
    };
    const universe = marketUniverse(acc.type);
    const chosen = s.symbols && s.symbols.length ? s.symbols : universe;
    const watch = chosen.filter((x) => assetTypeError(acc.type, x) === null);
    if (watch.length === 0) continue;

    // Skip stocks/forex when their market is closed (no fresh bars to act on).
    if (acc.type !== "crypto") {
      const probe = await getQuote(watch[0]).catch(() => null);
      if (!probe?.isMarketOpen) {
        await db.from("ote_settings").update({ last_run_at: new Date().toISOString() }).eq("account_id", s.account_id);
        continue;
      }
    }

    const evals: OteEval[] = [];
    for (const sym of watch) evals.push(await evalFor(sym, params));

    await db
      .from("ote_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: evals })
      .eq("account_id", s.account_id);

    for (const ev of evals) {
      if (ev.status !== "signal" || !ev.direction || ev.entry == null || ev.stop == null || ev.takeProfit == null)
        continue;
      const symbol = ev.symbol.toUpperCase();

      const { data: recent } = await db
        .from("ote_signals")
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
      if (open.some((p) => (p.symbol ?? "").toUpperCase() === symbol)) continue;
      if (open.length >= (Number(s.max_open) || 2)) {
        await logAlert(db, acc, ev, false);
        alerted++;
        continue;
      }
      // One direction at a time — never hold a long and a short together (don't fight yourself).
      if (open.some((p) => p.direction !== ev.direction)) {
        await logAlert(db, acc, ev, false);
        alerted++;
        continue;
      }

      if (autoMode) {
        const { count: tradesToday } = await db
          .from("ote_signals")
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

        if ((tradesToday ?? 0) < (Number(s.max_per_day) || 5) && !lossHit) {
          // Anchor the fill to the live quote, preserving the plan's R distances.
          const q = await getQuote(symbol).catch(() => null);
          const liveRate = q?.price ?? ev.entry;
          const riskDist = Math.abs(ev.entry - ev.stop);
          const rewardDist = Math.abs(ev.takeProfit - ev.entry);
          const sl = isLong ? liveRate - riskDist : liveRate + riskDist;
          const tp = isLong ? liveRate + rewardDist : liveRate - rewardDist;

          const lev = clampTradeLeverage(s.leverage);
          // Cap each trade to a slice of free cash (smaller when more positions are allowed),
          // so one signal can't swallow the account — important now leverage can be 1×.
          const marginCap = cash * Math.min(0.25, 1 / Math.max(1, Number(s.max_open) || 2));
          let units = roundUnits(riskDist > 0 ? (cash * (Number(s.risk_pct) || 0.02)) / riskDist : 0, acc.type);
          let margin = marginFor(units, liveRate, lev, symbol);
          if (margin > marginCap && margin > 0) {
            units = roundUnits((marginCap / margin) * units, acc.type);
            margin = marginFor(units, liveRate, lev, symbol);
          }

          if (units > 0 && margin <= cash) {
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
              await db.from("fx_positions").update({ source: "ote" }).eq("account_id", acc.id).eq("symbol", symbol).eq("status", "open");
              if (Number(s.auto_close_hours) > 0 && newId) {
                await db.rpc("fx_set_auto_close", { p_position_id: newId, p_minutes: Math.round(Number(s.auto_close_hours) * 60) });
              }
              await logAlert(db, acc, { ...ev, entry: liveRate, stop: sl, takeProfit: tp }, true);
              placed++;
              try {
                await sendPushToUser(acc.user_id, {
                  title: `🎯 OTE auto-trade: ${ev.direction} ${symbol}`,
                  body: `${units} @ ${fmt(liveRate)} · SL ${fmt(sl)} · TP ${fmt(tp)} (${ev.rr}R). ${ev.reason}`,
                  url: `/dashboard/${acc.id}`,
                });
              } catch {}
              continue;
            }
          }
        }
      }

      await logAlert(db, acc, ev, false);
      alerted++;
      try {
        await sendPushToUser(acc.user_id, {
          title: autoMode
            ? `🎯 OTE: ${ev.direction} ${symbol} — auto-trade skipped`
            : `🎯 OTE signal: ${ev.direction} ${symbol} (${ev.rr}R)`,
          body: autoMode
            ? `Found a setup but didn't open it — a daily limit was hit or it couldn't be sized within your cash. Entry ~${fmt(ev.entry)} · SL ${fmt(ev.stop)} · TP ${fmt(ev.takeProfit)}.`
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
  ev: OteEval,
  executed: boolean
) {
  await db.from("ote_signals").insert({
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
