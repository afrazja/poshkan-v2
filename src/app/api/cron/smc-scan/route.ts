import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { marginFor } from "@/lib/forex";
import { evaluateSymbol, DEFAULT_PARAMS, type SmcEval, type SmcParams } from "@/lib/smc";
import { marketUniverse, assetTypeError } from "@/lib/assets";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5));

interface SmcRow {
  account_id: string;
  enabled: boolean;
  mode: string;
  symbols: string[];
  risk_pct: number;
  tp_rr: number;
  sl_mode: string;
  max_open: number;
  max_per_day: number;
  daily_loss_pct: number;
}
interface AccRow {
  id: string;
  user_id: string;
  cash_balance: number;
  leverage: number;
  type: string;
}

// Deterministic SMC scanner (no AI). Runs every ~5 min via the external pinger:
//   https://www.poshkan.com/api/cron/smc-scan?key=<CRON_SECRET>
// Processes every account that has enabled the scanner, on its market's symbols.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Enabled settings → owning crypto accounts. Degrade gracefully if not migrated.
  let settings: SmcRow[];
  try {
    const { data, error } = await db.from("smc_settings").select("*").eq("enabled", true);
    if (error) return NextResponse.json({ skipped: "smc_settings unavailable", detail: error.message });
    settings = (data ?? []) as SmcRow[];
  } catch {
    return NextResponse.json({ skipped: "smc_settings table missing" });
  }
  if (settings.length === 0) return NextResponse.json({ enabled: 0 });

  const ids = settings.map((s) => s.account_id);
  const { data: accData } = await db
    .from("accounts")
    .select("id, user_id, cash_balance, leverage, type")
    .in("id", ids);
  const accounts = (accData ?? []) as AccRow[];

  // Every enabled account is processed, whatever its market (free for all users).
  const live = accounts;
  if (live.length === 0) return NextResponse.json({ enabled: settings.length, accounts: 0 });

  // Evaluate each universe symbol once (shared across accounts), per param-set.
  // Most accounts use defaults, so cache by the params that affect the read.
  const evalCache = new Map<string, SmcEval>();
  const evalFor = async (symbol: string, p: SmcParams): Promise<SmcEval> => {
    const ckey = `${symbol}|${p.swingN}|${p.atrPeriod}|${p.fvgMinAtr}|${p.slMode}|${p.tpRR}`;
    const hit = evalCache.get(ckey);
    if (hit) return hit;
    const res = await evaluateSymbol(symbol, p);
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

    const params: SmcParams = {
      ...DEFAULT_PARAMS,
      slMode: s.sl_mode === "fvg" ? "fvg" : "swing",
      tpRR: Number(s.tp_rr) || DEFAULT_PARAMS.tpRR,
    };
    const universe = marketUniverse(acc.type);
    const chosen = s.symbols && s.symbols.length ? s.symbols : universe;
    // Keep any symbol that belongs to this account's asset class (not just presets).
    const watch = chosen.filter((x) => assetTypeError(acc.type, x) === null);
    if (watch.length === 0) continue;

    // Skip stocks/forex when their market is closed (no fresh bars to act on).
    if (acc.type !== "crypto") {
      const probe = await getQuote(watch[0]).catch(() => null);
      if (!probe?.isMarketOpen) {
        await db
          .from("smc_settings")
          .update({ last_run_at: new Date().toISOString() })
          .eq("account_id", s.account_id);
        continue;
      }
    }

    const evals: SmcEval[] = [];
    for (const sym of watch) evals.push(await evalFor(sym, params));

    // Persist the live read for the in-app feed (best-effort).
    await db
      .from("smc_settings")
      .update({ last_run_at: new Date().toISOString(), last_status: evals })
      .eq("account_id", s.account_id);

    for (const ev of evals) {
      if (ev.status !== "signal" || !ev.direction || ev.entry == null || ev.stop == null || ev.takeProfit == null)
        continue;
      const symbol = ev.symbol.toUpperCase();

      // Dedup: don't re-fire the same symbol+direction within 4h.
      const { data: recent } = await db
        .from("smc_signals")
        .select("id")
        .eq("account_id", acc.id)
        .eq("symbol", symbol)
        .eq("direction", ev.direction)
        .gte("created_at", dedupeSince)
        .limit(1);
      if (recent && recent.length) continue;

      const isLong = ev.direction === "LONG";
      const autoMode = s.mode === "auto";

      // Current open positions on this account (cap + correlation + same-symbol).
      const { data: pos } = await db
        .from("fx_positions")
        .select("symbol, direction")
        .eq("account_id", acc.id)
        .eq("status", "open");
      const open = pos ?? [];
      if (open.some((p) => (p.symbol ?? "").toUpperCase() === symbol)) continue; // already in it
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
        // Daily trade cap.
        const { count: tradesToday } = await db
          .from("smc_signals")
          .select("id", { count: "exact", head: true })
          .eq("account_id", acc.id)
          .eq("executed", true)
          .gte("created_at", dayStart.toISOString());
        // Daily loss limit.
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

          const lev = Number(acc.leverage) || 1;
          let units = roundUnits(riskDist > 0 ? (cash * (Number(s.risk_pct) || 0.02)) / riskDist : 0, acc.type);
          // Scale down so required margin never exceeds free cash.
          let margin = marginFor(units, liveRate, lev, symbol);
          if (margin > cash * 0.95 && margin > 0) {
            units = roundUnits(((cash * 0.95) / margin) * units, acc.type);
            margin = marginFor(units, liveRate, lev, symbol);
          }

          if (units > 0 && margin <= cash) {
            const { error } = await db.rpc("fx_open", {
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
              await logAlert(db, acc, { ...ev, entry: liveRate, stop: sl, takeProfit: tp }, true);
              placed++;
              try {
                await sendPushToUser(acc.user_id, {
                  title: `🤖 SMC auto-trade: ${ev.direction} ${symbol}`,
                  body: `${units} @ ${fmt(liveRate)} · SL ${fmt(sl)} · TP ${fmt(tp)} (${ev.rr}R). ${ev.reason}`,
                  url: `/dashboard/${acc.id}`,
                });
              } catch {}
              continue;
            }
          }
          // Couldn't size/afford/open → fall through to alert.
        }
      }

      // Alert-only path (or auto blocked by a guardrail).
      await logAlert(db, acc, ev, false);
      alerted++;
      try {
        await sendPushToUser(acc.user_id, {
          title: `📊 SMC signal: ${ev.direction} ${symbol} (${ev.rr}R)`,
          body: `Entry ~${fmt(ev.entry)} · SL ${fmt(ev.stop)} · TP ${fmt(ev.takeProfit)}. ${ev.reason}`,
          url: `/dashboard/${acc.id}`,
        });
      } catch {}
    }
  }

  return NextResponse.json({ enabled: settings.length, accounts: live.length, alerted, placed });
}

// Round position size to what each market trades in.
function roundUnits(units: number, type: string): number {
  if (units <= 0) return 0;
  if (type === "stocks") return Math.floor(units); // whole shares
  if (type === "forex") return Math.max(0, Math.round(units / 1000) * 1000); // 1k lots
  return Math.floor(units * 1e6) / 1e6; // crypto — fractional
}

async function logAlert(
  db: ReturnType<typeof createAdminClient>,
  acc: AccRow,
  ev: SmcEval,
  executed: boolean
) {
  await db.from("smc_signals").insert({
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
