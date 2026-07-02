import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuotes } from "@/lib/marketdata";
import { floatingPnl } from "@/lib/forex";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";

interface Row {
  account_id: string;
  user_id: string;
  username: string;
  account_name: string;
  account_type: string;
  total_value: number;
  contributions: number;
  return_pct: number;
  as_of: string;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showAll = view === "all";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_leaderboard");
  const rows = (data ?? []) as Row[];

  // Re-price standings with LIVE market values (the RPC's values come from the
  // nightly snapshot / cost basis). Falls back silently if quotes are down.
  if (rows.length) {
    try {
      const admin = createAdminClient();
      const ids = rows.map((r) => r.account_id);
      const [{ data: accs }, { data: pos }, { data: fx }] = await Promise.all([
        admin.from("accounts").select("id, cash_balance").in("id", ids),
        admin.from("positions").select("account_id, symbol, quantity, avg_cost").in("account_id", ids),
        admin
          .from("fx_positions")
          .select("account_id, symbol, direction, units, open_rate, margin")
          .eq("status", "open")
          .in("account_id", ids),
      ]);
      const symbols = Array.from(
        new Set([
          ...(pos ?? []).map((p) => p.symbol.toUpperCase()),
          ...(fx ?? []).map((f) => f.symbol.toUpperCase()),
        ])
      );
      const quotes = symbols.length ? await getQuotes(symbols) : {};
      const cashById = new Map((accs ?? []).map((a) => [a.id, Number(a.cash_balance)]));

      for (const r of rows) {
        let value = cashById.get(r.account_id) ?? 0;
        for (const p of pos ?? []) {
          if (p.account_id !== r.account_id) continue;
          const q = quotes[p.symbol.toUpperCase()];
          value += Number(p.quantity) * (q?.price ?? Number(p.avg_cost));
        }
        for (const f of fx ?? []) {
          if (f.account_id !== r.account_id) continue;
          const q = quotes[f.symbol.toUpperCase()];
          value +=
            Number(f.margin) +
            (q ? floatingPnl(f.direction as "LONG" | "SHORT", Number(f.units), Number(f.open_rate), q.price, f.symbol) : 0);
        }
        r.total_value = value;
        r.return_pct =
          Number(r.contributions) > 0
            ? ((value - Number(r.contributions)) / Number(r.contributions)) * 100
            : 0;
      }
      rows.sort((a, b) => b.return_pct - a.return_pct || b.total_value - a.total_value);
    } catch {
      // SUPABASE_SERVICE_ROLE_KEY missing or quotes down — snapshot values still shown
    }
  }

  // Default view: one entry per trader (their best account), so the board shows
  // real competition instead of one user's account collection filling the top.
  const accountCount = new Map<string, number>();
  for (const r of rows) accountCount.set(r.user_id, (accountCount.get(r.user_id) ?? 0) + 1);
  let ranked = rows;
  if (!showAll) {
    const seen = new Set<string>();
    ranked = rows.filter((r) => {
      if (seen.has(r.user_id)) return false; // rows are sorted best-first
      seen.add(r.user_id);
      return true;
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🏆 Leaderboard</h1>
          <p className="text-sm text-muted">
            {showAll
              ? "All accounts ranked by % return on the money put in, at live market prices."
              : "Traders ranked by their best account's % return on the money put in, at live market prices."}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground hover:underline">
          ← Your accounts
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-1.5 text-xs">
        <Link
          href="/dashboard/leaderboard"
          className={`rounded-full border px-3 py-1 font-medium ${
            !showAll ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:text-foreground"
          }`}
        >
          Top per trader
        </Link>
        <Link
          href="/dashboard/leaderboard?view=all"
          className={`rounded-full border px-3 py-1 font-medium ${
            showAll ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:text-foreground"
          }`}
        >
          All accounts
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          The leaderboard isn&apos;t set up yet — run <code>supabase/leaderboard.sql</code> in the
          Supabase SQL editor.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No standings yet. Rankings appear once accounts have funded activity.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Trader</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 text-right font-medium">Return</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const mine = user && r.user_id === user.id;
                const others = (accountCount.get(r.user_id) ?? 1) - 1;
                return (
                  <tr
                    key={r.account_id}
                    className={`border-b border-border last:border-0 ${mine ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3 text-lg">{MEDALS[i] ?? <span className="text-sm text-muted">{i + 1}</span>}</td>
                    <td className="px-4 py-3 font-semibold">
                      {r.username}
                      {mine && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">you</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span>{r.account_name}</span>
                      <span className="ml-2 rounded-md bg-background px-2 py-0.5 text-xs capitalize text-muted">
                        {r.account_type}
                      </span>
                      {!showAll && others > 0 && (
                        <span className="ml-2 whitespace-nowrap text-xs text-muted">
                          best of {others + 1}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${changeColor(Number(r.return_pct))}`}>
                      {formatPercent(Number(r.return_pct))}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{formatCurrency(Number(r.total_value))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Return = (value − contributions) ÷ contributions, since each account&apos;s last reset.
          Values use live market prices.
        </p>
      )}
    </div>
  );
}
