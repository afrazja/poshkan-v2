"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
