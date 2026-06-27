import { createClient } from "@/lib/supabase/server";
import ScannersHub, { type ForexAcct, type CryptoAcct } from "@/components/scanners/ScannersHub";
import type { Account } from "@/lib/types";
import type { SmcSettings, SmcSignal } from "../[accountId]/smc-actions";

export default async function ScannersPage() {
  const supabase = await createClient();

  // RLS scopes this to the signed-in user's own accounts.
  const { data: accountsRaw } = await supabase.from("accounts").select("*");
  const accounts = (accountsRaw ?? []) as Account[];

  // Per-crypto SMC settings + recent signals (degrades to empty if not migrated).
  const cryptoIds = accounts.filter((a) => a.type === "crypto").map((a) => a.id);
  const smcSettingsBy: Record<string, SmcSettings> = {};
  const smcSignalsBy: Record<string, SmcSignal[]> = {};
  if (cryptoIds.length) {
    try {
      const [{ data: settings }, { data: signals }] = await Promise.all([
        supabase.from("smc_settings").select("*").in("account_id", cryptoIds),
        supabase
          .from("smc_signals")
          .select("*")
          .in("account_id", cryptoIds)
          .order("created_at", { ascending: false })
          .limit(80),
      ]);
      (settings ?? []).forEach((s) => {
        smcSettingsBy[(s as SmcSettings).account_id] = s as SmcSettings;
      });
      (signals ?? []).forEach((sig) => {
        const row = sig as SmcSignal & { account_id: string };
        const arr = smcSignalsBy[row.account_id] ?? (smcSignalsBy[row.account_id] = []);
        if (arr.length < 20) arr.push(row);
      });
    } catch {
      // smc-scanner.sql not run yet — show the scanner with no history.
    }
  }

  const forexAccounts: ForexAcct[] = accounts
    .filter((a) => a.type === "forex")
    .map((a) => ({
      id: a.id,
      name: a.name,
      autoSettings: {
        enabled: !!a.auto_trade_enabled,
        riskPct: (a.auto_risk_pct ?? 0.01) * 100,
        maxOpen: a.auto_max_open ?? 3,
        maxPerDay: a.auto_max_per_day ?? 2,
        dailyLossPct: (a.auto_daily_loss_pct ?? 0.03) * 100,
        minMinutes: a.auto_min_minutes ?? 60,
      },
      aiInstruction: a.ai_instruction ?? null,
    }));

  const cryptoAccounts: CryptoAcct[] = accounts
    .filter((a) => a.type === "crypto")
    .map((a) => ({
      id: a.id,
      name: a.name,
      smcSettings: smcSettingsBy[a.id] ?? null,
      smcSignals: smcSignalsBy[a.id] ?? [],
    }));

  return <ScannersHub forexAccounts={forexAccounts} cryptoAccounts={cryptoAccounts} />;
}
