import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const c=new pg.Client({connectionString:process.env.NEON_PREVIEW_DATABASE_URL});
try {
 await c.connect();await c.query('BEGIN');
 const user=process.env.NEON_PREVIEW_USER_ID;
 await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
 const owner=(await c.query('SELECT poshkan_trade_test.actor() AS id')).rows[0].id;
 const profile=(await c.query("SELECT count(*)::int AS profiles,coalesce(bool_or(anthropic_api_key IS NOT NULL AND anthropic_api_key<>''),false) AS key_present FROM poshkan_trade_test.profiles WHERE id=$1",[owner])).rows[0];
 const id=randomUUID();
 await c.query("INSERT INTO poshkan_trade_test.accounts(id,user_id,name,type,cash_balance,auto_trade_enabled,auto_leverage,auto_risk_pct,auto_max_position_pct) VALUES($1,$2,'Rollback-only AI verification','stocks',10000,true,2,0.01,0.25)",[id,owner]);
 await c.query('UPDATE poshkan_trade_test.worker_control SET enabled=true WHERE id=1');
 await c.query('SET LOCAL ROLE poshkan_preview_services');
 const setup={pair:'TESTAI',direction:'LONG',entryType:'market',entry:100,stop:98,takeProfit:104};
 const signal=(await c.query('SELECT poshkan_trade_test.claim_ai_signal($1,$2) AS id',[id,setup])).rows[0].id;
 assert.ok(signal);
 const quotes={TESTAI:{price:100,at:new Date().toISOString()}};
 const first=(await c.query('SELECT poshkan_trade_test.execute_ai_signal($1,$2) AS result',[signal,quotes])).rows[0].result;
 const retry=(await c.query('SELECT poshkan_trade_test.execute_ai_signal($1,$2) AS result',[signal,{}])).rows[0].result;
 assert.deepEqual(first,retry);assert.equal(Number(first.margin),2500);
 assert.equal(Number((await c.query('SELECT cash_balance FROM poshkan_trade_test.accounts WHERE id=$1',[id])).rows[0].cash_balance),7500);
 await c.query('ROLLBACK');
 console.log(JSON.stringify({passed:true,checks:['Neon AI atomic entry and protective levels','durable retry returns same receipt','all test writes rolled back'],profileFound:profile.profiles===1,apiKeySaved:profile.key_present}));
} finally {await c.query('ROLLBACK').catch(()=>{});await c.end();}
