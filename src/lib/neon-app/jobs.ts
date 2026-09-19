import { appOrigin, captureDeliveries, productionEnabled } from '../neon-preview/config';
import { databaseSchema } from './schema.mjs';
import 'server-only';
import YahooFinance from 'yahoo-finance2';
import { checkedQuote } from '../neon-preview/quote.mjs';
import { serviceWork, createNeonServiceClient } from './services';
import { sendPushToUser } from '../push';
import { sendEmail, alertEmailHtml } from '../email';
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function runNeonMarketCheck() {
  if (productionEnabled()) await serviceWork(c=>c.query('SELECT poshkan_live.cloud_contact()'));
  const candidates: {kind:string;id:string;accountId:string;symbol:string}[] = await serviceWork(async c => (await c.query(`SELECT ${databaseSchema()}.order_candidates() AS items`)).rows[0].items);
  const summary: Record<string,number> = {};
  for (const item of candidates) {
    let price: string | null = null, at: Date | null = null;
    try { const q = await yahoo.quote(item.symbol); price = checkedQuote(item.symbol, q, item.kind !== 'LIMIT'); at = q.regularMarketTime ?? null; } catch {}
    const result = await serviceWork(async c => (await c.query(`SELECT ${databaseSchema()}.service_check($1,$2,$3,$4,$5,$6) AS result`, [item.kind,item.id,item.accountId,item.symbol,price,at])).rows[0].result);
    summary[result.status] = (summary[result.status] || 0) + 1;
  }
  const db = createNeonServiceClient();
  const {data: alerts,error} = await db.from('alerts').select('*').eq('status','active');
  if (error) throw new Error('Could not read price alerts');
  let triggered = 0;
  for (const alert of alerts || []) {
    let price: number;
    try { const q = await yahoo.quote(String(alert.symbol)); price = Number(checkedQuote(String(alert.symbol),q,false)); } catch { continue; }
    const target = Number(alert.target_price);
    if (!(alert.condition === 'ABOVE' ? price >= target : price <= target)) continue;
    const {data: claimed,error: claimError} = await db.from('alerts').update({status:'triggered',triggered_at:new Date().toISOString(),triggered_price:price}).eq('id',alert.id).eq('status','active').select('id');
    if (claimError) throw new Error('Could not claim price alert');
    if (!claimed?.length) continue;
    triggered++;
    await sendPushToUser(alert.user_id,{title:`${alert.symbol} price alert`,body:`Price reached ${price}.`});
    const {data:{user}} = await db.auth.admin.getUserById(alert.user_id);
    if (user?.email) await sendEmail(user.email,`${alert.symbol} price alert`,alertEmailHtml({symbol:alert.symbol,condition:alert.condition,targetPrice:target,triggeredPrice:price,appUrl:appOrigin()}));
  }
  if (productionEnabled()) await serviceWork(c=>c.query('SELECT poshkan_live.cloud_contact($1)', [summary]));
  return {...summary,triggered,delivery:captureDeliveries()?'captured locally':'configured providers'};
}
