import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {executeQuery} from '../src/lib/neon-app/query.mjs';

export async function verifyProduction(db,{migration,run,user,legacy}) {
  run('psql',['-X','-v','ON_ERROR_STOP=1','-f',join(migration,'generated/production/import-stage.sql')]);
  await db.query(readFileSync(join(migration,'generated/production/install-live.sql'),'utf8'));
  const accounts=(await db.query('SELECT id,cash_balance::text FROM poshkan_live.accounts ORDER BY id')).rows;
  assert.deepEqual(accounts,(await db.query('SELECT id,cash_balance::text FROM poshkan_live_stage.accounts ORDER BY id')).rows);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_live.trade_watch_state')).rows[0].n,(await db.query('SELECT count(*)::int AS n FROM poshkan_live_stage.trade_watch_state')).rows[0].n);
  const c=await db.connect();
  const oldMode=process.env.POSHKAN_DATABASE_MODE;
  try {
    await c.query('SET SESSION AUTHORIZATION poshkan_live_runtime');
    await assert.rejects(c.query('SELECT * FROM poshkan_live.accounts'),/permission denied/);
    await assert.rejects(c.query('SELECT * FROM poshkan_live.trade_watch_state'),/permission denied/);
    await assert.rejects(c.query('SET ROLE poshkan_trade_preview'),/permission denied/);
    await assert.rejects(c.query('SELECT * FROM poshkan_live_stage.accounts'),/permission denied/);
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE poshkan_live_app');
    await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
    process.env.POSHKAN_DATABASE_MODE='neon';
    const response=await executeQuery(c,new URL('https://adapter.invalid/accounts?select=id,name&order=created_at.asc'));
    assert.equal((await response.json()).length,4);
    await c.query('ROLLBACK');
    await c.query('BEGIN');await c.query('SET LOCAL ROLE poshkan_live_services');
    await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
    await c.query('SELECT poshkan_live.cloud_contact()');
    await c.query('COMMIT');
    await c.query('BEGIN');await c.query('SET LOCAL ROLE poshkan_live_app');
    await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
    const accountId='08f09cc3-b492-4463-98a4-4d8adefd81fb';
    const before=Number((await c.query('SELECT cash_balance FROM poshkan_live.accounts WHERE id=$1',[accountId])).rows[0].cash_balance);
    const request=randomUUID(),command={action:'SPOT',accountId,symbol:'AAPL',side:'BUY',quantity:'1'};
    const first=(await c.query('SELECT poshkan_live.command($1,$2,$3) AS result',[request,command,100])).rows[0].result;
    const retry=(await c.query('SELECT poshkan_live.command($1,$2,$3) AS result',[request,command,100])).rows[0].result;
    assert.deepEqual(first,retry);
    assert.equal(Number((await c.query('SELECT cash_balance AS cash FROM poshkan_live.accounts WHERE id=$1',[accountId])).rows[0].cash),before-100);
    assert.equal((await c.query('SELECT poshkan_live.set_worker(true) AS state')).rows[0].state.enabled,true);
    assert.equal((await c.query('SELECT poshkan_live.set_worker(false) AS state')).rows[0].state.enabled,false);
    await c.query('ROLLBACK');
    await c.query('RESET SESSION AUTHORIZATION');
    assert.deepEqual((await c.query('SELECT id,cash_balance::text FROM poshkan_live.accounts ORDER BY id')).rows,accounts);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM poshkan_live.accounts WHERE auto_trade_enabled')).rows[0].n,0);
  } finally {
    if(oldMode===undefined)delete process.env.POSHKAN_DATABASE_MODE;else process.env.POSHKAN_DATABASE_MODE=oldMode;
    await c.query('ROLLBACK');await c.query('RESET SESSION AUTHORIZATION');c.release();
  }
  return ['fresh production balances match source; runtime cannot access rehearsal/staging or bypass role boundaries; production query adapter, atomic trade retry and cloud pause/resume pass with trades rolled back'];
}
