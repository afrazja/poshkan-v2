import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {executeQuery} from '../src/lib/neon-app/query.mjs';
export async function verifyApp(db,{user,legacy,account,command}) {
  // Make room for one market only inside a rolled-back local fixture transaction.
  const creation=await db.connect();
  try {
    await creation.query('BEGIN');
    await creation.query("UPDATE poshkan_trade_test.accounts SET type='forex' WHERE user_id=$1",[legacy]);
    await creation.query('SET LOCAL ROLE poshkan_trade_preview');
    await creation.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
    const made=(await creation.query("SELECT poshkan_trade_test.app_account('CREATE',NULL,$1) AS result",[{name:'New account test',type:'stocks',amount:1000}])).rows[0].result.id;
    assert.equal((await creation.query('SELECT count(*)::int AS n FROM poshkan_trade_test.transactions WHERE account_id=$1',[made])).rows[0].n,1);
    await creation.query('SAVEPOINT duplicate_market');
    await assert.rejects(creation.query("SELECT poshkan_trade_test.app_account('CREATE',NULL,$1)",[{name:'Second account test',type:'stocks',amount:1000}]),/already have/);
    await creation.query('ROLLBACK TO SAVEPOINT duplicate_market');
    await creation.query('ROLLBACK');
  } finally {await creation.query('ROLLBACK').catch(()=>{});creation.release();}
  const work=async fn=>{
    const c=await db.connect();
    try {await c.query('BEGIN');await c.query('SET LOCAL ROLE poshkan_trade_preview');await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);const value=await fn(c);await c.query('COMMIT');return value;}
    catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  };
  const client=createClient('https://adapter.invalid','test',{auth:{persistSession:false},global:{fetch:(input,init)=>work(c=>executeQuery(c,new URL(String(input)),init))}});
  const own=await client.from('accounts').select('*').order('created_at');
  assert.equal(own.error,null);assert(own.data.length>=4);assert(own.data.every(a=>a.user_id===legacy && typeof a.cash_balance==='number'));
  const foreign=(await db.query('SELECT id FROM poshkan_trade_test.accounts WHERE user_id<>$1 LIMIT 1',[legacy])).rows[0].id;
  assert.equal((await client.from('accounts').select('*').eq('id',foreign).maybeSingle()).data,null);
  const profile=await client.from('profiles').select('username,theme').eq('id',legacy).single();assert.equal(profile.error,null);
  const snapshots=await client.from('account_snapshots').select('snapshot_date,total_value').limit(2);
  assert(snapshots.data.every(s=>/^\d{4}-\d{2}-\d{2}$/.test(s.snapshot_date)&&typeof s.total_value==='number'));
  const theme=profile.data.theme==='dark'?'light':'dark';
  assert.equal((await client.from('profiles').update({theme}).eq('id',legacy)).error,null);
  assert.equal((await client.from('profiles').select('theme').eq('id',legacy).single()).data.theme,theme);
  await client.from('profiles').update({theme:profile.data.theme}).eq('id',legacy);
  const id=await account('stocks','1000');
  assert.equal((await client.from('accounts').update({name:'Neon interface check'}).eq('id',id)).error,null);
  const watch=await client.from('watchlist').insert({account_id:id,symbol:'AAPL'}).select('id,symbol').single();assert.equal(watch.error,null);
  assert.equal((await client.from('watchlist').upsert({account_id:id,symbol:'AAPL'},{onConflict:'account_id,symbol'})).error,null);
  const position=await command({action:'OPEN_FX',accountId:id,symbol:'AAPL',direction:'LONG',units:'1',leverage:1,stopLoss:null,takeProfit:null,autoCloseMinutes:5},'100');
  const entry=(await work(c=>c.query('SELECT poshkan_trade_test.order_command($1,$2) AS result',[randomUUID(),{action:'PLACE_ENTRY',accountId:id,symbol:'AAPL',direction:'LONG',quantity:'1',target:'90',trigger:'AT_OR_BELOW',leverage:1,stopLoss:null,takeProfit:null,expiryHours:null,expiryMinutes:15}]))).rows[0].result;
  await work(c=>c.query('SELECT poshkan_trade_test.app_edit_entry($1,$2,91,80,110,100)',[entry.id,id]));
  const edited=await client.from('fx_orders').select('entry_rate,expires_at').eq('id',entry.id).single();
  assert.equal(edited.data.entry_rate,91);assert(Date.parse(edited.data.expires_at)>Date.now());
  await work(c=>c.query("SELECT poshkan_trade_test.order_command($1,$2)",[randomUUID(),{action:'SET_LEVELS',accountId:id,positionId:position.positionId,levels:[{price:'110',units:'1'}]}]));
  const levels=await client.from('fx_tp_levels').select('id,position_id,price,close_units,status,fx_positions!inner(account_id)').eq('fx_positions.account_id',id).eq('status','pending');assert.equal(levels.error,null);assert.equal(levels.data.length,1);
  const timed=(await db.query('SELECT auto_close_at>now() AS ok FROM poshkan_trade_test.fx_positions WHERE id=$1',[position.positionId])).rows[0].ok;assert(timed);
  const counted=await client.from('transactions').select('id',{count:'exact',head:true}).eq('account_id',id);assert.equal(counted.error,null);
  const paged=await client.from('accounts').select('id').in('id',[id,foreign]).range(0,2);assert.equal(paged.error,null);assert.equal(paged.data.length,1);
  await assert.rejects(work(c=>c.query('UPDATE poshkan_trade_test.accounts SET cash_balance=999999 WHERE id=$1',[id])),/permission denied/);
  await assert.rejects(work(c=>c.query("UPDATE poshkan_trade_test.orders SET status='filled'")),/permission denied/);
  await assert.rejects(work(c=>executeQuery(c,new URL('https://adapter.invalid/accounts?select=id;DROP%20TABLE%20accounts'))),/identifier/);
  await assert.rejects(work(c=>executeQuery(c,new URL('https://adapter.invalid/auth_links'))),/Unsupported/);
  assert.equal((await work(c=>c.query('SELECT * FROM poshkan_trade_test.get_leaderboard()'))).rows.length>0,true);
  await work(c=>c.query("SELECT poshkan_trade_test.app_account('RESET',$1,$2)",[id,{amount:500}]));
  assert.equal((await client.from('accounts').select('cash_balance').eq('id',id).single()).data.cash_balance,500);
  await work(c=>c.query("SELECT poshkan_trade_test.app_account('DELETE',$1,'{}')",[id]));
  assert.equal((await client.from('watchlist').select('id').eq('account_id',id)).data.length,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_stage.auth_links WHERE application_access_enabled')).rows[0].n,0);
  return ['full-interface query adapter: owner isolation, profile/theme, watchlist upsert, joined exits, pagination and count','direct balance/order-state writes and SQL injection denied; atomic timed open, reset and account deletion'];
}
