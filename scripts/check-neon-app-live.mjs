import pg from 'pg';
import assert from 'node:assert/strict';
import {executeQuery} from '../src/lib/neon-app/query.mjs';
const connection=process.env.NEON_PREVIEW_DATABASE_URL;
if(!connection || !connection.includes('ep-weathered-sunset-b59oda3r.c-7.us-east-2.aws.neon.tech')) throw new Error('Expected the rehearsal database');
const c=new pg.Client({connectionString:connection});
try {
  await c.connect();await c.query('BEGIN');
  const legacy='0a1d36a2-fbdf-4f7c-a736-a05a91a81246';
  const expected=(await c.query('SELECT id FROM poshkan_stage.accounts WHERE user_id=$1',[legacy])).rows.map(a=>a.id).sort();
  const foreign=(await c.query('SELECT id FROM poshkan_trade_test.accounts WHERE user_id<>$1 LIMIT 1',[legacy])).rows[0].id;
  await c.query('SET LOCAL ROLE poshkan_trade_preview');
  await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[process.env.NEON_PREVIEW_USER_ID]);
  const query=async path=> (await executeQuery(c,new URL('https://adapter.invalid/'+path))).json();
  const accounts=await query('accounts?select=id,user_id,cash_balance');
  assert.deepEqual(accounts.map(a=>a.id).sort(),expected);
  assert(accounts.every(a=>a.user_id===legacy));
  assert.equal((await query('accounts?id=eq.'+foreign)).length,0);
  for(const table of ['positions','transactions','fx_positions','watchlist','account_snapshots','orders','fx_orders']) {
    const rows=await query(table+'?select=account_id');
    assert(rows.every(row=>expected.includes(row.account_id)));
  }
  const profiles=await query('profiles?select=id,theme');assert.equal(profiles.length,1);
  await executeQuery(c,new URL('https://adapter.invalid/profiles?id=eq.'+legacy),{method:'PATCH',body:JSON.stringify({theme:'light'})});
  assert.equal((await query('profiles?select=theme'))[0].theme,'light');
  await c.query('SAVEPOINT denied');
  await assert.rejects(c.query('UPDATE poshkan_trade_test.accounts SET cash_balance=1'),/permission denied/);
  await c.query('ROLLBACK TO SAVEPOINT denied');
  await c.query('ROLLBACK');
  console.log('PASS: Neon full-interface reads, owner isolation, profile update/rollback and denied direct balance updates. No test changes retained.');
} finally {await c.query('ROLLBACK').catch(()=>{});await c.end();}
