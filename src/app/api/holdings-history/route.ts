import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTimeSeries, type Candle } from "@/lib/twelvedata";

const RANGES: Record<string, { interval: string; outputsize: number }> = {
  "1M": { interval: "1day", outputsize: 22 },
  "3M": { interval: "1day", outputsize: 66 },
  "6M": { interval: "1day", outputsize: 130 },
  "1Y": { interval: "1day", outputsize: 365 },
};

interface Txn {
  symbol: string | null;
  side: string;
  quantity: number;
  price: number;
  created_at: string;
}

// Replay the ledger up to `cutoffMs` to get the positions held at that moment,
// each with its weighted-average cost (mirrors the execute_trade RPC).
function positionsAt(txns: Txn[], cutoffMs: number) {
  const pos: Record<string, { q: number; avgCost: number }> = {};
  for (const t of txns) {
    if (new Date(t.created_at).getTime() > cutoffMs) break;
    if (t.side === "RESET") {
      for (const k of Object.keys(pos)) delete pos[k];
      continue;
    }
    if (!t.symbol) continue; // cash-only rows (opening cash, deposits)
    const cur = pos[t.symbol] ?? { q: 0, avgCost: 0 };
    const qty = Number(t.quantity);
    if (t.side === "SELL") {
      cur.q -= qty;
      if (cur.q <= 1e-9) delete pos[t.symbol];
      else pos[t.symbol] = cur;
    } else {
      // BUY or OPENING_BALANCE holding
      const newQ = cur.q + qty;
      cur.avgCost = newQ > 0 ? (cur.q * cur.avgCost + qty * Number(t.price)) / newQ : 0;
      cur.q = newQ;
      pos[t.symbol] = cur;
    }
  }
  return pos;
}

// Returns the account's holdings value and unrealized P&L over time, anchored at
// the account's creation date — i.e. only real history since the account existed.
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

  const { data: account } = await supabase
    .from("accounts")
    .select("id, created_at")
    .eq("id", accountId)
    .single();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const { data: txnsRaw } = await supabase
    .from("transactions")
    .select("symbol, side, quantity, price, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  const txns = (txnsRaw ?? []) as Txn[];

  const { data: positions } = await supabase
    .from("positions")
    .select("symbol, quantity, avg_cost")
    .eq("account_id", accountId);
  const current = (positions ?? []) as { symbol: string; quantity: number; avg_cost: number }[];

  const symbols = Array.from(new Set(txns.filter((t) => t.symbol).map((t) => t.symbol as string)));
  const series: Record<string, Candle[]> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        series[sym] = await getTimeSeries(sym, range.interval, range.outputsize);
      } catch {
        series[sym] = [];
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
  const lastClose = (sym: string): number | undefined => {
    const arr = series[sym] ?? [];
    return arr.length ? arr[arr.length - 1].close : undefined;
  };

  const creationStr = dayOf(account.created_at);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Market dates from creation day up to (but not including) today — today is the
  // live "now" point appended below.
  const dates = Array.from(
    new Set(symbols.flatMap((s) => (series[s] ?? []).map((c) => dayOf(c.datetime))))
  )
    .filter((d) => d >= creationStr && d < todayStr)
    .sort();

  const holdings: { datetime: string; value: number }[] = [];
  const pnl: { datetime: string; value: number }[] = [];

  for (const d of dates) {
    const pos = positionsAt(txns, new Date(`${d}T23:59:59.999Z`).getTime());
    let hv = 0;
    let cb = 0;
    for (const sym of Object.keys(pos)) {
      hv += pos[sym].q * closeAt(sym, d);
      cb += pos[sym].q * pos[sym].avgCost;
    }
    holdings.push({ datetime: d, value: hv });
    pnl.push({ datetime: d, value: hv - cb });
  }

  // "Now" point from the live current positions.
  let nowHv = 0;
  let nowCb = 0;
  for (const p of current) {
    nowHv += Number(p.quantity) * (lastClose(p.symbol) ?? Number(p.avg_cost));
    nowCb += Number(p.quantity) * Number(p.avg_cost);
  }
  const nowIso = new Date().toISOString();
  holdings.push({ datetime: nowIso, value: nowHv });
  pnl.push({ datetime: nowIso, value: nowHv - nowCb });

  return NextResponse.json({ holdings, pnl, createdAt: account.created_at });
}
