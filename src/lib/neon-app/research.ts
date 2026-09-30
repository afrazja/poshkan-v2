import 'server-only';
import type { PoolClient } from 'pg';
import { databaseSchema } from './schema.mjs';
import { researchInput } from '../research-input';
import { z } from 'zod';
import { reviewLedger } from '../performance-review.mjs';

export async function researchReady(c:PoolClient) {
  return (await c.query('SELECT to_regclass($1) IS NOT NULL AS ready',[`${databaseSchema()}.research_entries`])).rows[0].ready as boolean;
}
export async function researchMutation(c:PoolClient,request:unknown,input:unknown) {
  const id=z.uuid().parse(request),command=researchInput.parse(input);
  if(!await researchReady(c))throw new Error('Research journal migration is required');
  return (await c.query(`SELECT ${databaseSchema()}.research_command($1,$2) AS result`,[id,command])).rows[0].result;
}
export async function researchState(c:PoolClient,accountId?:string) {
  const schema=databaseSchema();
  if(accountId) {
    z.uuid().parse(accountId);
    const account=(await c.query(`SELECT id,type FROM ${schema}.accounts WHERE id=$1 AND user_id=${schema}.actor()`,[accountId])).rows[0];
    if(!account)throw new Error('Account not found');
    if(account.type==='forex')return {available:false};
  }
  if(!await researchReady(c))return {available:false};
  const entries=(await c.query(`SELECT e.*,coalesce((SELECT jsonb_agg(r ORDER BY r.created_at,r.id) FROM ${schema}.research_reviews r WHERE r.entry_id=e.id),'[]') AS reviews,coalesce((SELECT jsonb_agg(l ORDER BY l.created_at,l.transaction_key) FROM ${schema}.research_links l WHERE l.entry_id=e.id),'[]') AS links FROM ${schema}.research_entries e WHERE e.user_id=${schema}.actor() ${accountId?'AND e.account_id=$1':''} ORDER BY e.created_at DESC,e.id`,accountId?[accountId]:[])).rows;
  if(!accountId)return {available:true,entries};
  const profile=(await c.query(`SELECT * FROM ${schema}.execution_profiles WHERE account_id=$1`,[accountId])).rows[0]??null;
  const transactions=(await c.query(`SELECT * FROM ${schema}.transactions WHERE account_id=$1 ORDER BY created_at,id`,[accountId])).rows;
  return {available:true,entries,profile,transactions,review:{...reviewLedger(transactions),basis:'Weighted-average fee-inclusive spot basis; authoritative net P&L for new sales',scope:'Available spot ledger since latest reset; sale executions may be partial exits',costTreatment:'Spread/slippage are embedded in fill price; explicit fees are additional. Entry fees remain in basis until sold. Do not subtract cost totals again.'},benchmark:{symbol:'^GSPC',type:'S&P 500 price return; not total return or risk-matched',comparisonEndpoint:`/api/performance?accountId=${accountId}`,coverage:'Available daily snapshots after latest reset day; missing history is unavailable',portfolio:'Whole-account daily cash-flow-adjusted chained returns, including leveraged positions; intraday flow timing is approximate'}};
}
