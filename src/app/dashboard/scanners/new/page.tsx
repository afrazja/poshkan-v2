import { createClient } from "@/lib/supabase/server";
import StrategyBuilder from "@/components/scanners/StrategyBuilder";

export default async function NewStrategyPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type")
    .order("created_at", { ascending: true });

  return <StrategyBuilder accounts={accounts ?? []} />;
}
