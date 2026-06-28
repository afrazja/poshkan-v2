import { createClient } from "@/lib/supabase/server";
import ScannersHub, { type ScanAcct } from "@/components/scanners/ScannersHub";
import type { Account } from "@/lib/types";
import type { SmcSettings, SmcSignal } from "../[accountId]/smc-actions";
import type { OteSettings, OteSignal } from "../[accountId]/ote-actions";

export default async function ScannersPage({
  searchParams,
}: {
  searchParams: Promise<{ onboard?: string }>;
}) {
  const { onboard } = await searchParams;
  const supabase = await createClient();

  // RLS scopes this to the signed-in user's own accounts.
  const { data: accountsRaw } = await supabase.from("accounts").select("*");
  const accounts = (accountsRaw ?? []) as Account[];

  // SMC settings + recent signals for every account (degrades to empty if unmigrated).
  const ids = accounts.map((a) => a.id);
  const smcSettingsBy: Record<string, SmcSettings> = {};
  const smcSignalsBy: Record<string, SmcSignal[]> = {};
  if (ids.length) {
    try {
      const [{ data: settings }, { data: signals }] = await Promise.all([
        supabase.from("smc_settings").select("*").in("account_id", ids),
        supabase
          .from("smc_signals")
          .select("*")
          .in("account_id", ids)
          .order("created_at", { ascending: false })
          .limit(120),
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
      // smc-scanner.sql not run yet — scanners still render, just with no history.
    }
  }

  // OTE settings + recent signals (degrades to empty if ote-scanner.sql unrun).
  const oteSettingsBy: Record<string, OteSettings> = {};
  const oteSignalsBy: Record<string, OteSignal[]> = {};
  if (ids.length) {
    try {
      const [{ data: settings }, { data: signals }] = await Promise.all([
        supabase.from("ote_settings").select("*").in("account_id", ids),
        supabase
          .from("ote_signals")
          .select("*")
          .in("account_id", ids)
          .order("created_at", { ascending: false })
          .limit(120),
      ]);
      (settings ?? []).forEach((s) => {
        oteSettingsBy[(s as OteSettings).account_id] = s as OteSettings;
      });
      (signals ?? []).forEach((sig) => {
        const row = sig as OteSignal & { account_id: string };
        const arr = oteSignalsBy[row.account_id] ?? (oteSignalsBy[row.account_id] = []);
        if (arr.length < 20) arr.push(row);
      });
    } catch {
      // ote-scanner.sql not run yet — scanners still render, just with no history.
    }
  }

  const scanAccounts: ScanAcct[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    autoSettings: {
      enabled: !!a.auto_trade_enabled,
      riskPct: (a.auto_risk_pct ?? 0.01) * 100,
      maxOpen: a.auto_max_open ?? 3,
      maxPerDay: a.auto_max_per_day ?? 2,
      dailyLossPct: (a.auto_daily_loss_pct ?? 0.03) * 100,
      minMinutes: a.auto_min_minutes ?? 60,
    },
    aiInstruction: a.ai_instruction ?? null,
    aiSymbols: a.ai_symbols ?? null,
    smcSettings: smcSettingsBy[a.id] ?? null,
    smcSignals: smcSignalsBy[a.id] ?? [],
    oteSettings: oteSettingsBy[a.id] ?? null,
    oteSignals: oteSignalsBy[a.id] ?? [],
  }));

  return <ScannersHub accounts={scanAccounts} onboard={onboard === "1"} />;
}
