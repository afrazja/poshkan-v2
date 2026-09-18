import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { previewAuth } from "./auth";
import { requirePreview } from "./config";
import { accountQuery, portfolioQuery } from "./portfolio-query";

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

export type PreviewAccountDetail = {
  id: string; name: string; type: string; cashBalance: string;
  holdings: { id: string; symbol: string; quantity: string; averageCost: string; costBasis: string }[];
  transactionCount: number;
  transactions: { id: string; symbol: string | null; side: string; quantity: string; price: string; cashDelta: string; createdAt: string }[];
  forexCount: number;
  forex: { id: string; symbol: string; direction: string; units: string; openRate: string; margin: string; status: string; openedAt: string; closedAt: string | null; closeRate: string | null; pnl: string | null; stopLoss: string | null; takeProfit: string | null }[];
};

async function readOwnedData<T extends QueryResultRow>(query: string, parameters: (string | number)[] = []) {
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
    const { rows } = await connection.query<T>(
      query, [session.user.id, allowedUser, ...parameters],
    );
    await connection.query("COMMIT");
    return { status: "ok" as const, rows };
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function readPreviewPortfolio() {
  const result = await readOwnedData<{ authorized: boolean; accounts: PreviewAccount[] }>(portfolioQuery);
  if (result.status !== "ok") return result;
  if (!result.rows[0]?.authorized) return { status: "forbidden" as const };
  return { status: "ok" as const, accounts: result.rows[0].accounts };
}

export async function readPreviewAccount(accountId: string, transactionPage: number, forexPage: number) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) return { status: "not-found" as const };
  if (![transactionPage, forexPage].every(p => Number.isSafeInteger(p) && p >= 1 && p <= 1_000_000)) return { status: "not-found" as const };
  const result = await readOwnedData<{ account: PreviewAccountDetail }>(accountQuery, [accountId, (transactionPage - 1) * 50, (forexPage - 1) * 50]);
  if (result.status !== "ok") return result;
  // Missing and other users' account IDs have exactly the same response.
  if (!result.rows[0]) return { status: "not-found" as const };
  return { status: "ok" as const, account: result.rows[0].account };
}
