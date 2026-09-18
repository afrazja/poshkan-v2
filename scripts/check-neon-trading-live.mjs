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
  await db.query('ROLLBACK'); transaction=false;
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.accounts WHERE id=$1',[rows[0].id])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.requests WHERE request_id=$1',[request])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_stage.auth_links WHERE application_access_enabled')).rows[0].n,0);
  console.log('PASS: Neon execution, trusted role, balance change and retry lookup; test transaction fully rolled back; original snapshot remains disabled.');
} catch(error) {
  console.error('Neon trading verification failed:',error.code || error.name);
  process.exitCode=1;
} finally {
  if(transaction) await db.query('ROLLBACK').catch(()=>{});
  await db.end();
}
