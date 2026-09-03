"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MARKET_LABEL: Record<string, string> = { stocks: "Stocks", crypto: "Crypto", forex: "Forex" };

// One account per market. Several accounts in the same market split a record
// that only means anything whole - a leaderboard rank and a discipline score
// are worthless if a bad run can be abandoned and restarted next door. The UI
// hides the taken markets; this is the check that actually holds, since a
// client can be bypassed.
//
// It deliberately does NOT touch accounts that already exist: anyone holding
// two in one market keeps both, and simply cannot open a third.
async function accountInMarket(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  type: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", userId)
    .eq("type", type)
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as { id: string; name: string } | undefined) ?? null;
}

export async function createAccountAction(input: {
  name: string;
  type: string;
  initialCash: number;
  leverage?: number;
}): Promise<{ accountId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.name?.trim()) return { error: "Account name is required" };
  if (input.name.trim().length < 3)
    return { error: "Name must be at least 3 characters — it appears in activity feeds and the leaderboard." };

  const type = input.type || "stocks";
  const taken = await accountInMarket(supabase, user.id, type);
  if (taken) {
    return {
      error: `You already have a ${MARKET_LABEL[type] ?? type} account, “${taken.name}”. Each market gets one account, so your record in it stays whole.`,
    };
  }

  // Accounts start with cash only â every position must be bought at a real
  // market price through the trade flow, so no P&L can be claimed for free.
  // (Existing accounts created with seeded holdings are untouched.)
  const { data, error } = await supabase.rpc("create_account", {
    p_name: input.name.trim(),
    p_type: type,
    p_initial_cash: input.initialCash || 0,
    p_holdings: [],
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

// One-tap onboarding: a funded demo account, so a brand-new user can go straight
// to the Strategy Lab and backtest their first idea in seconds. Crypto trades
// 24/7, so there is fresh data to chew on at any hour.
export async function createDemoAccountAction(): Promise<{ accountId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // The point of one-tap onboarding is to land somewhere, not to scold: if a
  // crypto account already exists, open that one.
  const existing = await accountInMarket(supabase, user.id, "crypto");
  if (existing) return { accountId: existing.id };

  const { data, error } = await supabase.rpc("create_account", {
    p_name: "Demo · Crypto",
    p_type: "crypto",
    p_initial_cash: 10000,
    p_holdings: [],
  });
  if (error) return { error: error.message };
  const accountId = data as string;

  revalidatePath("/dashboard");
  return { accountId };
}
