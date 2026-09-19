import 'server-only';
import YahooFinance from 'yahoo-finance2';
import { z } from 'zod';
import { serviceWork, createNeonServiceClient } from './services';
import { aiUniverse, analyzeMarket, buildSummary, type PairSummary } from '../forex-scan';
import { getUserAnthropicKey } from '../anthropic-key';
import { assetTypeError } from '../assets';
import { checkedQuote } from '../neon-preview/quote.mjs';
import { sendPushToUser } from '../push';

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const positive = z.number().finite().positive();
const proposalSchema = z.object({
  pair: z.string().min(1).max(24).transform(s => s.toUpperCase()),
  direction: z.enum(['LONG', 'SHORT']), entryType: z.enum(['market', 'limit']).default('market'),
  entry: positive, stop: positive, takeProfit: positive, rationale: z.string().max(5000),
}).refine(s => s.direction === 'LONG' ? s.stop < s.entry && s.takeProfit > s.entry : s.stop > s.entry && s.takeProfit < s.entry)
  .refine(s => Math.abs(s.takeProfit - s.entry) >= 2 * Math.abs(s.entry - s.stop));

type Account = { id: string; user_id: string; type: string; ai_symbols: string[] | null; ai_instruction: string | null; auto_trade_enabled: boolean };

export async function runNeonAiScan(preview = false, accountId?: string) {
  // A manually requested preview may call Claude, but never claims a signal or
  // places a trade. Repeated paid scans require a separate explicit opt-in.
  if (!preview && process.env.POSHKAN_NEON_AI_SCANS !== '1')
    return { blocked: 'Scheduled AI scans are disabled for this local rehearsal.' };
  const db = createNeonServiceClient();
  const accounts = await serviceWork(async c => (await c.query<Account>(
    'SELECT id,user_id,type,ai_symbols,ai_instruction,auto_trade_enabled FROM poshkan_trade_test.accounts WHERE ($1::uuid IS NULL OR id=$1) ORDER BY id', [accountId ?? null])).rows);
  if (!accounts.length) return { blocked: 'No approved account found.' };
  const apiKey = await getUserAnthropicKey(db, accounts[0].user_id);
  if (!apiKey) return { blocked: 'The saved Claude API key could not be unlocked. Check the original encryption key and the account API key.' };
  const results: Array<{ accountId: string; status: string; entry?: boolean }> = [];
  for (const account of accounts) {
    try {
      const symbols = [...new Set(account.ai_symbols?.length ? account.ai_symbols : aiUniverse(account.type))]
        .filter(s => assetTypeError(account.type, s) === null);
      if (!symbols.length) { results.push({ accountId: account.id, status: 'no symbols' }); continue; }
      // Reject closed/stale execution markets before spending an AI request.
      const probe = await yahoo.quote(symbols[0]);
      checkedQuote(symbols[0], probe, true);
      const summaries = (await Promise.all(symbols.map(buildSummary))).filter((s): s is PairSummary => s !== null);
      if (!summaries.length) { results.push({ accountId: account.id, status: 'no data' }); continue; }
      const analysis = await analyzeMarket(summaries, account.ai_instruction, apiKey, account.type);
      // Provider errors can include request details. Expose only a fixed status.
      if (analysis.error) { results.push({ accountId: account.id, status: 'AI request failed' }); continue; }
      if (!analysis.setup) { results.push({ accountId: account.id, status: 'no setup' }); continue; }
      const proposal = proposalSchema.parse(analysis.setup);
      if (!symbols.some(s => s.toUpperCase() === proposal.pair)) throw new Error('Unexpected symbol');
      if (preview) { results.push({ accountId: account.id, status: 'preview validated', entry: false }); continue; }
      const signal = await serviceWork(async c => (await c.query('SELECT poshkan_trade_test.claim_ai_signal($1,$2) AS id', [account.id, proposal])).rows[0].id as string | null);
      if (!signal) { results.push({ accountId: account.id, status: 'duplicate skipped' }); continue; }
      let entered = false;
      if (process.env.AUTO_TRADE_ENABLED === 'true' && account.auto_trade_enabled && proposal.entryType === 'market') {
        try {
          const exposure = await serviceWork(async c => (await c.query<{symbol:string}>("SELECT DISTINCT symbol FROM poshkan_trade_test.fx_positions WHERE account_id=$1 AND status='open'", [account.id])).rows);
          const quotes = Object.fromEntries(await Promise.all([...new Set([proposal.pair, ...exposure.map(p => p.symbol)])].map(async symbol => {
            const quote = await yahoo.quote(symbol);
            return [symbol, { price: checkedQuote(symbol, quote, true), at: quote.regularMarketTime }];
          })));
          const receipt = await serviceWork(async c => (await c.query('SELECT poshkan_trade_test.execute_ai_signal($1,$2) AS receipt', [signal, quotes])).rows[0].receipt);
          entered = Boolean(receipt?.positionId);
        } catch {
          // A response may be lost after commit: reconcile the durable receipt
          // before reporting an alert. Do not guess or submit a second signal.
          const receipt = await serviceWork(async c => (await c.query('SELECT receipt FROM poshkan_trade_test.fx_scan_alerts WHERE id=$1', [signal])).rows[0]?.receipt);
          entered = Boolean(receipt?.positionId);
        }
      }
      await sendPushToUser(account.user_id, {
        title: entered ? `AI paper entry: ${proposal.direction} ${proposal.pair}` : `AI setup: ${proposal.direction} ${proposal.pair}`,
        body: entered ? 'The entry and protective levels were recorded. Review the fill in account history.' : `Proposed entry ${proposal.entry}, stop ${proposal.stop}, target ${proposal.takeProfit}. No automatic entry was placed.`,
        url: `/dashboard/${account.id}`,
      });
      results.push({ accountId: account.id, status: entered ? 'opened' : 'alert captured', entry: entered });
    } catch { results.push({ accountId: account.id, status: 'data or validation unavailable' }); }
  }
  return { preview, automaticEntriesEnabled: process.env.AUTO_TRADE_ENABLED === 'true', results,
    ...(results.some(r => r.status === 'AI request failed') ? { error: 'An AI request failed.' } : {}) };
}
