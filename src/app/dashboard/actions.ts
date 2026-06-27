"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface NewHolding {
  symbol: string;
  quantity: number;
  avg_price: number;
}

export async function createAccountAction(input: {
  name: string;
  type: string;
  initialCash: number;
  holdings: NewHolding[];
  leverage?: number;
}): Promise<{ accountId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.name?.trim()) return { error: "Account name is required" };

  const { data, error } = await supabase.rpc("create_account", {
    p_name: input.name.trim(),
    p_type: input.type || "stocks",
    p_initial_cash: input.initialCash || 0,
    p_holdings: input.holdings || [],
  });

  if (error) return { error: error.message };
  const accountId = data as string;

  // Forex accounts carry a chosen leverage; others keep the default 30.
  // Best-effort: if the leverage column isn't migrated yet, the account still works.
  if (accountId && input.type === "forex" && input.leverage && input.leverage !== 30) {
    await supabase.from("accounts").update({ leverage: input.leverage }).eq("id", accountId);
  }

  revalidatePath("/dashboard");
  return { accountId };
}

// One-tap onboarding: a funded demo account with the SMC scanner already on, so a
// brand-new user can backtest and see real setups in seconds. Crypto trades 24/7,
// so the scanner has fresh data to chew on at any hour.
export async function createDemoAccountAction(): Promise<{ accountId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_account", {
    p_name: "Demo · Crypto",
    p_type: "crypto",
    p_initial_cash: 10000,
    p_holdings: [],
  });
  if (error) return { error: error.message };
  const accountId = data as string;

  // Pre-enable the SMC scanner on the big-three majors (best-effort — if the
  // smc-scanner migration isn't run yet the account is still created fine).
  if (accountId) {
    await supabase.from("smc_settings").upsert(
      {
        account_id: accountId,
        enabled: true,
        mode: "alert",
        symbols: ["BTC-USD", "ETH-USD", "SOL-USD"],
        risk_pct: 0.01,
        tp_rr: 2,
        sl_mode: "swing",
        max_open: 3,
        max_per_day: 2,
        daily_loss_pct: 0.03,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );
  }

  revalidatePath("/dashboard");
  return { accountId };
}
