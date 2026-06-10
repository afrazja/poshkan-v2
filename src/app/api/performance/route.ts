import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTimeSeries } from "@/lib/marketdata";

const RANGES: Record<string, number> = { "1M": 31, "3M": 93, "6M": 186, "1Y": 366 };

// Portfolio performance (% return) from daily snapshots, with the S&P 500 (SPY)
// over the same dates as a benchmark. Both normalized to 0% at the first snapshot.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const accountId = params.get("accountId")?.trim();
  const days = RANGES[params.get("range")?.trim() || "3M"] ?? 93;
  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data: snaps } = await supabase
    .from("account_snapshots")
    .select("snapshot_date, total_value")
    .eq("account_id", accountId)
    .gte("snapshot_date", cutoff)
    .order("snapshot_date", { ascending: true });

  const rows = (snaps ?? []) as { snapshot_date: string; total_value: number }[];
  if (rows.length < 2) return NextResponse.json({ points: [], snapshots: rows.length });

  let spyCloses: { datetime: string; close: number }[] = [];
  try {
    spyCloses = await getTimeSeries("SPY", "1day", days + 10);
  } catch {
    // benchmark unavailable — still return the portfolio line
  }
  const spyAt = (dateStr: string): number | null => {
    let close: number | null = null;
    for (const c of spyCloses) {
      if (c.datetime.slice(0, 10) <= dateStr) close = c.close;
      else break;
    }
    return close;
  };

  const base = Number(rows[0].total_value);
  const spyBase = spyAt(rows[0].snapshot_date);

  const points = rows.map((r) => {
    const spyClose = spyAt(r.snapshot_date);
    return {
      date: r.snapshot_date,
      portfolio: base !== 0 ? (Number(r.total_value) / base - 1) * 100 : 0,
      spy: spyBase && spyClose ? (spyClose / spyBase - 1) * 100 : null,
    };
  });

  return NextResponse.json({ points, snapshots: rows.length });
}
