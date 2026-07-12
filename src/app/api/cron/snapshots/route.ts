import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotes } from "@/lib/marketdata";
import { GET as dailyScans } from "../daily-scans/route";

export const maxDuration = 60;

// Cron (daily, after US market close): record each account's value so the app
// builds a precise portfolio-performance history over time.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Bearer header OR ?key= (the param survives an apex→www 308 redirect).
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Piggyback: the public /scans results are computed alongside this daily
  // cron (both Vercel cron slots are taken). Runs concurrently with the
  // snapshot work; failures must never break snapshots.
  const scansPromise = dailyScans(request)
    .then((r) => r.json())
    .catch((e) => ({ error: String(e) }));

  // End-of-day sweep: DAY limit orders that didn't fill this session expire.
  await db.from("orders").update({ status: "expired" }).eq("status", "pending").eq("time_in_force", "DAY");

  const [{ data: accounts }, { data: positions }, { data: fxOpen }] = await Promise.all([
    db.from("accounts").select("id, cash_balance"),
    db.from("positions").select("account_id, symbol, quantity, avg_cost"),
    db.from("fx_positions").select("account_id, margin").eq("status", "open"),
  ]);
  if (!accounts?.length) return NextResponse.json({ snapshots: 0, scans: await scansPromise });

  const symbols = Array.from(new Set((positions ?? []).map((p) => p.symbol.toUpperCase())));
  const quotes = symbols.length ? await getQuotes(symbols) : {};
  const today = new Date().toISOString().slice(0, 10);

  const rows = accounts.map((a) => {
    const held = (positions ?? []).filter((p) => p.account_id === a.id);
    // Open forex margin counts toward account value (at cost; floating P&L settles on close).
    const fxMargin = (fxOpen ?? [])
      .filter((f) => f.account_id === a.id)
      .reduce((sum, f) => sum + Number(f.margin), 0);
    const holdingsValue =
      held.reduce((sum, p) => {
        const q = quotes[p.symbol.toUpperCase()];
        return sum + Number(p.quantity) * (q?.price ?? Number(p.avg_cost));
      }, 0) + fxMargin;
    const cash = Number(a.cash_balance);
    return {
      account_id: a.id,
      snapshot_date: today,
      total_value: cash + holdingsValue,
      cash,
      holdings_value: holdingsValue,
    };
  });

  const { error } = await db
    .from("account_snapshots")
    .upsert(rows, { onConflict: "account_id,snapshot_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ snapshots: rows.length, date: today, scans: await scansPromise });
}
