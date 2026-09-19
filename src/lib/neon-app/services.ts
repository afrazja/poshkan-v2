import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fullAppEnabled } from '../neon-preview/config';
import { transaction } from '../neon-preview/trading';
import { executeQuery } from './query.mjs';
import YahooFinance from 'yahoo-finance2';
import { checkedQuote } from '../neon-preview/quote.mjs';
const yahoo = new YahooFinance({suppressNotices:['yahooSurvey']});

export function servicesEnabled() {
  return fullAppEnabled() && process.env.POSHKAN_NEON_SERVICES === '1';
}

export async function serviceWork<T>(work: Parameters<typeof transaction<T>>[1], cache = false) {
  if (!servicesEnabled() || !process.env.NEON_PREVIEW_USER_ID) throw new Error('Neon test services are disabled');
  return transaction(process.env.NEON_PREVIEW_USER_ID, async c => {
    if (!cache) await c.query('SELECT poshkan_trade_test.actor()');
    return work(c);
  }, cache ? 'cache' : 'services');
}

export function createNeonServiceClient(scope: 'services' | 'cache' = 'services'): SupabaseClient {
  if (!servicesEnabled()) throw new Error('Neon test services are disabled');
  const client = createClient('https://neon-services.invalid', 'internal-adapter', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      try {
        const url = new URL(String(input));
        if (url.pathname.includes('/rpc/')) {
          if (scope !== 'services') throw new Error('Unsupported cache operation');
          const name=url.pathname.split('/').pop();
          const args=JSON.parse(String(init?.body || '{}'));
          if(name==='fx_close') {
            const position=await serviceWork(async c=>(await c.query('SELECT id,account_id,symbol FROM poshkan_trade_test.fx_positions WHERE id=$1 AND status=$2',[args.p_position_id,'open'])).rows[0]);
            if(!position)throw new Error('Position not found');
            const q=await yahoo.quote(String(position.symbol));
            const price=checkedQuote(position.symbol,q,true);
            await serviceWork(c=>c.query('SELECT poshkan_trade_test.service_check($1,$2,$3,$4,$5,$6)',['POSITION',position.id,position.account_id,position.symbol,price,q.regularMarketTime]));
            const receipt=await serviceWork(async c=>(await c.query('SELECT status,pnl FROM poshkan_trade_test.fx_positions WHERE id=$1',[position.id])).rows[0]);
            if(receipt.status==='open')throw new Error('Closure not due or background execution paused');
            return Response.json(Number(receipt.pnl));
          }
          const parameters: Record<string,string[]> = {
            claim_crypto_monitor:['p_account_id'],
            mcp_open_crypto_position:['p_account_id','p_symbol','p_direction','p_units','p_rate','p_leverage','p_stop_loss','p_take_profit','p_auto_close_minutes','p_dry_run'],
            open_cloud_crypto:['p_run_id','p_symbol','p_direction','p_units','p_rate','p_stop_loss','p_take_profit','p_dry_run'],
          };
          if (!name || !(name in parameters)) throw new Error('Unsupported service operation');
          if (name==='mcp_open_crypto_position' && args.p_dry_run!==true) throw new Error('Background entries require a durable cloud run');
          const keys=parameters[name];
          if(Object.keys(args).some(key=>!keys.includes(key))) throw new Error('Unsupported service arguments');
          const result=await serviceWork(async c=>(await c.query(`SELECT poshkan_trade_test.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,keys.map(key=>args[key]??null))).rows[0].result);
          return Response.json(result);
        }
        return await serviceWork(c => executeQuery(c, url, init, scope), scope === 'cache');
      } catch (error) {
        const code = (error as { code?: string }).code;
        console.warn('[neon-services]', { code: code || 'UNSUPPORTED_OPERATION' });
        return Response.json({ message: 'The Neon service operation failed.', code: code || 'SERVICE_ERROR', details: '', hint: '' }, { status: 400 });
      }
    } },
  });
  const users = async () => serviceWork(async c => {
    const { rows } = await c.query('SELECT * FROM poshkan_trade_test.service_user()');
    return rows.map(u => ({ id: u.id as string, email: u.email as string, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' }));
  });
  client.auth.admin.listUsers = async () => ({ data: { users: await users(), aud: 'authenticated', nextPage: null, lastPage: 1, total: 1 }, error: null });
  client.auth.admin.getUserById = async id => {
    const user = (await users()).find(u => u.id === id);
    if (!user) throw new Error('User not found');
    return { data: { user }, error: null };
  };
  return client;
}

// Local delivery verification deliberately never contacts email/push providers.
export async function captureDelivery(channel: 'email' | 'push', recipient: string, payload: object) {
  await serviceWork(async c => {
    await c.query('SELECT poshkan_trade_test.capture_delivery($1,$2,$3::jsonb)', [channel, recipient, JSON.stringify(payload)]);
  });
}
