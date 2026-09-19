import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function verifyAi(db,{user,account}) {
 const id=await account('stocks','10000');
 await db.query('UPDATE poshkan_trade_test.accounts SET auto_trade_enabled=true,auto_leverage=2,auto_risk_pct=0.01,auto_max_position_pct=0.25,auto_max_open=3,auto_max_per_day=2,auto_min_minutes=60 WHERE id=$1',[id]);
 await db.query('UPDATE poshkan_trade_test.worker_control SET enabled=true WHERE id=1');
 const call=async(sql,args,actor=user)=>{
  const c=await db.connect();
  try{await c.query('BEGIN');await c.query('SET LOCAL ROLE poshkan_preview_services');await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[actor]);const r=await c.query(sql,args);await c.query('COMMIT');return r.rows[0].value;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 const proposal={pair:'TESTAI',direction:'LONG',entryType:'market',entry:100,stop:98,takeProfit:104,rationale:'Synthetic integration fixture, no model call'};
 const claim=(body=proposal,a=id)=>call('SELECT poshkan_trade_test.claim_ai_signal($1,$2) AS value',[a,body]);
 const quotes=(symbols=['TESTAI'],price=100)=>Object.fromEntries(symbols.map(s=>[s,{price,at:new Date().toISOString()}]));
 const execute=(signal,q=quotes())=>call('SELECT poshkan_trade_test.execute_ai_signal($1,$2) AS value',[signal,q]);
 const [one,two]=await Promise.all([claim(),claim()]);assert.equal([one,two].filter(Boolean).length,1);
 const signal=one||two;
 await assert.rejects(()=>execute(signal,{TESTAI:{price:100,at:'2000-01-01T00:00:00Z'}}),/Fresh/);
 await assert.rejects(()=>execute(signal,{}),/Fresh/);
 await assert.rejects(()=>call('SELECT poshkan_trade_test.execute_ai_signal($1,$2) AS value',[signal,quotes()],randomUUID()),/authorized/);
 await db.query('UPDATE poshkan_trade_test.worker_control SET enabled=false WHERE id=1');
 await assert.rejects(()=>execute(signal),/paused/);
 await db.query('UPDATE poshkan_trade_test.worker_control SET enabled=true WHERE id=1');
 const [first,retry]=await Promise.all([execute(signal),execute(signal)]);assert.deepEqual(first,retry);
 const state=(await db.query('SELECT units,margin,source,stop_loss,take_profit FROM poshkan_trade_test.fx_positions WHERE id=$1',[first.positionId])).rows[0];
 assert.equal(state.source,'ai');assert.equal(Number(state.units),50);assert.equal(Number(state.margin),2500);assert.equal(Number(state.stop_loss),98);assert.equal(Number(state.take_profit),104);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.fx_positions WHERE account_id=$1',[id])).rows[0].n,1);
 assert.equal(Number((await db.query('SELECT cash_balance FROM poshkan_trade_test.accounts WHERE id=$1',[id])).rows[0].cash_balance),7500);
 const other=await claim({...proposal,pair:'TESTAI2'});
 await assert.rejects(()=>execute(other,quotes(['TESTAI','TESTAI2'])),/frequency/);
 await db.query('UPDATE poshkan_trade_test.accounts SET auto_min_minutes=0,auto_max_per_day=1 WHERE id=$1',[id]);
 await assert.rejects(()=>execute(other,quotes(['TESTAI','TESTAI2'])),/Daily/);
 await db.query('UPDATE poshkan_trade_test.accounts SET auto_max_per_day=5 WHERE id=$1',[id]);
 await assert.rejects(()=>execute(other,quotes(['TESTAI2'])),/exposure quotes/);
 await assert.rejects(()=>execute(other,{...quotes(['TESTAI2']),TESTAI:{price:90,at:new Date().toISOString()}}),/loss limit/);
 await db.query('UPDATE poshkan_trade_test.accounts SET auto_trade_enabled=false WHERE id=$1',[id]);
 await assert.rejects(()=>execute(other,quotes(['TESTAI','TESTAI2'])),/disabled/);
 assert.deepEqual(await execute(signal,{}),first); // committed retry needs no new quote, even when disabled
 await db.query('UPDATE poshkan_trade_test.accounts SET auto_trade_enabled=true WHERE id=$1',[id]);
 const limit=await claim({...proposal,pair:'TESTAI3',entryType:'limit'});await assert.rejects(()=>execute(limit,quotes(['TESTAI','TESTAI3'])),/executable/);
 const invalid=await claim({...proposal,pair:'TESTAI4',takeProfit:101});await assert.rejects(()=>execute(invalid,quotes(['TESTAI','TESTAI4'])),/reward/);
 assert.equal((await db.query('SELECT executed FROM poshkan_trade_test.fx_scan_alerts WHERE id=$1',[invalid])).rows[0].executed,false);
 await db.query('UPDATE poshkan_trade_test.worker_control SET enabled=false WHERE id=1');
 return ['AI concurrent signal deduplication and atomic idempotent entry with protective levels','AI pause, identity, stale/missing quotes, loss/frequency/daily limits and limit-proposal rejection'];
}
