import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotes } from "@/lib/marketdata";

export const maxDuration = 60;

// Cron (daily, after US market close): record each account's value so the app
// builds a precise portfolio-performance history over time.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // End-of-day sweep: DAY limit orders that didn't fill this session expire.
  await db.from("orders").update({ status: "expired" }).eq("status", "pending").eq("time_in_force", "DAY");

  const [{ data: accounts }, { data: positions }] = await Promise.all([
    db.from("accounts").select("id, cash_balance"),
    db.from("positions").select("account_id, symbol, quantity, avg_cost"),
  ]);
  if (!accounts?.length) return NextResponse.json({ snapshots: 0 });

  const symbols = Array.from(new Set((positions ?? []).map((p) => p.symbol.toUpperCase())));
  const quotes = symbols.length ? await getQuotes(symbols) : {};
  const today = new Date().toISOString().slice(0, 10);

  const rows = accounts.map((a) => {
    const held = (positions ?? []).filter((p) => p.account_id === a.id);
    const holdingsValue = held.reduce((sum, p) => {
      const q = quotes[p.symbol.toUpperCase()];
      return sum + Number(p.quantity) * (q?.price ?? Number(p.avg_cost));
    }, 0);
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

  return NextResponse.json({ snapshots: rows.length, date: today });
}
