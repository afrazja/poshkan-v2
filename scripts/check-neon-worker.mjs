import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {createWorkerQuoteProvider,runWorkerPass} from './neon-worker-runtime.mjs';

export async function verifyWorker(db,{user,legacy,account,balance}) {
  assert.equal(typeof createWorkerQuoteProvider(new AbortController().signal),'function');
  const password=randomBytes(36).toString('base64');
  await db.query("SELECT set_config('poshkan.worker_password',$1,false)",[password]);
  await db.query("DO $$ BEGIN EXECUTE format('ALTER ROLE poshkan_preview_worker LOGIN PASSWORD %L',current_setting('poshkan.worker_password')); END $$");
  const config={...db.options,user:'poshkan_preview_worker',password};
  const first=new pg.Client(config),second=new pg.Client(config);
  const checks=[];
  async function web(sql,args=[]) {
    const c=await db.connect();
    try {
      await c.query('BEGIN');await c.query('SET LOCAL ROLE poshkan_trade_preview');
      await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
      const result=await c.query(sql,args);await c.query('COMMIT');return result.rows[0]?.result;
    } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
  }
  const toggle=enabled=>web('SELECT poshkan_trade_test.set_worker($1) AS result',[enabled]);
  const place=async id=>web('SELECT poshkan_trade_test.order_command($1,$2) AS result',[randomUUID(),{action:'PLACE_LIMIT',accountId:id,symbol:'AAPL',direction:'BUY',quantity:'2',target:'100',expiryHours:null}]);
  const execute=(client,id,aid,price='99')=>client.query('SELECT poshkan_trade_test.worker_check($1,$2,$3,$4,$5,$6) AS result',['LIMIT',id,aid,'AAPL',price,new Date()]);
  const quote=symbol=>({symbol,regularMarketPrice:symbol==='AAPL'?99:1.1,regularMarketTime:new Date(),marketState:'REGULAR',currency:symbol==='USDJPY=X'?'JPY':'USD',quoteType:symbol.endsWith('=X')?'CURRENCY':symbol.endsWith('-USD')?'CRYPTOCURRENCY':'EQUITY'});
  try {
    await first.connect();await second.connect();
    assert.equal((await first.query('SELECT session_user AS name')).rows[0].name,'poshkan_preview_worker');
    assert.equal((await first.query('SELECT poshkan_trade_test.worker_claim() AS acquired')).rows[0].acquired,true);
    assert.equal((await second.query('SELECT poshkan_trade_test.worker_claim() AS acquired')).rows[0].acquired,false);
    await assert.rejects(first.query('SELECT * FROM poshkan_trade_test.accounts'),/permission denied/);
    await assert.rejects(first.query('SELECT poshkan_trade_test.order_command($1,$2)',[randomUUID(),{}]),/permission denied/);
    await assert.rejects(first.query('SELECT poshkan_trade_test.set_worker(true)'),/permission denied/);
    await assert.rejects(first.query('SET ROLE poshkan_trade_preview'),/permission denied/);
    const impersonator=await db.connect();
    try {
      await impersonator.query('SET ROLE poshkan_preview_worker');
      await assert.rejects(impersonator.query('SELECT poshkan_trade_test.worker_poll()'),/Worker login required/);
      await impersonator.query('RESET ROLE');
    } finally {impersonator.release();}
    await assert.rejects(toggle(true),/offline/);
    let fetched=0;
    assert.deepEqual(await runWorkerPass(first,async()=>{fetched++;throw new Error('Must not fetch while paused');}),{enabled:false});
    assert.equal(fetched,0);assert.equal((await toggle(true)).enabled,true);
    const stock=await account('stocks','1000');
    const order=await place(stock);
    await runWorkerPass(first,async symbol=>quote(symbol));
    assert.equal(await balance(stock),'802.00000000');
    assert.equal((await execute(first,order.id,stock)).rows[0].result.status,'unchanged');
    assert.equal((await web('SELECT poshkan_trade_test.worker_state() AS result')).online,true);
    checks.push('dedicated login works without browser identity; no table/manual-trade/control permissions; SET ROLE impersonation blocked; singleton lease; paused worker fetches nothing');
    const raced=await place(stock);
    const results=await Promise.all([
      execute(first,raced.id,stock),
      web('SELECT poshkan_trade_test.check_order($1,$2,$3,$4,$5,$6) AS result',['LIMIT',raced.id,stock,'AAPL','99',new Date()]),
    ]);
    const statuses=[results[0].rows[0].result.status,results[1].status];
    assert.equal(statuses.filter(s=>s==='filled').length,1);assert.equal(await balance(stock),'604.00000000');
    const paused=await place(stock);
    await runWorkerPass(first,async symbol=>{await toggle(false);return quote(symbol);});
    assert.equal((await execute(first,paused.id,stock)).rows[0].result.status,'paused');
    assert.equal(await balance(stock),'604.00000000');
    await toggle(true);
    const foreign=(await db.query('SELECT id FROM poshkan_trade_test.accounts WHERE user_id<>$1 LIMIT 1',[legacy])).rows[0].id;
    await first.query("SELECT set_config('poshkan.neon_user_id',$1,false)",[randomUUID()]);
    await assert.rejects(execute(first,paused.id,foreign),/Account not found/);
    const items=(await first.query('SELECT poshkan_trade_test.worker_poll() AS result')).rows[0].result.items;
    assert.ok(!items.some(x=>x.accountId===foreign));
    await db.query('UPDATE neon_auth."user" SET banned=true WHERE id=$1',[user]);
    await assert.rejects(execute(first,paused.id,stock),/Not authorized/);
    await db.query('UPDATE neon_auth."user" SET banned=false WHERE id=$1',[user]);
    checks.push('worker/page racing fills only once; pause during a quote blocks its fill; forged identity/foreign accounts/banned owner denied');
    await runWorkerPass(first,async symbol=>({...quote(symbol),regularMarketTime:new Date(Date.now()-600000)}));
    assert.equal(await balance(stock),'604.00000000');
    const expiring=await place(stock);
    await db.query("UPDATE poshkan_trade_test.orders SET expires_at=now()-interval '1 minute' WHERE id=$1",[expiring.id]);
    await runWorkerPass(first,async()=>{throw new Error('Feed offline');});
    assert.equal((await db.query('SELECT status FROM poshkan_trade_test.orders WHERE id=$1',[expiring.id])).rows[0].status,'expired');
    assert.equal(await balance(stock),'604.00000000');
    await toggle(false);
    await first.end();
    assert.equal((await second.query('SELECT poshkan_trade_test.worker_claim() AS acquired')).rows[0].acquired,true);
    assert.equal((await second.query('SELECT poshkan_trade_test.worker_poll() AS result')).rows[0].result.enabled,false);
    await assert.rejects(second.query('SELECT poshkan_trade_test.worker_report($1)',[{error:'sensitive text'}]),/Invalid worker summary/);
    checks.push('stale/failed feed prevents fills but permits expiry; summary contains counts only; disconnect releases lease; pause survives reconnect');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_stage.auth_links WHERE application_access_enabled')).rows[0].n,0);
    return checks;
  } finally {await first.end().catch(()=>{});await second.end().catch(()=>{});}
}
