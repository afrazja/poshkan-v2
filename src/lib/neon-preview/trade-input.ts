import { z } from "zod";

const decimal = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/).refine(v => Number(v) > 0, "Enter a positive amount");
const symbol = z.string().trim().toUpperCase().regex(/^[A-Z0-9.^=-]{1,24}$/);
const accountId = z.uuid();
const protection = { stopLoss: decimal.nullable(), takeProfit: decimal.nullable() };
export const tradeInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SPOT"), accountId, symbol, side: z.enum(["BUY", "SELL"]), quantity: decimal }).strict(),
  z.object({ action: z.literal("OPEN_FX"), accountId, symbol, direction: z.enum(["LONG", "SHORT"]), units: decimal, leverage: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]), ...protection }).strict(),
  z.object({ action: z.literal("CLOSE_FX"), accountId, positionId: z.uuid(), units: decimal.optional() }).strict(),
  z.object({ action: z.literal("PROTECT_FX"), accountId, positionId: z.uuid(), ...protection }).strict(),
]);
export type TradeInput = z.infer<typeof tradeInput>;
const scheduled = { accountId, symbol, quantity: decimal, target: decimal, expiryHours: z.literal(24).nullable() };
export const orderInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PLACE_LIMIT"), ...scheduled, direction: z.enum(["BUY","SELL"]) }).strict(),
  z.object({ action: z.literal("PLACE_ENTRY"), ...scheduled, direction: z.enum(["LONG","SHORT"]), trigger: z.enum(["AT_OR_BELOW","AT_OR_ABOVE"]), leverage: z.union([z.literal(1),z.literal(2),z.literal(5),z.literal(10)]), ...protection }).strict(),
  z.object({ action: z.literal("CANCEL_LIMIT"), accountId, orderId: z.uuid() }).strict(),
  z.object({ action: z.literal("CANCEL_ENTRY"), accountId, orderId: z.uuid() }).strict(),
  z.object({ action: z.literal("SET_TIMER"), accountId, positionId: z.uuid(), minutes: z.number().int().min(0).max(10080) }).strict(),
  z.object({ action: z.literal("SET_LEVELS"), accountId, positionId: z.uuid(), levels: z.array(z.object({price: decimal, units: decimal}).strict()).max(10) }).strict(),
]);
export type OrderState = {
  orders: {id: string; accountId: string; kind: "LIMIT" | "ENTRY"; symbol: string; direction: string; quantity: string; target: string; status: string; error: string | null; created: string; expires: string | null; fillPrice: string | null}[];
  exits: {id: string; accountId: string; symbol: string; at: string | null; levels: {id: string; price: string; units: string}[]}[];
};
export type TradingAccount = {
  id: string; name: string; type: string; cash: string;
  holdings: { id: string; symbol: string; quantity: string }[];
  forex: { id: string; symbol: string; direction: string; units: string; rate: string; margin: string; stopLoss: string | null; takeProfit: string | null }[];
};

export type ServerQuote = { symbol?: string; regularMarketPrice?: number; regularMarketTime?: Date; marketState?: string; currency?: string; quoteType?: string };
export function checkedQuote(symbol: string, quote: ServerQuote, forexOperation: boolean, now = Date.now()) {
  const rate = quote.regularMarketPrice;
  const age = now - (quote.regularMarketTime?.getTime() ?? 0);
  if (quote.symbol?.toUpperCase() !== symbol || !Number.isFinite(rate) || !rate || rate <= 0 || !Number.isFinite(age) || age < -60_000 || age > 300_000) throw new Error("A fresh market price is unavailable. No test trade was placed.");
  const crypto = /-USD$/.test(symbol);
  const forex = /=X$/.test(symbol);
  if (!crypto && quote.marketState !== "REGULAR") throw new Error("The market is closed. No test trade was placed.");
  if (!forex && quote.currency !== "USD") throw new Error("This test supports USD-priced assets only.");
  if (forex && quote.currency !== symbol.slice(3,6)) throw new Error("Unsupported asset type.");
  if ((!forex && !crypto && !["EQUITY","ETF"].includes(quote.quoteType ?? "")) || (crypto && quote.quoteType !== "CRYPTOCURRENCY") || (forex && quote.quoteType !== "CURRENCY")) throw new Error("Unsupported asset type.");
  const normalized = rate.toFixed(forexOperation ? 6 : 8);
  if (Number(normalized) <= 0) throw new Error("The quoted price is too small for this trading engine.");
  return normalized;
}
