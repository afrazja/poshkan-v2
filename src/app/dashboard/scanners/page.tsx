import { createClient } from "@/lib/supabase/server";
import ScannersHub, { type ScanAcct } from "@/components/scanners/ScannersHub";
import type { Account } from "@/lib/types";
import { customStrategyFromDb, type CustomStrategyRow } from "@/lib/custom-strategy-types";
import type { CustomStrategySignalSummary } from "@/components/scanners/CustomStrategiesPanel";

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
  }));

  // User-built strategy experiments. The page still renders the template lab
  // when the migration has not been applied yet.
  let customStrategies: CustomStrategyRow[] = [];
  let customSignals: CustomStrategySignalSummary[] = [];
  try {
    const { data: strategies } = await supabase
      .from("custom_strategies")
      .select("*")
      .order("updated_at", { ascending: false });
    customStrategies = (strategies ?? []).map((row) => customStrategyFromDb(row as Record<string, unknown>));
    const strategyIds = customStrategies.map((strategy) => strategy.id);
    if (strategyIds.length) {
      const { data: signals } = await supabase
        .from("custom_strategy_signals")
        .select("id, strategy_id, symbol, direction, created_at")
        .in("strategy_id", strategyIds)
        .order("created_at", { ascending: false })
        .limit(100);
      customSignals = (signals ?? []).map((signal) => ({
        id: String(signal.id),
        strategyId: String(signal.strategy_id),
        symbol: String(signal.symbol),
        direction: signal.direction as "LONG" | "SHORT",
        createdAt: String(signal.created_at),
      }));
    }
  } catch {
    // custom-strategies.sql not run yet
  }

  // Cron health: the freshest run across everything ENABLED. Live custom
  // strategies carry last_run_at; the AI scanner is a flag on the account, so
  // it counts toward "anything enabled" without contributing a timestamp.
  const liveRuns = customStrategies
    .filter((strategy) => strategy.status === "live" && strategy.lastRunAt)
    .map((strategy) => strategy.lastRunAt as string);
  const lastRunAt = liveRuns.length ? liveRuns.sort().slice(-1)[0] : null;
  const anyEnabled =
    customStrategies.some((strategy) => strategy.status === "live") ||
    accounts.some((a) => !!a.auto_trade_enabled);

  return (
    <ScannersHub
      accounts={scanAccounts}
      onboard={onboard === "1"}
      lastRunAt={lastRunAt}
      anyEnabled={anyEnabled}
      customStrategies={customStrategies}
      customSignals={customSignals}
    />
  );
}
