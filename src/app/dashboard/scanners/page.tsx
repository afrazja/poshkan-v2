import { createClient } from "@/lib/supabase/server";
import ScannersHub, { type ScanAcct } from "@/components/scanners/ScannersHub";
import type { Account } from "@/lib/types";
import type { SmcSettings, SmcSignal } from "../[accountId]/smc-actions";
import type { OteSettings, OteSignal } from "../[accountId]/ote-actions";
import type { TrendSettings, TrendSignal } from "../[accountId]/trend-actions";
import type { MeanRevSettings, MeanRevSignal } from "../[accountId]/meanrev-actions";
import type { CandleRangeSettings, CandleRangeSignal } from "../[accountId]/candlerange-actions";

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

  // Trend settings + recent signals (degrades to empty if trend-scanner.sql unrun).
  const trendSettingsBy: Record<string, TrendSettings> = {};
  const trendSignalsBy: Record<string, TrendSignal[]> = {};
  if (ids.length) {
    try {
      const [{ data: settings }, { data: signals }] = await Promise.all([
        supabase.from("trend_settings").select("*").in("account_id", ids),
        supabase
          .from("trend_signals")
          .select("*")
          .in("account_id", ids)
          .order("created_at", { ascending: false })
          .limit(120),
      ]);
      (settings ?? []).forEach((s) => {
        trendSettingsBy[(s as TrendSettings).account_id] = s as TrendSettings;
      });
      (signals ?? []).forEach((sig) => {
        const row = sig as TrendSignal & { account_id: string };
        const arr = trendSignalsBy[row.account_id] ?? (trendSignalsBy[row.account_id] = []);
        if (arr.length < 20) arr.push(row);
      });
    } catch {
      // trend-scanner.sql not run yet — scanners still render, just with no history.
    }
  }

  // Mean-reversion settings + recent signals (degrades if meanrev-scanner.sql unrun).
  const meanrevSettingsBy: Record<string, MeanRevSettings> = {};
  const meanrevSignalsBy: Record<string, MeanRevSignal[]> = {};
  if (ids.length) {
    try {
      const [{ data: settings }, { data: signals }] = await Promise.all([
        supabase.from("meanrev_settings").select("*").in("account_id", ids),
        supabase
          .from("meanrev_signals")
          .select("*")
          .in("account_id", ids)
          .order("created_at", { ascending: false })
          .limit(120),
      ]);
      (settings ?? []).forEach((s) => {
        meanrevSettingsBy[(s as MeanRevSettings).account_id] = s as MeanRevSettings;
      });
      (signals ?? []).forEach((sig) => {
        const row = sig as MeanRevSignal & { account_id: string };
        const arr = meanrevSignalsBy[row.account_id] ?? (meanrevSignalsBy[row.account_id] = []);
        if (arr.length < 20) arr.push(row);
      });
    } catch {
      // meanrev-scanner.sql not run yet — scanners still render, just with no history.
    }
  }

  // Candle-Range settings + recent signals (degrades if candlerange-scanner.sql unrun).
  const candlerangeSettingsBy: Record<string, CandleRangeSettings> = {};
  const candlerangeSignalsBy: Record<string, CandleRangeSignal[]> = {};
  if (ids.length) {
    try {
      const [{ data: settings }, { data: signals }] = await Promise.all([
        supabase.from("candlerange_settings").select("*").in("account_id", ids),
        supabase
          .from("candlerange_signals")
          .select("*")
          .in("account_id", ids)
          .order("created_at", { ascending: false })
          .limit(120),
      ]);
      (settings ?? []).forEach((s) => {
        candlerangeSettingsBy[(s as CandleRangeSettings).account_id] = s as CandleRangeSettings;
      });
      (signals ?? []).forEach((sig) => {
        const row = sig as CandleRangeSignal & { account_id: string };
        const arr = candlerangeSignalsBy[row.account_id] ?? (candlerangeSignalsBy[row.account_id] = []);
        if (arr.length < 20) arr.push(row);
      });
    } catch {
      // candlerange-scanner.sql not run yet — scanner still renders, just with no history.
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
      leverage: a.auto_leverage ?? 1,
      maxPositionPct: (a.auto_max_position_pct ?? 0.25) * 100,
    },
    aiInstruction: a.ai_instruction ?? null,
    aiSymbols: a.ai_symbols ?? null,
    smcSettings: smcSettingsBy[a.id] ?? null,
    smcSignals: smcSignalsBy[a.id] ?? [],
    oteSettings: oteSettingsBy[a.id] ?? null,
    oteSignals: oteSignalsBy[a.id] ?? [],
    trendSettings: trendSettingsBy[a.id] ?? null,
    trendSignals: trendSignalsBy[a.id] ?? [],
    meanrevSettings: meanrevSettingsBy[a.id] ?? null,
    meanrevSignals: meanrevSignalsBy[a.id] ?? [],
    candlerangeSettings: candlerangeSettingsBy[a.id] ?? null,
    candlerangeSignals: candlerangeSignalsBy[a.id] ?? [],
  }));

  return <ScannersHub accounts={scanAccounts} onboard={onboard === "1"} />;
}
