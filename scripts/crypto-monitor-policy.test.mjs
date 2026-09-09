import test from 'node:test';
import assert from 'node:assert/strict';
import { closedFrame, freshQuote, sizeCryptoSetup, proposalSchema } from '../src/lib/crypto-monitor-policy.ts';

const now = Date.UTC(2026, 8, 10, 12, 7);
const bars = Array.from({ length: 60 }, (_, i) => ({ datetime: new Date(Date.UTC(2026, 8, 10, 12) - (60 - i) * 900000).toISOString(), open: 100, high: 101, low: 99, close: 100 }));
test('only completed, valid, consecutive candles contribute to a signal', () => {
  const forming = { ...bars[0], datetime: new Date(Date.UTC(2026, 8, 10, 12)).toISOString(), close: 9999 };
  const frame = closedFrame([...bars, forming], 15, now);
  assert.equal(frame.sma20, 100);
  assert.equal(frame.rsi14Simple, 50);
  assert.equal(frame.lastClosedAt, '2026-09-10T12:00:00.000Z');
  assert.throws(() => closedFrame(bars.slice(0, 49), 15, now), /Insufficient/);
  assert.throws(() => closedFrame(bars.filter((_, i) => i !== 30), 15, now), /gaps/);
  assert.throws(() => closedFrame(bars, 15, now + 30 * 60000), /stale/);
});
test('quotes must be finite and fresh', () => {
  assert.equal(freshQuote({ price: 100, asOf: new Date(now).toISOString() }, now), true);
  for (const q of [{ price: 0, asOf: new Date(now).toISOString() }, { price: 100 }, { price: 100, asOf: new Date(now - 301000).toISOString() }, { price: 100, stale: true, asOf: new Date(now).toISOString() }]) assert.equal(freshQuote(q, now), false);
});
const long = { symbol: 'BTC-USD', direction: 'LONG', entry: 50000, stop: 49000, target: 53500, rationale: 'Retest of observed support', trigger: 'Closed bullish retest candle' };
test('fractional sizing respects both stop risk and 2x cash margin', () => {
  const s = sizeCryptoSetup(long, 50000, 1000, 500);
  assert.equal(s.units, 0.0049);
  assert.ok(s.riskUsd <= 5);
  assert.ok(s.margin <= 250);
  assert.ok(s.rewardRisk >= 3);
  const short = sizeCryptoSetup({ ...long, direction: 'SHORT', stop: 51000, target: 46500 }, 50000, 1000, 500);
  assert.equal(short.units, s.units);
  const cap = sizeCryptoSetup({ ...long, stop: 49900, target: 50400 }, 50000, 1000, 100);
  assert.equal(cap.margin, 245);
});
test('rejects chasing, missing invalidation, inadequate reward and tiny stops', () => {
  assert.throws(() => sizeCryptoSetup({ ...long, target: 54500 }, 50200, 1000, 500), /moved/);
  assert.throws(() => sizeCryptoSetup({ ...long, target: 51000 }, 50000, 1000, 500), /Reward/);
  assert.throws(() => sizeCryptoSetup({ ...long, stop: 51000 }, 50000, 1000, 500), /geometry/);
  assert.throws(() => sizeCryptoSetup({ ...long, stop: 49999 }, 50000, 1000, 500), /tight/);
  assert.throws(() => sizeCryptoSetup(long, 50000, 0, 500), /Invalid/);
});
test('AI schema allows no trade and rejects unapproved assets and actions', () => {
  assert.ok(proposalSchema.safeParse({ setup: null, reason: 'No confirmation' }).success);
  assert.ok(proposalSchema.safeParse({ setup: long, reason: 'Confirmed setup' }).success);
  assert.equal(proposalSchema.safeParse({ setup: { ...long, symbol: 'DOGE-USD' }, reason: 'Test' }).success, false);
  assert.equal(proposalSchema.safeParse({ setup: { ...long, direction: 'BUY' }, reason: 'Test' }).success, false);
});
