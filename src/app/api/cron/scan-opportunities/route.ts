import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/marketdata";
import { MAJORS, buildSummary, analyzeMarket, type PairSummary } from "@/lib/forex-scan";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

const fmtPair = (s: string) => s.replace(/=X$/i, "");
const fmtRate = (p: number) => (p >= 20 ? p.toFixed(3) : p.toFixed(5));
const isUsdBase = (pair: string) => /^USD/i.test(pair.replace(/=X$/i, ""));

// Risk ~1.5% of account cash on the stop distance; round to a 1k-unit lot.
function suggestUnits(cash: number, entry: number, stop: number, pair: string): number {
  const stopDist = Math.abs(entry - stop);
  if (stopDist <= 0 || cash <= 0) return 0;
  const riskPerUnit = isUsdBase(pair) ? stopDist / entry : stopDist; // USD per unit
  return Math.max(0, Math.round(cash * 0.015 / riskPerUnit / 1000) * 1000);
}

// Hourly forex opportunity scanner: analyze the majors, push the single best
// high-conviction setup to forex-account owners who have notifications on.
// ALERT ONLY — never opens/modifies trades. Driven by an external cron pinger
// (Vercel Hobby crons only run once/day).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip silently when the forex market is closed (weekends/holidays).
  const probe = await getQuote("EURUSD=X");
  if (!probe?.isMarketOpen) return NextResponse.json({ skipped: "market closed" });

  // Build readings for the majors, then ask Claude for the best setup (or none).
  const summaries = (await Promise.all(MAJORS.map((p) => buildSummary(p)))).filter(
    (s): s is PairSummary => s != null
  );
  if (summaries.length === 0) return NextResponse.json({ skipped: "no data" });

  const setup = await analyzeMarket(summaries);
  if (!setup) return NextResponse.json({ setup: null });

  const symbol = setup.pair.toUpperCase();

  // Recipients: forex accounts whose owner has push enabled.
  const [{ data: accounts }, { data: subs }] = await Promise.all([
    createAdminClient().from("accounts").select("id, user_id, name, cash_balance").eq("type", "forex"),
    createAdminClient().from("push_subscriptions").select("user_id"),
  ]);
  const db = createAdminClient();
  const pushUsers = new Set((subs ?? []).map((r) => r.user_id));
  const targets = (accounts ?? []).filter((a) => pushUsers.has(a.user_id));

  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  let pushed = 0;

  for (const acc of targets) {
    // Don't re-alert the same setup within 12h.
    const { data: recent } = await db
      .from("fx_scan_alerts")
      .select("id")
      .eq("account_id", acc.id)
      .eq("symbol", symbol)
      .eq("direction", setup.direction)
      .gte("alerted_at", since)
      .limit(1);
    if (recent && recent.length) continue;

    // Skip if they already hold/pending this pair, or already have 3+ open.
    const [{ data: pos }, { data: ord }] = await Promise.all([
      db.from("fx_positions").select("symbol").eq("account_id", acc.id).eq("status", "open"),
      db.from("fx_orders").select("symbol").eq("account_id", acc.id).eq("status", "pending"),
    ]);
    const open = [...(pos ?? []), ...(ord ?? [])];
    if (open.some((o) => (o.symbol ?? "").toUpperCase() === symbol)) continue;
    if (open.length >= 3) continue;

    const units = suggestUnits(Number(acc.cash_balance), setup.entry, setup.stop, setup.pair);
    const entryDesc =
      setup.entryType === "limit" ? `limit ${fmtRate(setup.entry)}` : `market ~${fmtRate(setup.entry)}`;

    await sendPushToUser(acc.user_id, {
      title: `📊 Setup: ${setup.direction} ${fmtPair(setup.pair)} (${setup.rr.toFixed(1)}R)`,
      body: `Entry ${entryDesc} · SL ${fmtRate(setup.stop)} · TP ${fmtRate(setup.takeProfit)} · ~${units.toLocaleString()} units. ${setup.rationale}`,
      url: `/dashboard/${acc.id}`,
    });
    await db
      .from("fx_scan_alerts")
      .insert({ account_id: acc.id, symbol, direction: setup.direction });
    pushed++;
  }

  return NextResponse.json({ setup: symbol, direction: setup.direction, targets: targets.length, pushed });
}
