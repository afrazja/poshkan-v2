import { z } from "zod";
import type { OhlcCandle } from "./marketdata";

export const CRYPTO_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;
export const CRYPTO_LIMITS = { leverage: 2, riskPct: 0.005, marginPct: 0.25, minRR: 3, holdMinutes: 4320 } as const;
export const proposalSchema = z.object({
  setup: z.object({
    symbol: z.enum(CRYPTO_SYMBOLS), direction: z.enum(["LONG", "SHORT"]),
    entry: z.number().positive(), stop: z.number().positive(), target: z.number().positive(),
    rationale: z.string().min(10).max(700), trigger: z.string().min(10).max(500),
  }).strict().nullable(),
  reason: z.string().min(3).max(700),
}).strict();
export type CryptoProposal = z.infer<typeof proposalSchema>;
export type CryptoSetup = NonNullable<CryptoProposal["setup"]>;

export function freshQuote(q: { price: number; asOf?: string | null; stale?: boolean }, now = Date.now()) {
  const age = now - Date.parse(q.asOf ?? "");
  return Number.isFinite(q.price) && q.price > 0 && !q.stale && Number.isFinite(age) && age >= -60_000 && age <= 300_000;
}

export function closedFrame(candles: OhlcCandle[], minutes: number, now = Date.now()) {
  const step = minutes * 60_000;
  const bars = candles.filter(c => {
    const t = Date.parse(c.datetime);
    return Number.isFinite(t) && t % step === 0 && t + step <= now &&
      [c.open, c.high, c.low, c.close].every(x => Number.isFinite(x) && x > 0) &&
      c.high >= Math.max(c.open, c.close, c.low) && c.low <= Math.min(c.open, c.close);
  }).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  if (bars.length < 50) throw new Error("Insufficient completed candles");
  for (let i = bars.length - 49; i < bars.length; i++) {
    if (Date.parse(bars[i].datetime) - Date.parse(bars[i - 1].datetime) !== step) throw new Error("Candle history has gaps");
  }
  const age = now - Date.parse(bars.at(-1)!.datetime) - step;
  if (age > step + (minutes >= 60 ? 600_000 : 300_000)) throw new Error("Completed candles are stale");
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const closes = bars.map(c => c.close);
  const changes = bars.slice(-14).map((c, i) => c.close - bars[bars.length - 15 + i].close);
  const gain = avg(changes.map(d => Math.max(d, 0))), loss = avg(changes.map(d => Math.max(-d, 0)));
  const atr = avg(bars.slice(-14).map((c, i) => Math.max(c.high - c.low, Math.abs(c.high - bars[bars.length - 15 + i].close), Math.abs(c.low - bars[bars.length - 15 + i].close))));
  return {
    lastClosedAt: new Date(Date.parse(bars.at(-1)!.datetime) + step).toISOString(),
    sma20: avg(closes.slice(-20)), sma50: avg(closes.slice(-50)),
    rsi14Simple: gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss), atr14Simple: atr,
    support20: Math.min(...bars.slice(-20).map(c => c.low)), resistance20: Math.max(...bars.slice(-20).map(c => c.high)),
    support60: Math.min(...bars.slice(-60).map(c => c.low)), resistance60: Math.max(...bars.slice(-60).map(c => c.high)),
    candles: bars.slice(-12),
  };
}

// Revalidate absolute structure levels against the current server quote. Never move
// the stop/target with the price: a moved entry may invalidate the original idea.
export function sizeCryptoSetup(s: CryptoSetup, price: number, cash: number, atr15: number) {
  if (![price, cash, atr15, s.entry, s.stop, s.target].every(x => Number.isFinite(x) && x > 0)) throw new Error("Invalid sizing inputs");
  const long = s.direction === "LONG";
  if (!(long ? s.stop < price && s.target > price : s.stop > price && s.target < price)) throw new Error("Invalid stop/target geometry");
  const risk = Math.abs(price - s.stop), reward = Math.abs(s.target - price);
  if (reward / risk < CRYPTO_LIMITS.minRR) throw new Error("Reward/risk below 3:1 at live price");
  if (risk < atr15 * 0.5) throw new Error("Stop is too tight for observed volatility");
  if (Math.abs(price - s.entry) > Math.min(price * 0.0025, risk * 0.25)) throw new Error("Price moved away from the confirmed entry");
  if ([s.stop, s.target].some(p => Math.abs(p - price) / price > 0.1)) throw new Error("Levels exceed the short-horizon price band");
  const units = Math.floor(Math.min(cash * 0.0049 / risk, cash * 0.245 * 2 / price) * 1e8) / 1e8;
  const margin = Math.round(units * price / 2 * 100) / 100;
  if (!(units > 0 && margin > 0 && margin <= cash * 0.25 && units * risk <= cash * 0.005)) throw new Error("Position is outside cash limits");
  return { units, margin, riskUsd: units * risk, rewardRisk: reward / risk };
}
