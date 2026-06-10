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
  const [{ data: orders }, { data: alerts }, { data: fxPositions }] = await Promise.all([
    db.from("orders").select("id, symbol, side, limit_price").eq("status", "pending"),
    db.from("alerts").select("id, symbol, condition, target_price").eq("status", "active"),
    db.from("fx_positions").select("id, symbol, direction, units, open_rate, margin").eq("status", "open"),
  ]);

  const symbols = Array.from(
    new Set(
      [...(orders ?? []), ...(alerts ?? []), ...(fxPositions ?? [])].map((r) =>
        r.symbol.toUpperCase()
      )
    )
  );
  if (symbols.length === 0) return NextResponse.json({ filled: 0, triggered: 0, stopped: 0 });

  const quotes = await getQuotes(symbols);
  let filled = 0;
  let triggered = 0;
  let stopped = 0;

  // Forex stop-out: auto-close positions whose floating loss has consumed the margin.
  for (const p of fxPositions ?? []) {
    const q = quotes[p.symbol.toUpperCase()];
    if (!q?.price) continue;
    const raw = (q.price - Number(p.open_rate)) * Number(p.units);
    const floating = p.direction === "SHORT" ? -raw : raw;
    if (floating > -Number(p.margin)) continue;
    const { error } = await db.rpc("fx_close", {
      p_position_id: p.id,
      p_rate: q.price,
      p_stopped: true,
    });
    if (!error) stopped++;
  }

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

  return NextResponse.json({ filled, triggered, stopped, checked: symbols.length });
}
