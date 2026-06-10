import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotes } from "@/lib/marketdata";

export const maxDuration = 60;

// Cron: fill pending limit orders and trigger price alerts, server-side.
// Secured with CRON_SECRET (Vercel cron sends it automatically; external
// pingers must send "Authorization: Bearer <CRON_SECRET>").
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const [{ data: orders }, { data: alerts }] = await Promise.all([
    db.from("orders").select("id, symbol, side, limit_price").eq("status", "pending"),
    db.from("alerts").select("id, symbol, condition, target_price").eq("status", "active"),
  ]);

  const symbols = Array.from(
    new Set([...(orders ?? []), ...(alerts ?? [])].map((r) => r.symbol.toUpperCase()))
  );
  if (symbols.length === 0) return NextResponse.json({ filled: 0, triggered: 0 });

  const quotes = await getQuotes(symbols);
  let filled = 0;
  let triggered = 0;

  for (const o of orders ?? []) {
    const q = quotes[o.symbol.toUpperCase()];
    if (!q?.price) continue;
    const meets =
      o.side === "BUY" ? q.price <= Number(o.limit_price) : q.price >= Number(o.limit_price);
    if (!meets) continue;
    const { data } = await db.rpc("system_fill_order", { p_order_id: o.id, p_price: q.price });
    if (data === "filled") filled++;
  }

  for (const a of alerts ?? []) {
    const q = quotes[a.symbol.toUpperCase()];
    if (!q?.price) continue;
    const hit =
      a.condition === "ABOVE" ? q.price >= Number(a.target_price) : q.price <= Number(a.target_price);
    if (!hit) continue;
    const { error } = await db
      .from("alerts")
      .update({ status: "triggered", triggered_at: new Date().toISOString(), triggered_price: q.price })
      .eq("id", a.id)
      .eq("status", "active");
    if (!error) triggered++;
  }

  return NextResponse.json({ filled, triggered, checked: symbols.length });
}
