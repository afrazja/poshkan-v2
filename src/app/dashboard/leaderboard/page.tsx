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
// Past this many entries the board switches from "show everyone" to
// top-20 + your own rank pinned below — keeps the page fast at any scale.
const LIMIT = 20;

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

  // Rank everyone on the RPC's snapshot-based values first (cheap, uniform),
  // then live-reprice only the rows we actually display.
  rows.sort((a, b) => b.return_pct - a.return_pct || b.total_value - a.total_value);

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

  const total = ranked.length;
  const big = total > LIMIT;
  const top = big ? ranked.slice(0, LIMIT) : ranked;

  // The viewer's best entry in this ranking, and (when outside the top) the
  // neighbors just above/below it — a target to overtake beats a lone number.
  const viewerIdx = user ? ranked.findIndex((r) => r.user_id === user.id) : -1;
  let neighbors: Row[] = [];
  if (big && viewerIdx >= LIMIT) {
    const start = Math.max(LIMIT, viewerIdx - 1);
    neighbors = ranked.slice(start, Math.min(total, viewerIdx + 2));
  }
  // Snapshot-order ranks, captured before live repricing shuffles the top block.
  const snapRank = new Map<string, number>();
  ranked.forEach((r, i) => snapRank.set(r.account_id, i + 1));

  // Re-price the DISPLAYED rows with live market values (the RPC's values come
  // from the nightly snapshot / cost basis). Falls back silently if quotes are down.
  const priceRows = [...top, ...neighbors];
  if (priceRows.length) {
    try {
      const admin = createAdminClient();
      const ids = priceRows.map((r) => r.account_id);
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

      for (const r of priceRows) {
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
      // Repricing can shuffle the visible leaders — re-sort them among themselves.
      top.sort((a, b) => b.return_pct - a.return_pct || b.total_value - a.total_value);
    } catch {
      // SUPABASE_SERVICE_ROLE_KEY missing or quotes down — snapshot values still shown
    }
  }

  // Viewer's rank for the caption: live position if visible in the top block,
  // otherwise the snapshot rank.
  let viewerRank: number | null = null;
  if (user && viewerIdx >= 0) {
    const inTop = top.findIndex((r) => r.user_id === user.id);
    viewerRank = inTop >= 0 ? inTop + 1 : viewerIdx + 1;
  }
  const percentile = viewerRank ? Math.max(1, Math.ceil((viewerRank / total) * 100)) : null;
  const entryNoun = showAll ? "accounts" : "traders";

  const renderRow = (r: Row, rank: number) => {
    const mine = user && r.user_id === user.id;
    const others = (accountCount.get(r.user_id) ?? 1) - 1;
    return (
      <tr
        key={r.account_id}
        className={`border-b border-border last:border-0 ${mine ? "bg-primary/5" : ""}`}
      >
        <td className="px-4 py-3 text-lg">
          {MEDALS[rank - 1] ?? <span className="text-sm text-muted">{rank}</span>}
        </td>
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
            <span className="ml-2 whitespace-nowrap text-xs text-muted">best of {others + 1}</span>
          )}
        </td>
        <td className={`px-4 py-3 text-right font-semibold ${changeColor(Number(r.return_pct))}`}>
          {formatPercent(Number(r.return_pct))}
        </td>
        <td className="px-4 py-3 text-right text-muted">{formatCurrency(Number(r.total_value))}</td>
      </tr>
    );
  };

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
      ) : total === 0 ? (
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
              {top.map((r, i) => renderRow(r, i + 1))}
              {neighbors.length > 0 && (
                <>
                  <tr className="border-b border-border">
                    <td colSpan={5} className="px-4 py-1.5 text-center text-muted">
                      ···
                    </td>
                  </tr>
                  {neighbors.map((r) => renderRow(r, snapRank.get(r.account_id) ?? 0))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {big && viewerRank && percentile && (
        <p className="mt-3 text-sm font-medium">
          Your best account ranks <span className="text-primary">#{viewerRank}</span> of{" "}
          {total.toLocaleString("en-US")} {entryNoun} · top {percentile}%
        </p>
      )}

      {total > 0 && (
        <p className="mt-3 text-xs text-muted">
          Return = (value − contributions) ÷ contributions, since each account&apos;s last reset.
          {big
            ? ` Showing the top ${LIMIT} of ${total.toLocaleString("en-US")} ${entryNoun}; visible rows use live market prices.`
            : " Values use live market prices."}
        </p>
      )}
    </div>
  );
}
