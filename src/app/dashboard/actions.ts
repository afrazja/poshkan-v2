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
  revalidatePath("/dashboard");
  return { accountId: data as string };
}
