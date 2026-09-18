import "server-only";
import { Pool } from "pg";
import { previewAuth } from "./auth";
import { requirePreview } from "./config";
import { portfolioQuery } from "./portfolio-query";

export type PreviewAccount = {
  id: string;
  name: string;
  type: string;
  cashBalance: string;
  holdings: number;
  openForex: number;
  transactions: number;
};

let pool: Pool | undefined;

export async function readPreviewPortfolio() {
  requirePreview();
  const { data: session, error } = await previewAuth().getSession({ query: { disableCookieCache: true } });
  if (error || !session?.user?.id) return { status: "signed-out" as const };
  // Separate, explicit permission for this local read-only rehearsal. The
  // database's application_access_enabled flag remains false until cutover.
  const allowedUser = process.env.NEON_PREVIEW_USER_ID;
  if (!allowedUser || session.user.id !== allowedUser) return { status: "forbidden" as const };
  if (!process.env.NEON_PREVIEW_DATABASE_URL) throw new Error("Preview database is not configured");
  pool ??= new Pool({
    connectionString: process.env.NEON_PREVIEW_DATABASE_URL,
    max: 2, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000,
    options: "-c default_transaction_read_only=on -c statement_timeout=15000",
  });
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN READ ONLY");
    const { rows } = await connection.query<{ authorized: boolean; accounts: PreviewAccount[] }>(
      portfolioQuery, [session.user.id, allowedUser],
    );
    await connection.query("COMMIT");
    if (!rows[0]?.authorized) return { status: "forbidden" as const };
    return { status: "ok" as const, accounts: rows[0].accounts };
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
