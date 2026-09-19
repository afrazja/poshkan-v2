import "server-only";
import { z } from "zod";
import YahooFinance from "yahoo-finance2";
import { actor, transaction } from "./trading";
import { checkedQuote, orderInput, type OrderState } from "./trade-input";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
export async function readOrders(): Promise<OrderState | null> {
  const userId = await actor();
  return transaction(userId, async c => {
    // Keep the existing manual-trade page usable before the additive migration.
    const ready = await c.query("SELECT to_regprocedure('poshkan_trade_test.order_state()') IS NOT NULL AS ready");
    return ready.rows[0].ready ? (await c.query("SELECT poshkan_trade_test.order_state() AS state")).rows[0].state : null;
  });
}

export async function saveOrder(requestId: unknown, input: unknown): Promise<Record<string,string>> {
  const userId = await actor();
  const request = z.uuid().parse(requestId);
  const command = orderInput.parse(input);
  return transaction(userId, async c => (await c.query("SELECT poshkan_trade_test.order_command($1,$2::jsonb) AS result",[request,command])).rows[0].result);
}

type Candidate = { kind: "LIMIT" | "ENTRY" | "POSITION"; id: string; accountId: string; symbol: string };
type CheckResult = {status: string; reason?: string; levels?: number};
export async function checkOrders() {
  const userId = await actor();
  const candidates: Candidate[] = await transaction(userId, async c => (await c.query("SELECT poshkan_trade_test.order_candidates() AS items")).rows[0].items);
  const prices = new Map<string, {price: string; at: Date} | null>();
  const summary = { filled: 0, closed: 0, scaled: 0, canceled: 0, expired: 0, waiting: 0, unavailable: 0, failed: 0 };
  for (const item of candidates) {
    // Recheck each transaction's session, including after a slow quote request.
    if (await actor() !== userId) throw new Error("Sign in to your approved Neon account first.");
    const key = `${item.symbol}:${item.kind === "LIMIT" ? "spot" : "fx"}`;
    if (!prices.has(key)) {
      try {
        const quote = await yahoo.quote(item.symbol);
        prices.set(key, {price: checkedQuote(item.symbol,quote,item.kind!=="LIMIT"), at: quote.regularMarketTime!});
      } catch { prices.set(key,null); }
    }
    if (await actor() !== userId) throw new Error("Sign in to your approved Neon account first.");
    const quote = prices.get(key);
    try {
      // Null quotes permit expiration only. All fills require a fresh validated
      // quote, and the DB rechecks its age after acquiring account/order locks.
      const result: CheckResult = await transaction(userId, async c => (await c.query(
        "SELECT poshkan_trade_test.check_order($1,$2,$3,$4,$5::numeric,$6::timestamptz) AS result",
        [item.kind,item.id,item.accountId,item.symbol,quote?.price??null,quote?.at??null],
      )).rows[0].result);
      if (result.status in summary) summary[result.status as keyof typeof summary]++;
    } catch { summary.failed++; }
  }
  return summary;
}
