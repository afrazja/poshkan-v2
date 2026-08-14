import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StrategyBuilder from "@/components/scanners/StrategyBuilder";
import { customStrategyFromDb } from "@/lib/custom-strategy-types";

export default async function EditStrategyPage({
  params,
}: {
  params: Promise<{ strategyId: string }>;
}) {
  const { strategyId } = await params;
  const supabase = await createClient();
  const [{ data: accounts }, { data: strategy }] = await Promise.all([
    supabase.from("accounts").select("id, name, type").order("created_at", { ascending: true }),
    supabase.from("custom_strategies").select("*").eq("id", strategyId).single(),
  ]);

  if (!strategy) notFound();
  return (
    <StrategyBuilder
      accounts={accounts ?? []}
      initial={customStrategyFromDb(strategy as Record<string, unknown>)}
    />
  );
}
