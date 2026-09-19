import "server-only";
import { Pool, type PoolClient } from "pg";
import YahooFinance from "yahoo-finance2";
import { z } from "zod";
import { previewAuth } from "./auth";
import { requirePreview } from "./config";
import { checkedQuote, tradeInput, type TradingAccount } from "./trade-input";
import { assetTypeError } from "../assets";

let pool: Pool | undefined;
const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function actor() {
  requirePreview();
  if (process.env.NEON_TRADING_PREVIEW !== "1") throw new Error("Trading preview is disabled");
  const { data, error } = await previewAuth().getSession({ query: { disableCookieCache: true } });
  if (error || !data?.user?.id || data.user.id !== process.env.NEON_PREVIEW_USER_ID) throw new Error("Sign in to your approved Neon account first.");
  return data.user.id;
}

export async function transaction<T>(userId: string, work: (client: PoolClient) => Promise<T>, role: 'app' | 'services' | 'cache' = 'app') {
  if (!process.env.NEON_PREVIEW_DATABASE_URL) throw new Error("Database configuration missing");
  pool ??= new Pool({ connectionString: process.env.NEON_PREVIEW_DATABASE_URL, max: 3, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    await client.query(role === 'services' ? 'SET LOCAL ROLE poshkan_preview_services' : role === 'cache' ? 'SET LOCAL ROLE poshkan_preview_cache' : 'SET LOCAL ROLE poshkan_trade_preview');
    await client.query("SELECT set_config('poshkan.neon_user_id',$1,true)", [userId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function readTradingAccounts(): Promise<TradingAccount[]> {
  const userId = await actor();
  return transaction(userId, async c => (await c.query("SELECT poshkan_trade_test.state() AS accounts")).rows[0].accounts);
}

export async function placePreviewTrade(requestId: unknown, rawInput: unknown) {
  const userId = await actor();
  const request = z.uuid().parse(requestId);
  const command = tradeInput.parse(rawInput);
  const completed = await transaction(userId, async c => (await c.query("SELECT poshkan_trade_test.completed($1,$2::jsonb) AS result", [request, command])).rows[0].result);
  if (completed) return completed as Record<string,string>;
  const accounts: TradingAccount[] = await transaction(userId, async c => (await c.query("SELECT poshkan_trade_test.state() AS accounts")).rows[0].accounts);
  const account = accounts.find(a => a.id === command.accountId);
  if (!account) throw new Error("Account not found");
  let symbol: string;
  if (command.action === "SPOT" || command.action === "OPEN_FX") {
    symbol = command.symbol;
    if (command.action === "OPEN_FX" || command.side === "BUY") {
      const problem = assetTypeError(account.type, symbol);
      if (problem) throw new Error(problem);
    }
  } else {
    const position = account.forex.find(f => f.id === command.positionId);
    if (!position) throw new Error("Open position not found. Refresh the test page.");
    symbol = position.symbol;
  }
  // Separate uncached feed: this preview never writes Supabase market caches,
  // and it never accepts a browser-supplied execution price.
  const quote = await yahoo.quote(symbol);
  const price = checkedQuote(symbol, quote, command.action !== "SPOT");
  // Re-verify the session after the external price request; the RPC also
  // rechecks mapping, bans and ownership under the balance lock.
  if (await actor() !== userId) throw new Error("Your session changed. Sign in again.");
  return transaction(userId, async c => (await c.query("SELECT poshkan_trade_test.command($1,$2::jsonb,$3::numeric) AS result", [request, command, price])).rows[0].result as Record<string,string>);
}
