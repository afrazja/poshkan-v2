import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTimeSeries, type Candle } from "@/lib/twelvedata";

const RANGES: Record<string, { interval: string; outputsize: number }> = {
  "1M": { interval: "1day", outputsize: 22 },
  "3M": { interval: "1day", outputsize: 66 },
  "6M": { interval: "1day", outputsize: 130 },
  "1Y": { interval: "1week", outputsize: 52 },
};

// Returns the trend of the account's CURRENT holdings over the range, valued at
// historical closes: holdings value and total P&L per date. Powers the inline
// sparklines next to those metrics. (Assumes current holdings for the whole
// window — a sparkline-appropriate simplification, not a trade-by-trade ledger.)
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const accountId = params.get("accountId")?.trim();
  const rangeKey = params.get("range")?.trim() || "1M";
  const range = RANGES[rangeKey] ?? RANGES["1M"];
  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  // RLS scopes positions to accounts the user owns.
  const { data: positions } = await supabase
    .from("positions")
    .select("symbol, quantity, avg_cost")
    .eq("account_id", accountId);

  const held = (positions ?? []) as { symbol: string; quantity: number; avg_cost: number }[];
  if (held.length === 0) return NextResponse.json({ holdings: [], pnl: [] });

  const series: Record<string, Candle[]> = {};
  await Promise.all(
    held.map(async (p) => {
      try {
        series[p.symbol] = await getTimeSeries(p.symbol, range.interval, range.outputsize);
      } catch {
        series[p.symbol] = [];
      }
    })
  );

  const dayOf = (s: string) => s.slice(0, 10);
  const closeAt = (sym: string, dateStr: string): number => {
    const arr = series[sym] ?? [];
    if (arr.length === 0) return 0;
    let close = arr[0].close;
    for (const c of arr) {
      if (dayOf(c.datetime) <= dateStr) close = c.close;
      else break;
    }
    return close;
  };

  const dates = Array.from(
    new Set(held.flatMap((p) => (series[p.symbol] ?? []).map((c) => dayOf(c.datetime))))
  ).sort();

  const costBasis = held.reduce((s, p) => s + Number(p.quantity) * Number(p.avg_cost), 0);

  const holdings = dates.map((d) => {
    const value = held.reduce((s, p) => s + Number(p.quantity) * closeAt(p.symbol, d), 0);
    return { datetime: d, value };
  });
  const pnl = holdings.map((h) => ({ datetime: h.datetime, value: h.value - costBasis }));

  return NextResponse.json({ holdings, pnl });
}
