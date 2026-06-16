import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotes } from "@/lib/marketdata";
import { floatingPnl } from "@/lib/forex";

export const runtime = "nodejs";

interface LbRow {
  account_id: string;
  username: string;
  account_name: string;
  account_type: string;
  contributions: number;
  return_pct: number;
}

// Generates a 1200×630 shareable results card (PNG) for an account.
export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get("account") ?? "";

  let username = "A trader";
  let accountLabel = "Paper portfolio";
  let returnPct = 0;
  let value = 0;

  try {
    const admin = createAdminClient();
    const { data: lb } = await admin.rpc("get_leaderboard");
    const row = ((lb ?? []) as LbRow[]).find((r) => r.account_id === accountId);
    if (row) {
      username = row.username || username;
      accountLabel = `${row.account_name} · ${row.account_type}`;
      const [{ data: acc }, { data: pos }, { data: fx }] = await Promise.all([
        admin.from("accounts").select("cash_balance").eq("id", accountId).single(),
        admin.from("positions").select("symbol, quantity, avg_cost").eq("account_id", accountId),
        admin
          .from("fx_positions")
          .select("symbol, direction, units, open_rate, margin")
          .eq("account_id", accountId)
          .eq("status", "open"),
      ]);
      const symbols = Array.from(
        new Set([
          ...(pos ?? []).map((p) => p.symbol.toUpperCase()),
          ...(fx ?? []).map((f) => f.symbol.toUpperCase()),
        ])
      );
      const quotes = symbols.length ? await getQuotes(symbols) : {};
      value = Number(acc?.cash_balance ?? 0);
      for (const p of pos ?? []) {
        const q = quotes[p.symbol.toUpperCase()];
        value += Number(p.quantity) * (q?.price ?? Number(p.avg_cost));
      }
      for (const f of fx ?? []) {
        const q = quotes[f.symbol.toUpperCase()];
        value +=
          Number(f.margin) +
          (q ? floatingPnl(f.direction as "LONG" | "SHORT", Number(f.units), Number(f.open_rate), q.price, f.symbol) : 0);
      }
      const contrib = Number(row.contributions);
      returnPct = contrib > 0 ? ((value - contrib) / contrib) * 100 : 0;
    }
  } catch {
    // leaderboard not migrated / quotes down — render a generic card
  }

  const up = returnPct >= 0;
  const pctStr = `${up ? "+" : ""}${returnPct.toFixed(2)}%`;
  const valStr = `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const accent = up ? "#4ade80" : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 55%, #1e3a8a 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "40px", fontWeight: 800 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.15)",
            }}
          >
            P
          </div>
          Poshkan
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "30px", color: "rgba(255,255,255,0.85)" }}>
            {username}&apos;s paper-trading return
          </div>
          <div style={{ display: "flex", fontSize: "150px", fontWeight: 800, color: accent, lineHeight: 1.05 }}>
            {pctStr}
          </div>
          <div style={{ display: "flex", fontSize: "34px", color: "rgba(255,255,255,0.9)" }}>
            {accountLabel} · {valStr} virtual
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "30px", color: "rgba(255,255,255,0.85)" }}>
          Practice stocks, crypto &amp; forex free at poshkan.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
