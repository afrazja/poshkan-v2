import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountView from "@/components/account/AccountView";
import { getSmcData } from "./smc-actions";
import { getOteData } from "./ote-actions";
import { getTrendData } from "./trend-actions";
import { getMeanRevData } from "./meanrev-actions";
import { getCandleRangeData } from "./candlerange-actions";
import type { Account, Position, WatchlistItem, Transaction, Order, FxPosition, FxOrder, FxTpLevel } from "@/lib/types";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();

  if (!account) notFound();

  const { data: positions } = await supabase
    .from("positions")
    .select("*")
    .eq("account_id", accountId);

  const { data: watchlist } = await supabase
    .from("watchlist")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  // Pending limit orders (table may not exist yet if orders.sql hasn't been run).
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Forex positions (table may not exist until forex.sql is run — degrades to none).
  const { data: fxPositions } = await supabase
    .from("fx_positions")
    .select("*")
    .eq("account_id", accountId)
    .order("opened_at", { ascending: false });

  const { data: fxOrders } = await supabase
    .from("fx_orders")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Pending scaled take-profit levels (table may not exist yet — degrades to none).
  const { data: fxTpLevels } = await supabase
    .from("fx_tp_levels")
    .select("id, position_id, price, close_units, status, fx_positions!inner(account_id)")
    .eq("fx_positions.account_id", accountId)
    .eq("status", "pending");

  // Scanner config for this account (powers the active indicators + their popups).
  const acc = account as Account;
  const [smc, ote, trend, meanrev, candlerange] = await Promise.all([
    getSmcData(accountId),
    getOteData(accountId),
    getTrendData(accountId),
    getMeanRevData(accountId),
    getCandleRangeData(accountId),
  ]);
  const autoSettings = {
    enabled: !!acc.auto_trade_enabled,
    riskPct: (acc.auto_risk_pct ?? 0.01) * 100,
    maxOpen: acc.auto_max_open ?? 3,
    maxPerDay: acc.auto_max_per_day ?? 2,
    dailyLossPct: (acc.auto_daily_loss_pct ?? 0.03) * 100,
    minMinutes: acc.auto_min_minutes ?? 60,
    leverage: acc.auto_leverage ?? 1,
  };

  return (
    <AccountView
      account={account as Account}
      initialPositions={(positions ?? []) as Position[]}
      initialWatchlist={(watchlist ?? []) as WatchlistItem[]}
      initialTransactions={(transactions ?? []) as Transaction[]}
      initialOrders={(orders ?? []) as Order[]}
      initialFxPositions={(fxPositions ?? []) as FxPosition[]}
      initialFxOrders={(fxOrders ?? []) as FxOrder[]}
      initialFxTpLevels={(fxTpLevels ?? []) as unknown as FxTpLevel[]}
      autoSettings={autoSettings}
      aiInstruction={acc.ai_instruction ?? null}
      smcSettings={smc?.settings ?? null}
      smcSignals={smc?.signals ?? []}
      oteSettings={ote?.settings ?? null}
      oteSignals={ote?.signals ?? []}
      trendSettings={trend?.settings ?? null}
      trendSignals={trend?.signals ?? []}
      meanrevSettings={meanrev?.settings ?? null}
      meanrevSignals={meanrev?.signals ?? []}
      candlerangeSettings={candlerange?.settings ?? null}
      candlerangeSignals={candlerange?.signals ?? []}
    />
  );
}
