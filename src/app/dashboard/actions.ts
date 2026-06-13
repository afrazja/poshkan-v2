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
