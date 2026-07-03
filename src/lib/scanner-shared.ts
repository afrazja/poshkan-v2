import "server-only";
import { getQuote } from "./marketdata";
import { floatingPnl } from "./forex";
import type { createAdminClient } from "./supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

// ─────────────────────────────────────────────────────────────────────────────
// Shared safety plumbing for the scanner crons (SMC / OTE / Trend / MeanRev /
// CandleRange / AI). Each cron used to check-then-insert its dedupe row and
// count only REALIZED losses toward the daily loss limit — both racy/blind in
// the same way, so the fixes live here once.
// ─────────────────────────────────────────────────────────────────────────────

// Claim-first dedupe. The old pattern — SELECT recent, then INSERT later — let
// two overlapping cron runs both pass the check and double-fire the same
// trade. Instead: INSERT our row first, then look at every row in the dedupe
// window; if ours is not the EARLIEST, someone else claimed this signal — we
// delete our row and back off. Both runs see the same committed rows, so
// exactly one survives. Returns the claim's id, or null when deduped.
export async function claimSignal(
  db: Db,
  table: string,
  row: Record<string, unknown>,
  since: string,
  timeColumn = "created_at"
): Promise<string | null> {
  const { data: claim, error } = await db.from(table).insert(row).select("id").single();
  if (error || !claim?.id) return null;
  const { data: window } = await db
    .from(table)
    .select("id")
    .eq("account_id", row.account_id as string)
    .eq("symbol", row.symbol as string)
    .eq("direction", row.direction as string)
    .gte(timeColumn, since)
    .order(timeColumn, { ascending: true })
    .order("id", { ascending: true }) // deterministic tiebreak on equal timestamps
    .limit(1);
  const first = window?.[0]?.id;
  if (first && first !== claim.id) {
    await db.from(table).delete().eq("id", claim.id);
    return null;
  }
  return claim.id as string;
}

// After a successful auto-trade, stamp the claim row with the actual fill.
export async function markExecuted(
  db: Db,
  table: string,
  id: string,
  fill: { entry: number; stop: number; take_profit: number }
): Promise<void> {
  await db.from(table).update({ executed: true, ...fill }).eq("id", id);
}

export interface OpenPosLite {
  symbol: string | null;
  direction: string | null;
  units?: number | null;
  open_rate?: number | null;
}

// Daily loss limit that counts OPEN drawdown, not just realized losses.
// Floating LOSSES count against the limit (that risk is already taken);
// floating PROFITS don't offset it (unrealized gains can evaporate — an
// account down its cap in cash shouldn't keep adding trades because one
// open winner flatters the total).
export async function dailyLossHit(
  db: Db,
  accountId: string,
  open: OpenPosLite[],
  dayStartIso: string,
  cash: number,
  lossPct: number
): Promise<boolean> {
  const { data: closedToday } = await db
    .from("fx_positions")
    .select("pnl")
    .eq("account_id", accountId)
    .neq("status", "open")
    .gte("closed_at", dayStartIso);
  const realized = (closedToday ?? []).reduce((sum, r) => sum + Number(r.pnl ?? 0), 0);

  let floating = 0;
  for (const p of open) {
    if (!p.symbol || !p.direction || !p.units || !p.open_rate) continue;
    const q = await getQuote(p.symbol).catch(() => null);
    if (!q?.price) continue;
    floating += floatingPnl(
      p.direction === "SHORT" ? "SHORT" : "LONG",
      Number(p.units),
      Number(p.open_rate),
      q.price,
      p.symbol
    );
  }

  return realized + Math.min(0, floating) <= -Math.abs(cash * lossPct);
}
