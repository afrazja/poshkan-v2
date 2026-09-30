import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import pg from 'pg';
import {estimateSpot,affordableSpotQuantity} from '../src/lib/spot-costs.mjs';
import {reviewLedger} from '../src/lib/performance-review.mjs';
import {checkedQuote} from '../src/lib/neon-preview/quote.mjs';
import {researchUpgrade} from './prepare-research-upgrade.mjs';

// Windows: uses the installed PostgreSQL binaries. Linux CI: PG_BIN supplied.
const bin=process.env.PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
const dir=mkdtempSync(join(tmpdir(),'poshkan-research-')),cluster=join(dir,'cluster');
const port=await new Promise(resolvePort=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolvePort(p));});});
const password=randomBytes(32).toString('hex'),passwordFile=join(dir,'password.txt');writeFileSync(passwordFile,password);
const env={...process.env,PGPASSWORD:password,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGDATABASE:'postgres'};
const run=(name,args)=>{
  // pg_ctl launches a long-lived child. On Windows it must not inherit a pipe
  // that execFileSync waits to close. Startup errors are read from its log.
  try {return execFileSync(join(bin,name+(process.platform==='win32'?'.exe':'')),args,{windowsHide:true,env,stdio:name==='pg_ctl'?'ignore':'pipe'});}
  catch(error) {
    if(name==='pg_ctl')try{console.error(readFileSync(join(dir,'postgres.log'),'utf8'));}catch{}
    throw error;
  }
};
const production=process.argv.includes('--production');
// The same suite exercises the generated release SQL in a synthetic live-named
// schema on this disposable server. It cannot reach a remote database.
class FixtureClient extends pg.Client {
  query(config,...args) {
    if(production && typeof config==='string')config=config.replaceAll('poshkan_trade_test','poshkan_live').replaceAll('poshkan_trade_preview','poshkan_live_app');
    return super.query(config,...args);
  }
}
const db=new pg.Pool({Client:FixtureClient,host:'127.0.0.1',port,user:'postgres',password,database:'postgres',max:6});
const owner=randomUUID(),foreign=randomUUID();let started=false;const checks=[];
async function asActor(fn,user=owner){const c=await db.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE poshkan_trade_preview');await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const research=(command,id=randomUUID(),user=owner)=>asActor(async c=>(await c.query('SELECT poshkan_trade_test.research_command($1,$2) AS r',[id,command])).rows[0].r,user);
const trade=(command,quote,id=randomUUID(),at=new Date(),user=owner)=>asActor(async c=>(await c.query('SELECT poshkan_trade_test.quoted_spot($1,$2,$3,$4) AS r',[id,command,quote,at])).rows[0].r,user);
const account=async(cash=1000,user=owner,type='stocks')=>(await db.query('INSERT INTO poshkan_trade_test.accounts(user_id,name,type,cash_balance) VALUES($1,$2,$3,$4) RETURNING id',[user,'Synthetic fixture',type,cash])).rows[0].id;
const cash=async id=>Number((await db.query('SELECT cash_balance FROM poshkan_trade_test.accounts WHERE id=$1',[id])).rows[0].cash_balance);
const spot=id=>({action:'SPOT',accountId:id,symbol:'SPY',side:'BUY',quantity:'2'});
const profile=id=>({action:'PROFILE',accountId:id,label:'Synthetic per-fill broker',fixedFee:1,perUnitFee:0,feeBps:0,minimumFee:0,halfSpreadBps:10,slippageBps:10});
const plan=id=>({action:'PLAN',accountId:id,symbol:'SPY',decision:'TRADE',hypothesis:'Synthetic test hypothesis',strategyVersion:'v1',entryConditions:'Synthetic entry',exitConditions:'Synthetic exit',holdingDays:3,positionSizing:'2 shares'});
try {
  run('initdb',['-D',cluster,'-U','postgres','--auth=scram-sha-256','--pwfile',passwordFile,'--encoding=UTF8','--locale=C']);unlinkSync(passwordFile);
  // Linux runners cannot create sockets in the distro-owned /var/run directory.
  const socket=process.platform==='win32'?'':` -k ${dir}`;
  run('pg_ctl',['-D',cluster,'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}${socket}`,'-w','start']);started=true;
  await db.query(readFileSync(resolve('scripts/research-fixture.sql'),'utf8'));
  for(const user of [owner,foreign]){await db.query('INSERT INTO neon_auth."user" VALUES($1,false)',[user]);await db.query('INSERT INTO poshkan_trade_test.legacy_users VALUES($1,null)',[user]);await db.query('INSERT INTO poshkan_trade_test.auth_links VALUES($1,$1,true)',[user]);}
  await db.query(readFileSync('neon/trading-engine.sql','utf8'));
  const existing=await account();
  await db.query("INSERT INTO poshkan_trade_test.transactions(account_id,symbol,side,quantity,price,cash_delta) VALUES($1,'SPY','BUY',1,100,-100)",[existing]);
  await db.query("INSERT INTO poshkan_trade_test.positions(account_id,symbol,quantity,avg_cost) VALUES($1,'SPY',1,100)",[existing]);
  const oldLedger=(await db.query('SELECT id,price,cash_delta,created_at FROM poshkan_trade_test.transactions')).rows;
  await db.query(researchUpgrade(production));
  await db.query(researchUpgrade(production));
  assert.deepEqual((await db.query('SELECT id,price,cash_delta,created_at FROM poshkan_trade_test.transactions')).rows,oldLedger);
  assert.equal(await cash(existing),1000);checks.push('additive/repeatable upgrade preserves historical cash, cost basis and ledger');
  await db.query(readFileSync('neon/app-engine.sql','utf8'));
  const zero=await account();const zeroBuy=await trade(spot(zero),100);assert.equal(zeroBuy.fee,'0');assert.equal(await cash(zero),800);
  await trade({...spot(zero),side:'SELL'},110);assert.equal(await cash(zero),1020);checks.push('zero-fee backward-compatible round trip');
  const paid=await account();await research(profile(paid));const request=randomUUID();
  const [first,retry]=await Promise.all([trade(spot(paid),100,request),trade(spot(paid),101,request)]);assert.deepEqual(first,retry);
  const fill=Number(first.referencePrice),preview=estimateSpot({fixed_fee:1,half_spread_bps:10,slippage_bps:10},'BUY',2,fill);
  assert.equal(Number(first.price),preview.price);assert.equal(await cash(paid),1000-preview.cash);
  assert.equal(Number((await db.query('SELECT avg_cost FROM poshkan_trade_test.positions WHERE account_id=$1',[paid])).rows[0].avg_cost),preview.price+0.5);
  const sell=await trade({...spot(paid),side:'SELL'},110);assert.equal(Number(sell.price),109.78);
  const ledger=(await db.query('SELECT * FROM poshkan_trade_test.transactions WHERE account_id=$1',[paid])).rows;
  const review=reviewLedger(ledger);assert.ok(Math.abs(review.netRealized-(await cash(paid)-1000))<1e-7);assert.equal(review.explicitFees,2);assert.ok(Math.abs(review.spreadCost-0.42)<1e-8);assert.ok(Math.abs(review.slippageCost-0.42)<1e-8);
  await assert.rejects(trade({...spot(paid),quantity:'1'},100,request),/reused/);checks.push('nonzero fees, adverse spread/slippage, fee-inclusive basis, net P&L and concurrent retry');
  const originalTime=(await db.query('SELECT quote_at FROM poshkan_trade_test.transactions WHERE id=$1',[first.transactionId])).rows[0].quote_at;
  await research({...profile(paid),fixedFee:4});assert.deepEqual(await trade(spot(paid),200,request,new Date(Date.now()+500)),first);
  assert.deepEqual((await db.query('SELECT quote_at FROM poshkan_trade_test.transactions WHERE id=$1',[first.transactionId])).rows[0].quote_at,originalTime);
  const weighted=await account();await research({...profile(weighted),fixedFee:0.5,perUnitFee:0.01,feeBps:5,minimumFee:2,halfSpreadBps:0,slippageBps:0});
  await trade({...spot(weighted),quantity:'1'},100);await trade({...spot(weighted),quantity:'1'},200);
  assert.equal(Number((await db.query('SELECT avg_cost FROM poshkan_trade_test.positions WHERE account_id=$1',[weighted])).rows[0].avg_cost),152);
  const partial=await trade({...spot(weighted),side:'SELL',quantity:'0.5'},180);assert.equal(Number(partial.fee),2);
  const partialPnl=Number((await db.query('SELECT realized_pnl FROM poshkan_trade_test.transactions WHERE id=$1',[partial.transactionId])).rows[0].realized_pnl);assert.equal(partialPnl,12);
  const formula=(await db.query("SELECT poshkan_trade_test.spot_cost($1,'BUY',100,100) AS costs",[weighted])).rows[0].costs;assert.equal(formula.fee,6.5);
  const tiny=await account(100);await research({...profile(tiny),fixedFee:200,halfSpreadBps:0,slippageBps:0});await db.query("INSERT INTO poshkan_trade_test.positions(account_id,symbol,quantity,avg_cost) VALUES($1,'SPY',1,1)",[tiny]);
  await assert.rejects(trade({...spot(tiny),side:'SELL',quantity:'1'},1),/Insufficient/);assert.equal(await cash(tiny),100);
  checks.push('successful retry freezes profile/time; minimum/per-unit/bps fees, weighted partial exits and sell fees cannot make cash negative');
  const tight=await account(200);await research(profile(tight));await assert.rejects(trade(spot(tight),100),/Insufficient/);assert.equal(await cash(tight),200);
  const max=affordableSpotQuantity({fixed_fee:1,half_spread_bps:10,slippage_bps:10},200,100);assert.ok(estimateSpot({fixed_fee:1,half_spread_bps:10,slippage_bps:10},'BUY',Math.floor(max*1e8)/1e8,100).cash<=200+1e-8);
  await assert.rejects(trade(spot(tight),100,randomUUID(),new Date(Date.now()-600000)),/fresh/);
  await assert.rejects(trade(spot(tight),100,randomUUID(),new Date(),foreign),/Account not found/);checks.push('insufficient total funds, fee-aware Max, stale quote and foreign owner blocked');
  const limitAccount=await account();await research(profile(limitAccount));
  const pending=await asActor(async c=>(await c.query('SELECT poshkan_trade_test.order_command($1,$2) AS r',[randomUUID(),{action:'PLACE_LIMIT',accountId:limitAccount,symbol:'SPY',direction:'BUY',quantity:'2',target:'100',expiryHours:null,timeInForce:'GTC'}])).rows[0].r);
  const check=(price,at=new Date())=>asActor(async c=>(await c.query("SELECT poshkan_trade_test.check_order('LIMIT',$1,$2,'SPY',$3,$4) AS r",[pending.id,limitAccount,price,at])).rows[0].r);
  assert.equal((await check(100)).status,'waiting');assert.equal((await check(99,new Date(Date.now()-60000))).status,'unavailable');
  const limits=await Promise.all([check(99),check(99)]);assert.equal(limits.filter(r=>r.status==='filled').length,1);
  const filled=limits.find(r=>r.status==='filled');assert.equal(Number(filled.trade.price),99.198);
  assert.equal(Number((await db.query('SELECT filled_price FROM poshkan_trade_test.orders WHERE id=$1',[pending.id])).rows[0].filled_price),99.198);checks.push('post-placement limit observations, after-cost limit bound and one atomic concurrent fill');
  const sellOrder=await asActor(async c=>(await c.query('SELECT poshkan_trade_test.order_command($1,$2) AS r',[randomUUID(),{action:'PLACE_LIMIT',accountId:limitAccount,symbol:'SPY',direction:'SELL',quantity:'2',target:'100',expiryHours:null,timeInForce:'GTC'}])).rows[0].r);
  const sellCheck=price=>asActor(async c=>(await c.query("SELECT poshkan_trade_test.check_order('LIMIT',$1,$2,'SPY',$3,$4) AS r",[sellOrder.id,limitAccount,price,new Date()])).rows[0].r);
  assert.equal((await sellCheck(100)).status,'waiting');const sellFilled=await sellCheck(101);assert.equal(Number(sellFilled.trade.price),100.798);
  const impossible=await account(100);await research({...profile(impossible),fixedFee:10,halfSpreadBps:0,slippageBps:0});
  const impossibleOrder=await asActor(async c=>(await c.query('SELECT poshkan_trade_test.order_command($1,$2) AS r',[randomUUID(),{action:'PLACE_LIMIT',accountId:impossible,symbol:'SPY',direction:'BUY',quantity:'1',target:'100',expiryHours:null,timeInForce:'GTC'}])).rows[0].r);
  const canceled=await asActor(async c=>(await c.query("SELECT poshkan_trade_test.check_order('LIMIT',$1,$2,'SPY',100,$3) AS r",[impossibleOrder.id,impossible,new Date()])).rows[0].r);assert.equal(canceled.status,'canceled');assert.equal(await cash(impossible),100);
  checks.push('sell limits respect adverse price floor; unaffordable fee-bearing limits cancel atomically');
  const journalAccount=await account();const original=plan(journalAccount),planId=randomUUID();const entry=await research(original,planId);assert.deepEqual(await research(original,planId),entry);
  const bought=await trade(spot(journalAccount),100);await research({action:'LINK',entryId:entry.id,transactionId:bought.transactionId});
  const note={action:'REVIEW',entryId:entry.id,note:'Separate later review'},noteId=randomUUID();await research(note,noteId);await research(note,noteId);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.research_reviews')).rows[0].n,1);
  await assert.rejects(research({...note,note:'Foreign review'},randomUUID(),foreign),/not found/);
  await assert.rejects(asActor(c=>c.query("UPDATE poshkan_trade_test.research_entries SET hypothesis='rewrite'")),/permission denied/);
  await assert.rejects(asActor(c=>c.query('DELETE FROM poshkan_trade_test.research_reviews')),/permission denied/);
  const noTrade=await research({...original,decision:'NO_TRADE'});await assert.rejects(research({action:'LINK',entryId:noTrade.id,transactionId:bought.transactionId}),/prior trade plan/);
  const later=await research(original);await assert.rejects(research({action:'LINK',entryId:later.id,transactionId:bought.transactionId}),/prior trade plan/);
  await asActor(c=>c.query("SELECT poshkan_trade_test.app_account('RESET',$1,$2)",[journalAccount,{amount:1000}]));
  assert.equal((await db.query('SELECT hypothesis FROM poshkan_trade_test.research_entries WHERE id=$1',[entry.id])).rows[0].hypothesis,original.hypothesis);
  assert.equal((await asActor(async c=>(await c.query('SELECT * FROM poshkan_trade_test.research_entries')).rows,foreign)).length,0);
  await assert.rejects(asActor(c=>c.query('SELECT poshkan_trade_test.spot_cost($1,$2,1,100)',[journalAccount,'BUY'])),/permission denied/);
  await db.query('DELETE FROM poshkan_trade_test.transactions WHERE account_id=$1',[journalAccount]);await db.query('DELETE FROM poshkan_trade_test.accounts WHERE id=$1',[journalAccount]);
  const preserved=(await db.query('SELECT * FROM poshkan_trade_test.research_links WHERE entry_id=$1',[entry.id])).rows[0];assert.equal(preserved.transaction_id,null);assert.equal(preserved.ledger_snapshot.id,bought.transactionId);checks.push('immutable prior plans, no-trade decisions, separate idempotent reviews, owner RLS, reset and deleted-ledger snapshot preservation');
  const now=Date.now();const quote={symbol:'SPY',regularMarketPrice:100,regularMarketTime:new Date(now),marketState:'REGULAR',currency:'USD',quoteType:'ETF'};
  assert.equal(checkedQuote('SPY',quote,false,now),'100.00000000');assert.throws(()=>checkedQuote('SPY',{...quote,marketState:'CLOSED'},false,now),/closed/);assert.throws(()=>checkedQuote('SPY',{...quote,regularMarketTime:new Date(now-600000)},false,now),/fresh/);
  assert.equal(reviewLedger([{symbol:'SPY',side:'SELL',quantity:2,price:100,created_at:new Date().toISOString()}]).unknownSales,1);checks.push('session/freshness safeguards and incomplete-history exclusion');
  console.log(JSON.stringify({mode:production?'synthetic production upgrade':'rehearsal upgrade',passed:checks},null,2));
} finally {await db.end();if(started)run('pg_ctl',['-D',cluster,'-m','immediate','-w','stop']);}
