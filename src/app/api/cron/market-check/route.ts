import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotes } from "@/lib/marketdata";
import { autoCloseReason, marginFor } from "@/lib/forex";
import { sendEmail, alertEmailHtml } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

// Display helpers for forex push notifications.
const fmtPair = (s: string) => s.replace(/=X$/i, "");
const fmtRate = (p: number) => (p >= 20 ? p.toFixed(3) : p.toFixed(5)); // JPY pairs vs majors
const fmtUsd = (n: number) => (n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`);

// Cron: fill pending limit orders and trigger price alerts, server-side.
// Secured with CRON_SECRET (Vercel cron sends it automatically; external
// pingers must send "Authorization: Bearer <CRON_SECRET>").
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Accept the secret via Bearer header OR ?key= — the query param survives an
  // apex→www (308) redirect, which strips the Authorization header.
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Resolve an account's owning user (for push), cached within this run.
  const ownerCache = new Map<string, string | null>();
  const ownerOfAccount = async (accountId: string): Promise<string | null> => {
    if (ownerCache.has(accountId)) return ownerCache.get(accountId) ?? null;
    const { data } = await db.from("accounts").select("user_id").eq("id", accountId).single();
    const uid = (data?.user_id as string | undefined) ?? null;
    ownerCache.set(accountId, uid);
    return uid;
  };
  const [{ data: orders }, { data: alerts }, { data: fxPositions }, { data: fxOrders }, { data: fxTpLevels }] =
    await Promise.all([
      db
        .from("orders")
        .select("id, symbol, side, quantity, limit_price, accounts(user_id)")
        .eq("status", "pending"),
      db.from("alerts").select("id, user_id, symbol, condition, target_price").eq("status", "active"),
      db
        .from("fx_positions")
        .select("id, account_id, symbol, direction, units, open_rate, margin, stop_loss, take_profit, auto_close_at")
        .eq("status", "open"),
      db.from("fx_orders").select("*, accounts(leverage)").eq("status", "pending"),
      db
        .from("fx_tp_levels")
        .select("id, price, close_units, position_id, fx_positions(symbol, direction, status, account_id)")
        .eq("status", "pending"),
    ]);

  const symbols = Array.from(
    new Set(
      [...(orders ?? []), ...(alerts ?? []), ...(fxPositions ?? []), ...(fxOrders ?? [])].map(
        (r) => r.symbol.toUpperCase()
      )
    )
  );
  if (symbols.length === 0) {
    return NextResponse.json({ filled: 0, triggered: 0, stopped: 0, fxFilled: 0 });
  }

  const quotes = await getQuotes(symbols);
  let filled = 0;
  let triggered = 0;
  let stopped = 0;

  // Forex pending entry orders: expire, then fill when the rate hits the trigger.
  let fxFilled = 0;
  const now = Date.now();
  for (const o of fxOrders ?? []) {
    if (o.expires_at && new Date(o.expires_at).getTime() <= now) {
      await db.from("fx_orders").update({ status: "expired" }).eq("id", o.id).eq("status", "pending");
      continue;
    }
    const q = quotes[o.symbol.toUpperCase()];
    if (!q?.price) continue;
    const meets =
      o.trigger_when === "AT_OR_BELOW" ? q.price <= Number(o.entry_rate) : q.price >= Number(o.entry_rate);
    if (!meets) continue;
    const acc = o.accounts as { leverage?: number } | { leverage?: number }[] | null;
    const lev = Array.isArray(acc) ? acc[0]?.leverage : acc?.leverage;
    const { error } = await db.rpc("fx_open", {
      p_account_id: o.account_id,
      p_symbol: o.symbol,
      p_direction: o.direction,
      p_units: Number(o.units),
      p_rate: q.price,
      p_margin: marginFor(Number(o.units), q.price, lev, o.symbol),
      p_stop_loss: o.stop_loss,
      p_take_profit: o.take_profit,
    });
    if (error) {
      // Insufficient margin or gap-invalidated SL/TP — cancel so it stops retrying.
      await db.from("fx_orders").update({ status: "canceled" }).eq("id", o.id).eq("status", "pending");
      continue;
    }
    await db
      .from("fx_orders")
      .update({ status: "filled", filled_at: new Date().toISOString(), filled_rate: q.price })
      .eq("id", o.id)
      .eq("status", "pending");
    fxFilled++;

    const ownerId = await ownerOfAccount(o.account_id);
    if (ownerId) {
      void sendPushToUser(ownerId, {
        title: `✅ Forex filled: ${o.direction} ${fmtPair(o.symbol)}`,
        body:
          `${Number(o.units).toLocaleString()} units @ ${fmtRate(q.price)}` +
          (o.stop_loss ? ` · SL ${fmtRate(Number(o.stop_loss))}` : "") +
          (o.take_profit ? ` · TP ${fmtRate(Number(o.take_profit))}` : ""),
      });
    }
  }

  // Forex scaled take-profit: partial-close a position as each level is hit.
  let fxTp = 0;
  for (const l of fxTpLevels ?? []) {
    const raw = l.fx_positions as { symbol?: string; direction?: string; status?: string; account_id?: string } | { symbol?: string; direction?: string; status?: string; account_id?: string }[] | null;
    const info = Array.isArray(raw) ? raw[0] : raw;
    if (!info || info.status !== "open") continue;
    const q = quotes[(info.symbol ?? "").toUpperCase()];
    if (!q?.price) continue;
    const meets = info.direction === "LONG" ? q.price >= Number(l.price) : q.price <= Number(l.price);
    if (!meets) continue;
    const { data: claimed } = await db
      .from("fx_tp_levels")
      .update({ status: "filled", filled_at: new Date().toISOString() })
      .eq("id", l.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    const { error } = await db.rpc("fx_close_partial", {
      p_position_id: l.position_id,
      p_close_units: Number(l.close_units),
      p_rate: q.price,
      p_reason: "tp",
    });
    if (!error) {
      fxTp++;
      const ownerId = info.account_id ? await ownerOfAccount(info.account_id) : null;
      if (ownerId) {
        void sendPushToUser(ownerId, {
          title: `🎯 Take-profit (partial): ${fmtPair(info.symbol ?? "")}`,
          body: `Closed ${Number(l.close_units).toLocaleString()} units @ ${fmtRate(q.price)}`,
        });
      }
    }
  }

  // Forex auto-close: timed exit, then margin stop-out / stop-loss / take-profit.
  for (const p of fxPositions ?? []) {
    const q = quotes[p.symbol.toUpperCase()];
    if (!q?.price) continue;
    // Timed auto-close (close at market once the timer passes).
    if ((p as { auto_close_at?: string | null }).auto_close_at &&
        new Date((p as { auto_close_at: string }).auto_close_at).getTime() <= now) {
      const { error } = await db.rpc("fx_close", { p_position_id: p.id, p_rate: q.price, p_reason: "closed" });
      if (!error) {
        stopped++;
        const ownerId = await ownerOfAccount(p.account_id);
        if (ownerId) {
          const { data: closed } = await db.from("fx_positions").select("pnl").eq("id", p.id).single();
          void sendPushToUser(ownerId, {
            title: `⏲️ Auto-close (timer): ${fmtPair(p.symbol)}`,
            body: `${Number(p.units).toLocaleString()} units ${p.direction} closed @ ${fmtRate(q.price)} · P&L ${fmtUsd(Number(closed?.pnl ?? 0))}`,
          });
        }
      }
      continue;
    }
    const reason = autoCloseReason(p, q.price);
    if (!reason) continue;
    const { error } = await db.rpc("fx_close", {
      p_position_id: p.id,
      p_rate: q.price,
      p_reason: reason,
    });
    if (!error) {
      stopped++;
      const ownerId = await ownerOfAccount(p.account_id);
      if (ownerId) {
        const { data: closed } = await db.from("fx_positions").select("pnl").eq("id", p.id).single();
        const pnl = Number(closed?.pnl ?? 0);
        const label =
          reason === "tp" ? "🎯 Take-profit hit" : reason === "sl" ? "🛑 Stop-loss hit" : "⚠️ Margin stop-out";
        void sendPushToUser(ownerId, {
          title: `${label}: ${fmtPair(p.symbol)}`,
          body: `${Number(p.units).toLocaleString()} units ${p.direction} closed @ ${fmtRate(q.price)} · P&L ${fmtUsd(pnl)}`,
        });
      }
    }
  }

  for (const o of orders ?? []) {
    const q = quotes[o.symbol.toUpperCase()];
    if (!q?.price) continue;
    const meets =
      o.side === "BUY" ? q.price <= Number(o.limit_price) : q.price >= Number(o.limit_price);
    if (!meets) continue;
    const { data } = await db.rpc("system_fill_order", { p_order_id: o.id, p_price: q.price });
    if (data === "filled") {
      filled++;
      const ownerId = (o as { accounts?: { user_id?: string } }).accounts?.user_id;
      if (ownerId) {
        void sendPushToUser(ownerId, {
          title: `✅ Order filled: ${o.side} ${o.symbol}`,
          body: `${Number(o.quantity)} ${o.symbol} @ $${q.price.toFixed(2)} (limit $${Number(o.limit_price).toFixed(2)})`,
        });
      }
    }
  }

  for (const a of alerts ?? []) {
    const q = quotes[a.symbol.toUpperCase()];
    if (!q?.price) continue;
    const hit =
      a.condition === "ABOVE" ? q.price >= Number(a.target_price) : q.price <= Number(a.target_price);
    if (!hit) continue;
    const { data: claimed, error } = await db
      .from("alerts")
      .update({ status: "triggered", triggered_at: new Date().toISOString(), triggered_price: q.price })
      .eq("id", a.id)
      .eq("status", "active")
      .select("id");
    if (error || !claimed?.length) continue;
    triggered++;

    // Email the owner (best-effort — the dashboard banner is the source of truth).
    try {
      const { data: u } = await db.auth.admin.getUserById(a.user_id);
      const email = u?.user?.email;
      if (email) {
        await sendEmail(
          email,
          `🔔 ${a.symbol} ${a.condition === "ABOVE" ? "rose to" : "dropped to"} $${q.price.toFixed(2)}`,
          alertEmailHtml({
            symbol: a.symbol,
            condition: a.condition as "ABOVE" | "BELOW",
            targetPrice: Number(a.target_price),
            triggeredPrice: q.price,
            appUrl: new URL(request.url).origin,
          })
        );
      }
    } catch {
      // email failure must never break the cron
    }
    void sendPushToUser(a.user_id, {
      title: `🔔 ${a.symbol} alert`,
      body: `${a.symbol} ${a.condition === "ABOVE" ? "rose to" : "dropped to"} $${q.price.toFixed(2)} (target $${Number(a.target_price).toFixed(2)})`,
    });
  }

  return NextResponse.json({ filled, triggered, stopped, fxFilled, fxTp, checked: symbols.length });
}
