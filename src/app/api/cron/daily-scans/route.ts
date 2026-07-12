import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePublicScans } from "@/lib/public-scans";

export const maxDuration = 60;

// Computes the public /scans results (golden cross, RSI, 52-week highs, …)
// across the 100-stock universe and upserts one row per scan for today.
// Invoked from the daily snapshots cron (no free Vercel cron slot left) or
// manually: /api/cron/daily-scans?key=<CRON_SECRET>&force=1
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let db;
  try {
    db = createAdminClient();
  } catch (e) {
    return NextResponse.json({ skipped: "admin client unavailable", detail: String(e) });
  }
  const runDate = new Date().toISOString().slice(0, 10);

  // Freshness gate: at most one computation per day unless forced.
  if (url.searchParams.get("force") !== "1") {
    const { data: existing, error } = await db
      .from("market_scans")
      .select("id")
      .eq("run_date", runDate)
      .limit(1);
    if (error) {
      // Table missing (migration not run) — degrade to a no-op, never crash.
      return NextResponse.json({ skipped: "market_scans table unavailable", detail: error.message });
    }
    if (existing?.length) return NextResponse.json({ skipped: "already computed", runDate });
  }

  const scans = await computePublicScans();

  const rows = Object.entries(scans).map(([scan_slug, results]) => ({
    scan_slug,
    run_date: runDate,
    results,
  }));
  const { error: upsertErr } = await db
    .from("market_scans")
    .upsert(rows, { onConflict: "scan_slug,run_date" });
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  const counts = Object.fromEntries(Object.entries(scans).map(([k, v]) => [k, v.length]));
  return NextResponse.json({ runDate, counts });
}
