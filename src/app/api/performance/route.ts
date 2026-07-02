import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTimeSeries } from "@/lib/marketdata";

const RANGES: Record<string, number> = { "1M": 31, "3M": 93, "6M": 186, "1Y": 366 };

// Portfolio performance from daily snapshots, with the S&P 500 (SPY) over the
// same dates as a benchmark. The portfolio line is a TIME-WEIGHTED return:
// each day's return excludes external cash flows (deposits, opening balances,
// resets), then the daily returns compound — so adding virtual cash doesn't
// show up as performance. Both lines are normalized to 0% at the first snapshot.
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

  // External cash flows after the first snapshot — money moving in/out that
  // must not count as gain or loss.
  const { data: flowRows } = await supabase
    .from("transactions")
    .select("side, symbol, quantity, price, cash_delta, created_at")
    .eq("account_id", accountId)
    .in("side", ["DEPOSIT", "OPENING_BALANCE", "RESET"])
    .gt("created_at", `${rows[0].snapshot_date}T23:59:59Z`);
  const flows = (flowRows ?? []).map((f) => ({
    date: (f.created_at as string).slice(0, 10),
    isReset: f.side === "RESET",
    amount:
      f.side === "OPENING_BALANCE" && f.symbol
        ? Number(f.quantity) * Number(f.price) // opening holdings at cost
        : Number(f.cash_delta),
  }));

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

  const spyBase = spyAt(rows[0].snapshot_date);

  // Chain daily returns, subtracting each interval's net external flow from the
  // day's change: r = (V_now − flows − V_prev) / V_prev. A RESET wipes the
  // account, so performance across it is meaningless — that interval counts as 0%.
  const points: { date: string; portfolio: number; spy: number | null }[] = [];
  let index = 1;
  let prevValue = Number(rows[0].total_value);
  let prevDate = rows[0].snapshot_date;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i > 0) {
      const inInterval = flows.filter((f) => f.date > prevDate && f.date <= r.snapshot_date);
      const hasReset = inInterval.some((f) => f.isReset);
      const netFlow = inInterval.reduce((s, f) => s + f.amount, 0);
      if (!hasReset && prevValue > 0) {
        index *= 1 + (Number(r.total_value) - netFlow - prevValue) / prevValue;
      }
      prevValue = Number(r.total_value);
      prevDate = r.snapshot_date;
    }
    const spyClose = spyAt(r.snapshot_date);
    points.push({
      date: r.snapshot_date,
      portfolio: (index - 1) * 100,
      spy: spyBase && spyClose ? (spyClose / spyBase - 1) * 100 : null,
    });
  }

  return NextResponse.json({ points, snapshots: rows.length });
}
