import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("get_leaderboard");
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🏆 Leaderboard</h1>
          <p className="text-sm text-muted">
            All accounts ranked by % return on the money put in. Updated with each nightly
            snapshot.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground hover:underline">
          ← Your accounts
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
              {rows.map((r, i) => {
                const mine = user && r.user_id === user.id;
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
          Values are from the latest nightly snapshot (new accounts use cost basis until their
          first snapshot).
        </p>
      )}
    </div>
  );
}
