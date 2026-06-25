import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily account-value history from account_snapshots — the equity curve.
// Works for any account type (forex included), unlike /api/holdings-history
// which replays the stock ledger.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  // Verify ownership via the RLS-scoped user client before reading snapshots.
  const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).single();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const { data: snaps } = await createAdminClient()
    .from("account_snapshots")
    .select("snapshot_date, total_value")
    .eq("account_id", accountId)
    .order("snapshot_date", { ascending: true });

  const points = (snaps ?? []).map((s) => ({
    datetime: s.snapshot_date as string,
    value: Number(s.total_value),
  }));
  return NextResponse.json({ points });
}
