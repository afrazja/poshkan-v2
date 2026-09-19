import { z } from "zod";

const decimal = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/).refine(v => Number(v) > 0, "Enter a positive amount");
const symbol = z.string().trim().toUpperCase().regex(/^[A-Z0-9.^=-]{1,24}$/);
const accountId = z.uuid();
const protection = { stopLoss: decimal.nullable(), takeProfit: decimal.nullable() };
export const tradeInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SPOT"), accountId, symbol, side: z.enum(["BUY", "SELL"]), quantity: decimal }).strict(),
  z.object({ action: z.literal("OPEN_FX"), accountId, symbol, direction: z.enum(["LONG", "SHORT"]), units: decimal, leverage: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]), autoCloseMinutes:z.number().int().min(0).max(10080).optional(), ...protection }).strict(),
  z.object({ action: z.literal("CLOSE_FX"), accountId, positionId: z.uuid(), units: decimal.optional() }).strict(),
  z.object({ action: z.literal("PROTECT_FX"), accountId, positionId: z.uuid(), ...protection }).strict(),
]);
export type TradeInput = z.infer<typeof tradeInput>;
const scheduled = { accountId, symbol, quantity: decimal, target: decimal, expiryHours: z.literal(24).nullable() };
export const orderInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PLACE_LIMIT"), ...scheduled, timeInForce:z.enum(['DAY','GTC']).optional(), direction: z.enum(["BUY","SELL"]) }).strict(),
  z.object({ action: z.literal("PLACE_ENTRY"), ...scheduled, expiryMinutes:z.number().int().min(1).max(10080).nullable().optional(), direction: z.enum(["LONG","SHORT"]), trigger: z.enum(["AT_OR_BELOW","AT_OR_ABOVE"]), leverage: z.union([z.literal(1),z.literal(2),z.literal(5),z.literal(10)]), ...protection }).strict(),
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

export { checkedQuote } from "./quote.mjs";
