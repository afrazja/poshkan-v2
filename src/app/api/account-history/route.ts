import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTimeSeries, type Candle } from "@/lib/twelvedata";

const RANGES: Record<string, { interval: string; outputsize: number }> = {
  "1M": { interval: "1day", outputsize: 22 },
  "3M": { interval: "1day", outputsize: 66 },
  "6M": { interval: "1day", outputsize: 130 },
  "1Y": { interval: "1week", outputsize: 52 },
};

interface Txn {
  symbol: string | null;
  side: string;
  quantity: number;
  price: number;
  cash_delta: number;
  created_at: string;
}

// Replay the ledger up to (and including) `cutoff` to get cash + per-symbol qty.
function stateAt(txns: Txn[], cutoffMs: number) {
  let cash = 0;
  const qty: Record<string, number> = {};
  for (const t of txns) {
    if (new Date(t.created_at).getTime() > cutoffMs) break;
    if (t.side === "RESET") {
      cash = Number(t.cash_delta);
      for (const k of Object.keys(qty)) delete qty[k];
      continue;
    }
    cash += Number(t.cash_delta);
    if (t.symbol) {
      const d = t.side === "SELL" ? -Number(t.quantity) : Number(t.quantity);
      qty[t.symbol] = (qty[t.symbol] ?? 0) + d;
    }
  }
  return { cash, qty };
}

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

  // RLS ensures this only returns the account if the user owns it.
  const { data: account } = await supabase
    .from("accounts")
    .select("id, cash_balance, created_at")
    .eq("id", accountId)
    .single();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const { data: txnsRaw } = await supabase
    .from("transactions")
    .select("symbol, side, quantity, price, cash_delta, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  const txns = (txnsRaw ?? []) as Txn[];

  const { data: positions } = await supabase
    .from("positions")
    .select("symbol, quantity, avg_cost")
    .eq("account_id", accountId);

  // Historical prices for every symbol the account has ever touched.
  const symbols = Array.from(
    new Set(txns.filter((t) => t.symbol).map((t) => t.symbol as string))
  );
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const openingStr = dayOf(account.created_at);

  // Opening anchor: value right after account creation (cash + seeded holdings at cost).
  let openingValue = 0;
  for (const t of txns) {
    if (t.side !== "OPENING_BALANCE") continue;
    openingValue += Number(t.cash_delta);
    if (t.symbol) openingValue += Number(t.quantity) * Number(t.price);
  }

  // Now anchor: current cash + current holdings at the latest available close.
  let nowValue = Number(account.cash_balance);
  for (const p of (positions ?? []) as { symbol: string; quantity: number; avg_cost: number }[]) {
    const price = lastClose(p.symbol) ?? Number(p.avg_cost);
    nowValue += Number(p.quantity) * price;
  }

  // Intermediate daily points: market dates strictly between opening day and today.
  const dates = Array.from(
    new Set(symbols.flatMap((s) => (series[s] ?? []).map((c) => dayOf(c.datetime))))
  ).sort();

  const points: { datetime: string; value: number }[] = [];
  points.push({ datetime: account.created_at, value: openingValue });

  for (const dateStr of dates) {
    if (dateStr <= openingStr || dateStr >= todayStr) continue;
    const cutoff = new Date(`${dateStr}T23:59:59.999Z`).getTime();
    const st = stateAt(txns, cutoff);
    let value = st.cash;
    for (const sym of Object.keys(st.qty)) {
      if (st.qty[sym] !== 0) value += st.qty[sym] * closeAt(sym, dateStr);
    }
    points.push({ datetime: `${dateStr}T16:00:00Z`, value });
  }

  points.push({ datetime: new Date().toISOString(), value: nowValue });

  return NextResponse.json({ points });
}
