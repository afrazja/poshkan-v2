"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assetTypeError } from "@/lib/assets";
import { backtestSmc } from "@/lib/smc-backtest";
import { backtestOte } from "@/lib/ote-backtest";
import { backtestTrend } from "@/lib/trend-backtest";
import { backtestMeanRev } from "@/lib/meanrev-backtest";
import { backtestCandleRange } from "@/lib/candlerange-backtest";

// Settings table per deterministic scanner; AI uses accounts.auto_trade_enabled.
const TABLES: Record<string, string> = {
  smc: "smc_settings",
  ote: "ote_settings",
  trend: "trend_settings",
  meanrev: "meanrev_settings",
  candlerange: "candlerange_settings",
};

// Freshest run across the user's ENABLED deterministic scanners (RLS scopes to
// the owner). Powers the live cron-health banner so it reflects reality without
// a page refresh. All scanners share one /api/cron/scanners ping.
export async function getScannerHealth(): Promise<{ lastRunAt: string | null; anyEnabled: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { lastRunAt: null, anyEnabled: false };

  const rows: { enabled?: boolean | null; last_run_at?: string | null }[] = [];
  await Promise.all(
    Object.values(TABLES).map(async (t) => {
      try {
        const { data } = await supabase.from(t).select("enabled, last_run_at");
        if (data) rows.push(...(data as typeof rows));
      } catch {
        // table not migrated yet — ignore
      }
    })
  );

  const enabled = rows.filter((r) => r.enabled);
  const runs = enabled.map((r) => r.last_run_at).filter(Boolean) as string[];
  return {
    lastRunAt: runs.length ? runs.sort().slice(-1)[0] : null,
    anyEnabled: enabled.length > 0,
  };
}

export interface ScannerCompareRow {
  key: string;
  name: string;
  icon: string;
  n: number;
  winRate: number;
  totalR: number;
  profitFactor: number; // -1 encodes ∞
  maxDrawdownR: number;
}

// Backtest ALL five deterministic scanners on the same symbols and return them
// ranked by net R — so the user can see which edge actually works on their list.
export async function compareScanners(input: {
  accountId: string;
  symbols: string[];
}): Promise<{ rows?: ScannerCompareRow[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized" };
  const { data: account } = await supabase
    .from("accounts")
    .select("type")
    .eq("id", input.accountId)
    .single();
  if (!account) return { error: "Account not found" };
  const type = (account.type as string) ?? "";

  const symbols = Array.from(
    new Set((input.symbols ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))
  )
    .filter((s) => assetTypeError(type, s) === null)
    .slice(0, 5); // cap for runtime — 5 backtests × symbols is heavy
  if (symbols.length === 0) return { error: "Pick at least one valid symbol to compare." };

  const defs = [
    { key: "smc", name: "SMC", icon: "📈", run: () => backtestSmc(symbols) },
    { key: "ote", name: "OTE", icon: "🎯", run: () => backtestOte(symbols) },
    { key: "trend", name: "Trend Breakout", icon: "🚀", run: () => backtestTrend(symbols) },
    { key: "meanrev", name: "Mean Reversion", icon: "↩️", run: () => backtestMeanRev(symbols) },
    { key: "candlerange", name: "Candle Range", icon: "📦", run: () => backtestCandleRange(symbols) },
  ];

  try {
    const rows = await Promise.all(
      defs.map(async (d): Promise<ScannerCompareRow> => {
        try {
          const r = await d.run();
          return {
            key: d.key,
            name: d.name,
            icon: d.icon,
            n: r.n,
            winRate: r.winRate,
            totalR: r.totalR,
            profitFactor: r.profitFactor,
            maxDrawdownR: r.maxDrawdownR,
          };
        } catch {
          return { key: d.key, name: d.name, icon: d.icon, n: 0, winRate: 0, totalR: 0, profitFactor: 0, maxDrawdownR: 0 };
        }
      })
    );
    rows.sort((a, b) => b.totalR - a.totalR);
    return { rows };
  } catch (e) {
    return { error: `Comparison failed: ${(e as Error).message}` };
  }
}

// Turn OFF a scanner for one account (RLS scopes the writes to the owner).
export async function deactivateScanner(
  accountId: string,
  scanner: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized" };

  const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).single();
  if (!account) return { error: "Not authorized" };

  if (scanner === "ai") {
    const { error } = await supabase
      .from("accounts")
      .update({ auto_trade_enabled: false })
      .eq("id", accountId);
    if (error) return { error: error.message };
  } else {
    const table = TABLES[scanner];
    if (!table) return { error: "Unknown scanner" };
    const { error } = await supabase.from(table).update({ enabled: false }).eq("account_id", accountId);
    if (error) return { error: error.message };
  }

  revalidatePath("/dashboard/scanners");
  return {};
}
