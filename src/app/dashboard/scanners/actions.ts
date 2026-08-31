"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Freshest run across whatever the user actually has running — live custom
// strategies carry their own last_run_at, and the AI scanner is flagged on the
// account itself. Powers the live cron-health banner without a page refresh.
// Everything shares one /api/cron/scanners ping.
export async function getScannerHealth(): Promise<{ lastRunAt: string | null; anyEnabled: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { lastRunAt: null, anyEnabled: false };

  let lastRunAt: string | null = null;
  let anyEnabled = false;

  try {
    const { data } = await supabase
      .from("custom_strategies")
      .select("status, last_run_at")
      .eq("status", "live");
    const rows = (data ?? []) as { last_run_at?: string | null }[];
    if (rows.length) anyEnabled = true;
    const runs = rows.map((r) => r.last_run_at).filter(Boolean) as string[];
    if (runs.length) lastRunAt = runs.sort().slice(-1)[0];
  } catch {
    // table not migrated yet — ignore
  }

  if (!anyEnabled) {
    try {
      const { data } = await supabase.from("accounts").select("auto_trade_enabled");
      anyEnabled = ((data ?? []) as { auto_trade_enabled?: boolean | null }[]).some(
        (a) => !!a.auto_trade_enabled
      );
    } catch {
      // ignore
    }
  }

  return { lastRunAt, anyEnabled };
}

/**
 * Turn a running scanner off from the hub. The deterministic built-ins are gone,
 * so the AI scanner (a flag on the account) is the only thing this switches —
 * custom strategies are paused through their own actions.
 */
export async function deactivateScanner(
  accountId: string,
  scanner: string
): Promise<{ error?: string }> {
  if (scanner !== "ai") return { error: "Unknown scanner" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized" };

  const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).single();
  if (!account) return { error: "Not authorized" };

  const { error } = await supabase
    .from("accounts")
    .update({ auto_trade_enabled: false })
    .eq("id", accountId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/scanners");
  return {};
}
