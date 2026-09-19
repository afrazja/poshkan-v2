import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const db = new pg.Client({connectionString:process.env.NEON_PREVIEW_DATABASE_URL,connectionTimeoutMillis:15000});
let transaction=false;
try {
  await db.connect();
  await db.query('BEGIN'); transaction=true;
  const actor=process.env.NEON_PREVIEW_USER_ID;
  const {rows}=await db.query(`INSERT INTO poshkan_trade_test.accounts(user_id,name,type,cash_balance)
    SELECT legacy_user_id,'Rollback-only migration test','stocks',1000 FROM poshkan_trade_test.auth_links WHERE neon_user_id=$1 RETURNING id`,[actor]);
  assert.equal(rows.length,1);
  await db.query('SET LOCAL ROLE poshkan_trade_preview');
  await db.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[actor]);
  const request=randomUUID();
  const input={action:'SPOT',accountId:rows[0].id,symbol:'AAPL',side:'BUY',quantity:'2'};
  const result=await db.query('SELECT poshkan_trade_test.command($1,$2,$3) AS result',[request,input,'100']);
  const repeated=await db.query('SELECT poshkan_trade_test.completed($1,$2) AS result',[request,input]);
  assert.deepEqual(repeated.rows[0].result,result.rows[0].result);
  const accounts=(await db.query('SELECT poshkan_trade_test.state() AS accounts')).rows[0].accounts;
  assert.equal(accounts.find(a=>a.id===rows[0].id).cash,'800.00000000');
  const pendingInput={action:'PLACE_LIMIT',accountId:rows[0].id,symbol:'AAPL',direction:'SELL',quantity:'1',target:'110',expiryHours:null};
  const queued=(await db.query('SELECT poshkan_trade_test.order_command($1,$2) AS result',[randomUUID(),pendingInput])).rows[0].result;
  const checked=(await db.query('SELECT poshkan_trade_test.check_order($1,$2,$3,$4,$5,$6) AS result',['LIMIT',queued.id,rows[0].id,'AAPL','111',new Date()])).rows[0].result;
  assert.equal(checked.status,'filled');
  assert.equal((await db.query('SELECT poshkan_trade_test.check_order($1,$2,$3,$4,$5,$6) AS result',['LIMIT',queued.id,rows[0].id,'AAPL','111',new Date()])).rows[0].result.status,'unchanged');
  const updated=(await db.query('SELECT poshkan_trade_test.state() AS accounts')).rows[0].accounts;
  assert.equal(updated.find(a=>a.id===rows[0].id).cash,'911.00000000');
  const orderState=(await db.query('SELECT poshkan_trade_test.order_state() AS state')).rows[0].state;
  assert.equal(orderState.orders.find(o=>o.id===queued.id).status,'filled');
  await db.query('ROLLBACK'); transaction=false;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.accounts WHERE id=$1',[rows[0].id])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.requests WHERE request_id=$1',[request])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.orders WHERE id=$1',[queued.id])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_stage.auth_links WHERE application_access_enabled')).rows[0].n,0);
  console.log('PASS: Neon manual trade, pending order, atomic fill, duplicate check, trusted role and balances; all test writes rolled back; original snapshot remains disabled.');
} catch(error) {
  console.error('Neon trading verification failed:',error.code || error.name);
  process.exitCode=1;
} finally {
  if(transaction) await db.query('ROLLBACK').catch(()=>{});
  await db.end();
}
