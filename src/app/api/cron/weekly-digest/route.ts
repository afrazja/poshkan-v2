import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { symbolLabel } from "@/lib/assets";
import { unsubSignature } from "@/lib/digest";

export const maxDuration = 60;

// Weekly digest email — "your Poshkan week" per user. Trigger Mondays via the
// external pinger: /api/cron/weekly-digest?key=<CRON_SECRET>
// Sends through Resend's REST API; without RESEND_API_KEY it reports and does
// nothing, so the route can ship before the email account exists.
//
// Opt-out lives in email_prefs (user_id uuid pk, weekly_digest bool). If the
// table doesn't exist yet, everyone is treated as subscribed — run:
//   create table email_prefs (
//     user_id uuid primary key references auth.users(id) on delete cascade,
//     weekly_digest boolean not null default true
//   );
//   alter table email_prefs enable row level security;

const DAY = 86_400_000;
const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

interface WeekStats {
  closed: { symbol: string; direction: string; pnl: number }[];
  opened: number;
  stockTrades: number;
  signals: number;
  equityNow: number;
  equityThen: number | null;
}

function digestHtml(stats: WeekStats, unsubUrl: string): string {
  const pnl = stats.closed.reduce((s, t) => s + t.pnl, 0);
  const wins = stats.closed.filter((t) => t.pnl > 0).length;
  const change = stats.equityThen != null && stats.equityThen > 0
    ? ((stats.equityNow - stats.equityThen) / stats.equityThen) * 100
    : null;
  const best = [...stats.closed].sort((a, b) => b.pnl - a.pnl)[0];
  const active = stats.closed.length + stats.opened + stats.stockTrades + stats.signals > 0;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#8b8b96;font-size:13px">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px">${value}</td></tr>`;

  return `
  <div style="max-width:520px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#101014;color:#ececf1;border-radius:14px;padding:28px">
    <h1 style="margin:0;font-size:18px">Your Poshkan week</h1>
    <p style="margin:6px 0 18px;color:#8b8b96;font-size:13px">${
      active
        ? "Here's how your paper trading went over the last 7 days."
        : "Quiet week — no trades or signals. Turn on a scanner and let it hunt setups for you."
    }</p>
    <table style="width:100%;border-collapse:collapse">
      ${row("Portfolio value", money(stats.equityNow))}
      ${change != null ? row("Week change", `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`) : ""}
      ${row("Trades closed", `${stats.closed.length}${stats.closed.length ? ` (${wins} wins)` : ""}`)}
      ${stats.closed.length ? row("Realized P&L", money(pnl)) : ""}
      ${best && best.pnl > 0 ? row("Best trade", `${best.direction} ${symbolLabel(best.symbol)} ${money(best.pnl)}`) : ""}
      ${row("Positions opened", String(stats.opened + stats.stockTrades))}
      ${row("Scanner signals", String(stats.signals))}
    </table>
    <a href="https://www.poshkan.com/dashboard"
       style="display:inline-block;margin-top:20px;background:#6d5df6;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px">
      Open your dashboard →
    </a>
    <p style="margin-top:24px;font-size:11px;color:#8b8b96">
      Paper trading only — nothing here is financial advice.<br/>
      <a href="${unsubUrl}" style="color:#8b8b96">Unsubscribe from this weekly email</a>
    </p>
  </div>`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(request.url).searchParams.get("key");
  const authed = !!secret && (request.headers.get("authorization") === `Bearer ${secret}` || key === secret);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ skipped: "RESEND_API_KEY not set" });
  const from = process.env.DIGEST_FROM || "Poshkan <onboarding@resend.dev>";

  const db = createAdminClient();
  const d7 = new Date(Date.now() - 7 * DAY).toISOString();
  const d8date = new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10);

  const [usersRes, { data: accounts }, { data: snaps }, { data: closed }, { data: opened }, { data: stockTx }] =
    await Promise.all([
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      db.from("accounts").select("id, user_id, cash_balance"),
      db
        .from("account_snapshots")
        .select("account_id, snapshot_date, total_value")
        .gte("snapshot_date", d8date)
        .order("snapshot_date", { ascending: true }),
      db
        .from("fx_positions")
        .select("account_id, symbol, direction, pnl")
        .neq("status", "open")
        .gte("closed_at", d7),
      db.from("fx_positions").select("account_id").gte("opened_at", d7),
      db.from("transactions").select("account_id").in("side", ["BUY", "SELL"]).gte("created_at", d7),
    ]);

  // Signal volume per account across every scanner.
  const signalTables: Array<[string, string]> = [
    ["smc_signals", "created_at"],
    ["ote_signals", "created_at"],
    ["trend_signals", "created_at"],
    ["meanrev_signals", "created_at"],
    ["candlerange_signals", "created_at"],
    ["fx_scan_alerts", "alerted_at"],
  ];
  const signalRows = (
    await Promise.all(
      signalTables.map(([t, col]) => db.from(t).select("account_id").gte(col, d7).then((r) => r.data ?? []))
    )
  ).flat();

  // Opt-outs (missing table → nobody has opted out yet).
  const unsubscribed = new Set<string>();
  try {
    const { data: prefs } = await db.from("email_prefs").select("user_id, weekly_digest");
    for (const p of prefs ?? []) if (p.weekly_digest === false) unsubscribed.add(p.user_id as string);
  } catch {}

  // Earliest + latest snapshot per account inside the window.
  const firstSnap = new Map<string, number>();
  const lastSnap = new Map<string, number>();
  for (const s of snaps ?? []) {
    const id = s.account_id as string;
    if (!firstSnap.has(id)) firstSnap.set(id, Number(s.total_value));
    lastSnap.set(id, Number(s.total_value));
  }

  const users = usersRes.data?.users ?? [];
  let sent = 0;
  let failed = 0;

  for (const u of users) {
    if (!u.email || unsubscribed.has(u.id)) continue;
    const mine = (accounts ?? []).filter((a) => a.user_id === u.id);
    if (mine.length === 0) continue;
    const ids = new Set(mine.map((a) => a.id as string));

    const stats: WeekStats = {
      closed: (closed ?? [])
        .filter((t) => ids.has(t.account_id as string))
        .map((t) => ({ symbol: t.symbol as string, direction: t.direction as string, pnl: Number(t.pnl ?? 0) })),
      opened: (opened ?? []).filter((t) => ids.has(t.account_id as string)).length,
      stockTrades: (stockTx ?? []).filter((t) => ids.has(t.account_id as string)).length,
      signals: signalRows.filter((r) => ids.has(r.account_id as string)).length,
      equityNow: mine.reduce((s, a) => s + (lastSnap.get(a.id as string) ?? Number(a.cash_balance)), 0),
      equityThen: mine.some((a) => firstSnap.has(a.id as string))
        ? mine.reduce((s, a) => s + (firstSnap.get(a.id as string) ?? Number(a.cash_balance)), 0)
        : null,
    };

    const pnl = stats.closed.reduce((s, t) => s + t.pnl, 0);
    const subject = stats.closed.length
      ? `Your Poshkan week: ${money(pnl)} across ${stats.closed.length} trade${stats.closed.length === 1 ? "" : "s"}`
      : "Your Poshkan week";
    const unsubUrl = `https://www.poshkan.com/api/digest/unsubscribe?u=${u.id}&sig=${unsubSignature(u.id)}`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: u.email, subject, html: digestHtml(stats, unsubUrl) }),
      });
      if (res.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ users: users.length, sent, failed, optedOut: unsubscribed.size });
}
