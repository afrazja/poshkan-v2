import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyOrders(db,{user,legacy,account,command,balance}) {
  const checks=[];
  async function rpc(sql,args,identity=user) {
    const c=await db.connect();
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL ROLE poshkan_trade_preview');
      if(identity) await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[identity]);
      const r=await c.query(sql,args); await c.query('COMMIT'); return r.rows[0].result;
    } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
  }
  const save=(input,id=randomUUID(),identity=user)=>rpc('SELECT poshkan_trade_test.order_command($1,$2) AS result',[id,input],identity);
  const check=(kind,id,accountId,symbol,price,time=new Date().toISOString(),identity=user)=>rpc('SELECT poshkan_trade_test.check_order($1,$2,$3,$4,$5,$6) AS result',[kind,id,accountId,symbol,price,time],identity);
  const status=async(table,id)=>(await db.query(`SELECT status FROM poshkan_trade_test.${table} WHERE id=$1`,[id])).rows[0].status;
  const transactionCount=async(id)=>(await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.transactions WHERE account_id=$1',[id])).rows[0].n;
  for(const table of ['orders','fx_orders','fx_tp_levels']) {
    const counts=await db.query(`SELECT (SELECT count(*) FROM poshkan_stage.${table}) AS old,(SELECT count(*) FROM poshkan_trade_test.${table}) AS copied`);
    assert.equal(counts.rows[0].old,counts.rows[0].copied);
    const originalColumns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='poshkan_stage' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>'"'+r.column_name+'"').join(',');
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ((SELECT ${originalColumns} FROM poshkan_stage.${table} EXCEPT SELECT ${originalColumns} FROM poshkan_trade_test.${table}) UNION ALL (SELECT ${originalColumns} FROM poshkan_trade_test.${table} EXCEPT SELECT ${originalColumns} FROM poshkan_stage.${table})) delta`)).rows[0].n,0);
  }
  checks.push('all source order/entry/scaled-exit rows copied without value changes');
  const stock=await account('stocks','1000');
  const limit={action:'PLACE_LIMIT',accountId:stock,symbol:'AAPL',direction:'BUY',quantity:'2',target:'100',expiryHours:null};
  const retry=randomUUID();
  const [a,b]=await Promise.all([save(limit,retry),save(limit,retry)]);assert.deepEqual(a,b);
  await assert.rejects(save({...limit,quantity:'3'},retry),/reused/);
  assert.equal((await check('LIMIT',a.id,stock,'AAPL','101')).status,'waiting');
  for(const [price,date] of [['NaN',new Date()],['Infinity',new Date()],['0',new Date()],['99',new Date(Date.now()-360000)],['99',new Date(Date.now()+120000)],['99',null]]) {
    assert.equal((await check('LIMIT',a.id,stock,'AAPL',price,date)).status,'unavailable');
  }
  assert.equal((await check('LIMIT',a.id,stock,'OTHER','99')).status,'unchanged');
  const race=await Promise.all([check('LIMIT',a.id,stock,'AAPL','99'),check('LIMIT',a.id,stock,'AAPL','98')]);
  assert.equal(race.filter(x=>x.status==='filled').length,1);assert.equal(await transactionCount(stock),1);
  assert.equal(await status('orders',a.id),'filled');
  const sell=await save({...limit,direction:'SELL',quantity:'1',target:'110'});
  assert.equal((await check('LIMIT',sell.id,stock,'AAPL','109')).status,'waiting');
  assert.equal((await check('LIMIT',sell.id,stock,'AAPL','111')).status,'filled');
  const cancel=await save(limit);
  const canceled=await Promise.all([save({action:'CANCEL_LIMIT',accountId:stock,orderId:cancel.id}),check('LIMIT',cancel.id,stock,'AAPL','99')]);
  assert.ok(['filled','canceled'].includes(await status('orders',cancel.id)));
  assert.equal(canceled.filter(x=>x.status==='filled'||x.status==='canceled').length,1);
  const before=await balance(stock), beforeCount=await transactionCount(stock);
  const tooMuch=await save({...limit,quantity:'100000'});
  assert.equal((await check('LIMIT',tooMuch.id,stock,'AAPL','99')).status,'canceled');
  assert.equal(await balance(stock),before);assert.equal(await transactionCount(stock),beforeCount);
  const expiry=await save(limit);await db.query("UPDATE poshkan_trade_test.orders SET expires_at=now()-interval '1 second' WHERE id=$1",[expiry.id]);
  assert.equal((await check('LIMIT',expiry.id,stock,'AAPL',null,null)).status,'expired');
  const day=await save(limit);await db.query("UPDATE poshkan_trade_test.orders SET time_in_force='DAY',created_at=now()-interval '2 days' WHERE id=$1",[day.id]);
  assert.equal((await check('LIMIT',day.id,stock,'AAPL',null,null)).status,'expired');
  checks.push('idempotent placements; buy/sell thresholds; stale/invalid quotes; simultaneous fill/cancel; atomic rejection; offline expiration');
  const fxAccount=await account('forex','10000');
  const entry={action:'PLACE_ENTRY',accountId:fxAccount,symbol:'EURUSD=X',direction:'LONG',quantity:'1000',target:'1.1',expiryHours:null,trigger:'AT_OR_BELOW',leverage:10,stopLoss:'1.0',takeProfit:'1.2'};
  const e=await save(entry);
  assert.equal((await check('ENTRY',e.id,fxAccount,'EURUSD=X','1.11')).status,'waiting');
  const entered=await Promise.all([check('ENTRY',e.id,fxAccount,'EURUSD=X','1.09'),check('ENTRY',e.id,fxAccount,'EURUSD=X','1.09')]);
  assert.equal(entered.filter(r=>r.status==='filled').length,1);
  const position=entered.find(r=>r.status==='filled').trade.positionId;
  assert.equal(await balance(fxAccount),'9891.00000000');
  const sl=await Promise.all([check('POSITION',position,fxAccount,'EURUSD=X','0.99'),check('POSITION',position,fxAccount,'EURUSD=X','0.99')]);
  assert.equal(sl.filter(r=>r.status==='closed').length,1);
  assert.equal(await status('fx_positions',position),'sl');assert.equal(await balance(fxAccount),'9900.00000000');
  const gap=await save(entry), oldBalance=await balance(fxAccount);
  assert.equal((await check('ENTRY',gap.id,fxAccount,'EURUSD=X','0.95')).status,'canceled');
  assert.equal(await balance(fxAccount),oldBalance);
  const short=await save({...entry,direction:'SHORT',trigger:'AT_OR_ABOVE',stopLoss:'1.2',takeProfit:'1.0'});
  assert.equal((await check('ENTRY',short.id,fxAccount,'EURUSD=X','1.09')).status,'waiting');
  const shortFill=await check('ENTRY',short.id,fxAccount,'EURUSD=X','1.11');
  assert.equal(shortFill.status,'filled');
  const tp=await check('POSITION',shortFill.trade.positionId,fxAccount,'EURUSD=X','0.99');
  assert.equal(tp.reason,'tp');assert.equal(tp.trade.price,'1.000000');
  const expireEntry=await save(entry);await db.query("UPDATE poshkan_trade_test.fx_orders SET expires_at=now()-interval '1 second' WHERE id=$1",[expireEntry.id]);
  assert.equal((await check('ENTRY',expireEntry.id,fxAccount,'EURUSD=X',null,null)).status,'expired');
  const cancelEntry=await save(entry);await save({action:'CANCEL_ENTRY',accountId:fxAccount,orderId:cancelEntry.id});
  assert.equal((await check('ENTRY',cancelEntry.id,fxAccount,'EURUSD=X','1.1')).status,'unchanged');
  checks.push('entry direction/thresholds, simultaneous entry, observed-price stop loss, target-price take profit, gap rejection and entry expiry/cancel');
  const open={action:'OPEN_FX',accountId:fxAccount,symbol:'EURUSD=X',direction:'LONG',units:'1000',leverage:10,stopLoss:null,takeProfit:null};
  const timed=await command(open,'1.1');
  await save({action:'SET_TIMER',accountId:fxAccount,positionId:timed.positionId,minutes:1});
  assert.equal((await check('POSITION',timed.positionId,fxAccount,'EURUSD=X','1.1')).status,'waiting');
  await save({action:'SET_TIMER',accountId:fxAccount,positionId:timed.positionId,minutes:0});
  assert.equal((await db.query('SELECT auto_close_at FROM poshkan_trade_test.fx_positions WHERE id=$1',[timed.positionId])).rows[0].auto_close_at,null);
  await db.query("UPDATE poshkan_trade_test.fx_positions SET auto_close_at=now()-interval '1 second' WHERE id=$1",[timed.positionId]);
  assert.equal((await check('POSITION',timed.positionId,fxAccount,'EURUSD=X',null,null)).status,'unavailable');
  assert.equal((await check('POSITION',timed.positionId,fxAccount,'EURUSD=X','1.12')).reason,'timer');
  const stop=await command(open,'1.1');
  assert.equal((await check('POSITION',stop.positionId,fxAccount,'EURUSD=X','0.9')).reason,'stopped');
  const scaled=await command(open,'1.1');
  const levels={action:'SET_LEVELS',accountId:fxAccount,positionId:scaled.positionId,levels:[{price:'1.12',units:'400'},{price:'1.14',units:'600'}]};
  await save(levels);
  await assert.rejects(save({...levels,levels:[{price:'1.15',units:'1001'}]}),/exceed/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.fx_tp_levels WHERE position_id=$1',[scaled.positionId])).rows[0].n,2);
  const split=await Promise.all([check('POSITION',scaled.positionId,fxAccount,'EURUSD=X','1.13'),check('POSITION',scaled.positionId,fxAccount,'EURUSD=X','1.13')]);
  assert.equal(split.filter(r=>r.status==='scaled').length,1);
  assert.equal((await db.query('SELECT units::text FROM poshkan_trade_test.fx_positions WHERE id=$1',[scaled.positionId])).rows[0].units,'600.00000000');
  assert.equal((await check('POSITION',scaled.positionId,fxAccount,'EURUSD=X','1.15')).levels,1);
  assert.equal(await status('fx_positions',scaled.positionId),'closed');
  const multi=await command({...open,direction:'SHORT'},'1.1');
  await save({...levels,positionId:multi.positionId,levels:[{price:'1.08',units:'400'},{price:'1.06',units:'600'}]});
  assert.equal((await check('POSITION',multi.positionId,fxAccount,'EURUSD=X','1.05')).levels,2);
  checks.push('timed close set/clear, unavailable price deferral, margin stop, long/short scaled exits and concurrent partial execution');
  const foreign=(await db.query('SELECT id FROM poshkan_trade_test.accounts WHERE user_id<>$1 LIMIT 1',[legacy])).rows[0].id;
  await assert.rejects(save({...limit,accountId:foreign}),/Account not found/);
  await assert.rejects(check('LIMIT',a.id,foreign,'AAPL','99'),/Account not found/);
  await assert.rejects(save(limit,randomUUID(),null),/authorized/);
  await assert.rejects(check('LIMIT',a.id,stock,'AAPL','99',new Date(),randomUUID()),/authorized/);
  for(const quantity of ['NaN','Infinity','-1','0','0.000000001']) await assert.rejects(save({...limit,quantity}));
  for(const target of ['NaN','Infinity','-1','0','0.000000001']) await assert.rejects(save({...limit,target}));
  await assert.rejects(save({...entry,leverage:30}));await assert.rejects(save({...entry,trigger:'other'}));
  await assert.rejects(save({...entry,stopLoss:'1.2'}));await assert.rejects(save({...limit,expiryHours:-1}));
  await db.query('UPDATE neon_auth."user" SET banned=true WHERE id=$1',[user]);
  await assert.rejects(rpc('SELECT poshkan_trade_test.order_candidates() AS result',[]),/authorized/);
  await db.query('UPDATE neon_auth."user" SET banned=false WHERE id=$1',[user]);
  const visible=await rpc('SELECT poshkan_trade_test.order_state() AS result',[]);
  assert.ok(!visible.orders.some(o=>o.accountId===foreign));
  const candidates=await rpc('SELECT poshkan_trade_test.order_candidates() AS result',[]);
  assert.ok(!candidates.some(o=>o.accountId===foreign));
  const c=await db.connect();
  try {await c.query('SET ROLE poshkan_trade_preview');await assert.rejects(c.query('SELECT * FROM poshkan_trade_test.orders'),/permission denied/);await c.query('RESET ROLE');} finally {c.release();}
  checks.push('ownership, missing/unmapped/banned identity, finite precision inputs, role table denial and owner-scoped lists');
  return checks;
}
