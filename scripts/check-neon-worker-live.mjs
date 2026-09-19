import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const admin=new pg.Client({connectionString:process.env.NEON_PREVIEW_DATABASE_URL,connectionTimeoutMillis:15000});
const worker=new pg.Client({connectionString:process.env.NEON_WORKER_DATABASE_URL,connectionTimeoutMillis:15000});
const accountId=randomUUID(),request=randomUUID();
let saved,changed=false,adminConnected=false,workerConnected=false,passed=false;
try {
  await admin.connect();adminConnected=true;await worker.connect();workerConnected=true;
  assert.equal((await worker.query('SELECT session_user AS name')).rows[0].name,'poshkan_preview_worker');
  assert.equal((await worker.query('SELECT poshkan_trade_test.worker_claim() AS acquired')).rows[0].acquired,true,'Stop any existing worker before this isolated verification');
  saved=(await admin.query('SELECT * FROM poshkan_trade_test.worker_control WHERE id=1')).rows[0];
  assert.equal(saved.enabled,false,'Background execution must be paused before verification');
  await assert.rejects(worker.query('SELECT * FROM poshkan_trade_test.accounts'),/permission denied/);
  await assert.rejects(worker.query('SELECT poshkan_trade_test.order_command($1,$2)',[randomUUID(),{}]),/permission denied/);
  await admin.query('BEGIN');
  await admin.query("INSERT INTO poshkan_trade_test.accounts(id,user_id,name,type,cash_balance) VALUES($1,'0a1d36a2-fbdf-4f7c-a736-a05a91a81246',$2,'stocks',1000)",[accountId,'Background verification '+accountId]);
  await admin.query('UPDATE poshkan_trade_test.worker_control SET enabled=true WHERE id=1');
  await admin.query('SET LOCAL ROLE poshkan_trade_preview');
  await admin.query("SELECT set_config('poshkan.neon_user_id','067a9e15-51a4-43b0-aa56-fd5519f68cb9',true)");
  const input={action:'PLACE_LIMIT',accountId,symbol:'AAPL',direction:'BUY',quantity:'2',target:'100',expiryHours:null};
  const order=(await admin.query('SELECT poshkan_trade_test.order_command($1,$2) AS result',[request,input])).rows[0].result;
  changed=true;await admin.query('COMMIT');
  const poll=(await worker.query('SELECT poshkan_trade_test.worker_poll() AS result')).rows[0].result;
  assert.equal(poll.enabled,true);assert.ok(poll.items.some(item=>item.id===order.id&&item.accountId===accountId));
  // Check only the temporary order, not any existing copied account's work.
  const args=['LIMIT',order.id,accountId,'AAPL','99',new Date()];
  const checked=(await worker.query('SELECT poshkan_trade_test.worker_check($1,$2,$3,$4,$5,$6) AS result',args)).rows[0].result;
  assert.equal(checked.status,'filled');
  assert.equal((await worker.query('SELECT poshkan_trade_test.worker_check($1,$2,$3,$4,$5,$6) AS result',args)).rows[0].result.status,'unchanged');
  assert.equal((await admin.query('SELECT cash_balance::text AS cash FROM poshkan_trade_test.accounts WHERE id=$1',[accountId])).rows[0].cash,'802.00000000');
  await admin.query('UPDATE poshkan_trade_test.worker_control SET enabled=false WHERE id=1');
  assert.equal((await worker.query('SELECT poshkan_trade_test.worker_check($1,$2,$3,$4,$5,$6) AS result',args)).rows[0].result.status,'paused');
  passed=true;
} catch(error) {console.error('Restricted Neon worker verification failed:',error.code??error.name);process.exitCode=1;}
finally {
  if(adminConnected) {
    await admin.query('ROLLBACK').catch(()=>{});
    if(changed) {
      try {
        await admin.query('BEGIN');
        await admin.query('UPDATE poshkan_trade_test.worker_control SET enabled=false,last_seen=$1,last_check=$2,summary=$3,changed_at=$4 WHERE id=1',[saved.last_seen,saved.last_check,saved.summary,saved.changed_at]);
        await admin.query('DELETE FROM poshkan_trade_test.orders WHERE account_id=$1',[accountId]);
        await admin.query('DELETE FROM poshkan_trade_test.positions WHERE account_id=$1',[accountId]);
        await admin.query('DELETE FROM poshkan_trade_test.transactions WHERE account_id=$1',[accountId]);
        await admin.query("DELETE FROM poshkan_trade_test.requests WHERE command->>'accountId'=$1",[accountId]);
        await admin.query('DELETE FROM poshkan_trade_test.accounts WHERE id=$1 AND name=$2',[accountId,'Background verification '+accountId]);
        await admin.query('COMMIT');
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM poshkan_trade_test.accounts WHERE id=$1',[accountId])).rows[0].n,0);
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM poshkan_stage.auth_links WHERE application_access_enabled')).rows[0].n,0);
        if(passed) console.log('PASS: dedicated Neon worker login, denied broad privileges, atomic fill, duplicate prevention and pause. Only the temporary account was exercised; it and its records were removed, and execution is paused.');
      } catch(error) {console.error('Worker verification cleanup requires attention:',error.code??error.name);process.exitCode=1;}
    }
  }
  if(workerConnected) await worker.end();
  if(adminConnected) await admin.end();
}
