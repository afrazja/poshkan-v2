import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotes, getOhlc } from "@/lib/marketdata";
import { bracketHit, floatingPnl, marginFor, clampTradeLeverage } from "@/lib/forex";
import { sendEmail, alertEmailHtml } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import { symbolLabel } from "@/lib/assets";

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
      db.from("fx_orders").select("*").eq("status", "pending"),
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

  // Wick-aware triggers. A cron only sees prices when it runs, so comparing a
  // resting level against spot-at-run-time misses anything the price touched and
  // retraced from between runs — the "hit my TP but never closed" bug. Pull the
  // recent candle range for every symbol in play instead, so a level the wick
  // reached still fires. Covers open positions, brackets AND resting orders.
  const ranges: Record<string, { high: number; low: number }> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const cs = await getOhlc(sym, "5min", 6); // ~last 30 min, including the live bar
        if (cs.length) {
          ranges[sym] = {
            high: Math.max(...cs.map((c) => c.high)),
            low: Math.min(...cs.map((c) => c.low)),
          };
        }
      } catch {
        // no candles for this symbol — falls back to spot-only below
      }
    })
  );

  // The band a symbol actually traded through: recent candles widened to include
  // the live price. A resting level inside it was hit. Fills happen AT the level,
  // never at the extreme of the wick — a real resting order gets its own price,
  // not the best tick of the spike.
  const rangeFor = (symbol: string, spot: number) => {
    const r = ranges[symbol.toUpperCase()];
    return { hi: Math.max(r?.high ?? spot, spot), lo: Math.min(r?.low ?? spot, spot) };
  };

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
    const entry = Number(o.entry_rate);
    const { hi, lo } = rangeFor(o.symbol, q.price);
    const meets = o.trigger_when === "AT_OR_BELOW" ? lo <= entry : hi >= entry;
    if (!meets) continue;
    // Per-trade leverage stored on the order (defaults to 1× if unset).
    const lev = clampTradeLeverage((o as { leverage?: number }).leverage);
    const { error } = await db.rpc("fx_open", {
      p_account_id: o.account_id,
      p_symbol: o.symbol,
      p_direction: o.direction,
      p_units: Number(o.units),
      p_rate: entry,
      p_margin: marginFor(Number(o.units), entry, lev, o.symbol),
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
      .update({ status: "filled", filled_at: new Date().toISOString(), filled_rate: entry })
      .eq("id", o.id)
      .eq("status", "pending");
    fxFilled++;

    const ownerId = await ownerOfAccount(o.account_id);
    if (ownerId) {
      void sendPushToUser(ownerId, {
        title: `✅ Forex filled: ${o.direction} ${fmtPair(o.symbol)}`,
        body:
          `${Number(o.units).toLocaleString()} units @ ${fmtRate(entry)}` +
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
    const level = Number(l.price);
    const { hi, lo } = rangeFor(info.symbol ?? "", q.price);
    const meets = info.direction === "LONG" ? hi >= level : lo <= level;
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
      p_rate: level,
      p_reason: "tp",
    });
    if (!error) {
      fxTp++;
      const ownerId = info.account_id ? await ownerOfAccount(info.account_id) : null;
      if (ownerId) {
        void sendPushToUser(ownerId, {
          title: `🎯 Take-profit (partial): ${fmtPair(info.symbol ?? "")}`,
          body: `Closed ${Number(l.close_units).toLocaleString()} units @ ${fmtRate(level)}`,
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
    // Margin stop-out on the live price; otherwise a TP/SL the recent candle
    // range (or the live price) touched — filled at the level (bracket behaviour).
    const floating = floatingPnl(p.direction, Number(p.units), Number(p.open_rate), q.price, p.symbol);
    let reason: "stopped" | "sl" | "tp" | null = null;
    let fill = q.price;
    if (floating <= -Number(p.margin)) {
      reason = "stopped";
    } else {
      const { hi, lo } = rangeFor(p.symbol, q.price);
      const b = bracketHit(p, hi, lo);
      if (b) {
        reason = b.reason;
        fill = b.fill;
      }
    }
    if (!reason) continue;
    const { error } = await db.rpc("fx_close", {
      p_position_id: p.id,
      p_rate: fill,
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
          body: `${Number(p.units).toLocaleString()} units ${p.direction} closed @ ${fmtRate(fill)} · P&L ${fmtUsd(pnl)}`,
        });
      }
    }
  }

  for (const o of orders ?? []) {
    const q = quotes[o.symbol.toUpperCase()];
    if (!q?.price) continue;
    const limit = Number(o.limit_price);
    const { hi, lo } = rangeFor(o.symbol, q.price);
    const meets = o.side === "BUY" ? lo <= limit : hi >= limit;
    if (!meets) continue;
    const { data } = await db.rpc("system_fill_order", { p_order_id: o.id, p_price: limit });
    if (data === "filled") {
      filled++;
      const ownerId = (o as { accounts?: { user_id?: string } }).accounts?.user_id;
      if (ownerId) {
        void sendPushToUser(ownerId, {
          title: `✅ Order filled: ${o.side} ${symbolLabel(o.symbol)}`,
          body: `${Number(o.quantity)} ${symbolLabel(o.symbol)} @ $${limit.toFixed(2)}`,
        });
      }
    }
  }

  for (const a of alerts ?? []) {
    const q = quotes[a.symbol.toUpperCase()];
    if (!q?.price) continue;
    const target = Number(a.target_price);
    const { hi, lo } = rangeFor(a.symbol, q.price);
    // An alert the price touched and retraced from still fired — the user asked
    // to be told when it got there, not whether it stayed.
    const hit = a.condition === "ABOVE" ? hi >= target : lo <= target;
    if (!hit) continue;
    const { data: claimed, error } = await db
      .from("alerts")
      .update({ status: "triggered", triggered_at: new Date().toISOString(), triggered_price: target })
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
          `🔔 ${symbolLabel(a.symbol)} ${a.condition === "ABOVE" ? "rose to" : "dropped to"} $${target.toFixed(2)}`,
          alertEmailHtml({
            symbol: a.symbol,
            condition: a.condition as "ABOVE" | "BELOW",
            targetPrice: target,
            triggeredPrice: target,
            appUrl: new URL(request.url).origin,
          })
        );
      }
    } catch {
      // email failure must never break the cron
    }
    void sendPushToUser(a.user_id, {
      title: `🔔 ${symbolLabel(a.symbol)} alert`,
      body: `${symbolLabel(a.symbol)} ${a.condition === "ABOVE" ? "rose to" : "dropped to"} $${target.toFixed(2)} · now $${q.price.toFixed(2)}`,
    });
  }

  return NextResponse.json({ filled, triggered, stopped, fxFilled, fxTp, checked: symbols.length });
}
