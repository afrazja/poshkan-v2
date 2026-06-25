import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { marginFor } from "@/lib/forex";
import { MAJORS, buildSummary, analyzeMarket, fallbackSetup, type PairSummary } from "@/lib/forex-scan";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

const fmtPair = (s: string) => s.replace(/=X$/i, "");
const fmtRate = (p: number) => (p >= 20 ? p.toFixed(3) : p.toFixed(5));
const isUsdBase = (pair: string) => /^USD/i.test(pair.replace(/=X$/i, ""));

// ── Autonomous trading (OFF unless explicitly enabled) ───────────────────────
// AUTO_TRADE_ENABLED=true is the master switch (kill-switch when unset/false).
// AUTO_TRADE_ACCOUNT_IDS is a comma-separated allowlist — only these forex
// accounts ever auto-trade; everyone else stays alert-only. Conservative caps.
const AUTO_ENABLED = process.env.AUTO_TRADE_ENABLED === "true";
const AUTO_ACCOUNTS = new Set(
  (process.env.AUTO_TRADE_ACCOUNT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
const AUTO_RISK_PCT = 0.01; // 1% of cash risked per auto-trade
const AUTO_MAX_OPEN = 8; // max OPEN (filled) positions to hold; pending orders don't count
const AUTO_MAX_PER_DAY = 50; // effectively no daily cap (still 1 setup per hourly run)

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

  // Skip silently when the forex market is closed (weekends/holidays).
  const probe = await getQuote("EURUSD=X");
  if (!probe?.isMarketOpen) return NextResponse.json({ skipped: "market closed", autoEnabled: AUTO_ENABLED });

  // Build readings for the majors, then ask Claude for the best setup (or none).
  const summaries = (await Promise.all(MAJORS.map((p) => buildSummary(p)))).filter(
    (s): s is PairSummary => s != null
  );
  if (summaries.length === 0) return NextResponse.json({ skipped: "no data", autoEnabled: AUTO_ENABLED });

  // ?force=1 — testing: place a trade even if the AI finds nothing premium, and
  // bypass the dedup / same-pair / daily-cap guards below.
  const force = new URL(request.url).searchParams.get("force") === "1";
  let setup = await analyzeMarket(summaries);
  if (!setup && force) setup = fallbackSetup(summaries);
  if (!setup) {
    return NextResponse.json({ setup: null, autoEnabled: AUTO_ENABLED, autoAccounts: AUTO_ACCOUNTS.size });
  }

  const symbol = setup.pair.toUpperCase();
  const liveRate = summaries.find((s) => s.pair.toUpperCase() === symbol)?.price ?? setup.entry;

  // Recipients: forex accounts whose owner has push enabled.
  const db = createAdminClient();
  const [{ data: accounts }, { data: subs }] = await Promise.all([
    db.from("accounts").select("id, user_id, name, cash_balance, leverage").eq("type", "forex"),
    db.from("push_subscriptions").select("user_id"),
  ]);
  const pushUsers = new Set((subs ?? []).map((r) => r.user_id));
  const targets = (accounts ?? []).filter((a) => pushUsers.has(a.user_id));

  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  let pushed = 0;
  let placed = 0;

  for (const acc of targets) {
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

    const autoTrade = AUTO_ENABLED && AUTO_ACCOUNTS.has(acc.id);

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
    const cap = autoTrade ? AUTO_MAX_OPEN : 3;
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
      const lev = Number(acc.leverage) || 1;
      const units = suggestUnits(cash, setup.entry, setup.stop, setup.pair, AUTO_RISK_PCT);
      const margin = marginFor(units, liveRate, lev, setup.pair);

      if ((force || tradedToday < AUTO_MAX_PER_DAY) && units > 0 && margin <= cash) {
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
    setup: symbol,
    direction: setup.direction,
    targets: targets.length,
    alerted: pushed,
    autoPlaced: placed,
    autoEnabled: AUTO_ENABLED,
  });
}
