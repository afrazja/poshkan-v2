import { verifyServices } from "./check-neon-services.mjs";
import { verifyAi } from './check-neon-ai.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import pg from 'pg';
import { verifyOrders } from './check-neon-orders.mjs';
import { verifyWorker } from './check-neon-worker.mjs';
import { verifyApp } from './check-neon-app.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = resolve(app, '../poshkan-neon-migration');
const bin = 'C:/Program Files/PostgreSQL/17/bin';
const dir = join(migration, 'local-test', 'trading-' + Date.now());
const cluster = join(dir, 'cluster');
mkdirSync(dir, { recursive: true });
const passwordFile = join(dir, 'password.txt');
const password = randomBytes(32).toString('hex');
writeFileSync(passwordFile, password);
const port = await new Promise(resolvePort => {
  const server = createServer(); server.listen(0,'127.0.0.1',() => { const p=server.address().port; server.close(() => resolvePort(p)); });
});
const env = { ...process.env, PGPASSWORD:password, PGHOST:'127.0.0.1', PGPORT:String(port), PGUSER:'postgres', PGDATABASE:'neondb', PGTZ:'UTC' };
const run = (name,args) => execFileSync(join(bin,name+'.exe'),args,{ windowsHide:true, env, stdio:name==='pg_ctl'?'ignore':'pipe', maxBuffer:32*1024*1024 });
const user = '067a9e15-51a4-43b0-aa56-fd5519f68cb9';
const legacy = '0a1d36a2-fbdf-4f7c-a736-a05a91a81246';
const db = new pg.Pool({ host:'127.0.0.1',port,user:'postgres',password,database:'neondb',max:6 });
const checks = [];
let started = false;
async function command(payload,quote,id=randomUUID(),actor=user) {
  const c=await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE poshkan_trade_preview');
    if(actor) await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[actor]);
    const {rows}=await c.query('SELECT poshkan_trade_test.command($1,$2::jsonb,$3::numeric) AS result',[id,payload,quote]);
    await c.query('COMMIT'); return rows[0].result;
  } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
const balance = async id => (await db.query('SELECT cash_balance::text AS cash FROM poshkan_trade_test.accounts WHERE id=$1',[id])).rows[0].cash;
async function account(type='stocks',cash='1000') {
  return (await db.query('INSERT INTO poshkan_trade_test.accounts(user_id,name,type,cash_balance) VALUES($1,$2,$3,$4) RETURNING id',[legacy,'Automated trading test',type,cash])).rows[0].id;
}
try {
  run('initdb',['-D',cluster,'-U','postgres','--auth=scram-sha-256','--pwfile',passwordFile,'--encoding=UTF8','--locale=C']); unlinkSync(passwordFile);
  run('pg_ctl',['-D',cluster,'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']); started=true;
  run('createdb',['neondb']);
  await db.query('CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user" (id uuid PRIMARY KEY,email text,banned boolean)');
  await db.query('INSERT INTO neon_auth."user" VALUES($1,$2,false)',[user,'afz.javan@gmail.com']);
  // Import the unchanged rehearsal snapshot only into this disposable server.
  run('psql',['-X','-v','ON_ERROR_STOP=1','-f',join(migration,'generated/import-stage.sql')]);
  await db.query(readFileSync(join(app,'neon/trading-preview-setup.sql'),'utf8'));
  await db.query(readFileSync(join(app,'neon/trading-engine.sql'),'utf8'));
  const stock=await account();
  const buy={action:'SPOT',accountId:stock,symbol:'AAPL',side:'BUY',quantity:'2'};
  const retryId=randomUUID();
  const [first,second]=await Promise.all([command(buy,'100',retryId),command(buy,'100',retryId)]);
  assert.deepEqual(first,second); assert.equal(await balance(stock),'800.00000000');
  assert.deepEqual(await command(buy,'110',retryId),first);
  const retried=await db.connect();
  try {
    await retried.query('BEGIN'); await retried.query('SET LOCAL ROLE poshkan_trade_preview');
    await retried.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
    assert.deepEqual((await retried.query('SELECT poshkan_trade_test.completed($1,$2) AS result',[retryId,buy])).rows[0].result,first);
    await retried.query('ROLLBACK');
  } finally { retried.release(); }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_trade_test.transactions WHERE account_id=$1',[stock])).rows[0].n,1);
  await assert.rejects(command({...buy,quantity:'3'},'100',retryId),/reused/);
  await command({...buy,quantity:'2'},'200');
  assert.equal((await db.query('SELECT avg_cost::text AS n FROM poshkan_trade_test.positions WHERE account_id=$1',[stock])).rows[0].n,'150.00000000');
  await command({...buy,side:'SELL',quantity:'1'},'175');
  assert.equal(await balance(stock),'575.00000000');
  await command({...buy,side:'SELL',quantity:'3'},'150');
  assert.equal(await balance(stock),'1025.00000000');
  await assert.rejects(command({...buy,side:'SELL'},'100'),/Not enough/);
  checks.push('atomic stock buys/sells, average cost, full exits and concurrent idempotent retries');
  const before=await balance(stock);
  for(const bad of ['NaN','Infinity','-Infinity','0','-1','0.000000001']) await assert.rejects(command({...buy,quantity:bad},'10'));
  for(const bad of ['NaN','Infinity','0','-1']) await assert.rejects(command(buy,bad));
  await assert.rejects(command({...buy,symbol:'BTC-USD'},'100'),/market/);
  await assert.rejects(command(buy,'100',randomUUID(),null),/authorized/);
  await assert.rejects(command(buy,'100',randomUUID(),randomUUID()),/authorized/);
  const foreign=(await db.query('SELECT id FROM poshkan_trade_test.accounts WHERE user_id<>$1 LIMIT 1',[legacy])).rows[0].id;
  await assert.rejects(command({...buy,accountId:foreign},'100'),/Account not found/);
  assert.equal(await balance(stock),before);
  await db.query('UPDATE neon_auth."user" SET banned=true WHERE id=$1',[user]);
  await assert.rejects(command(buy,'10'),/authorized/);
  await db.query('UPDATE neon_auth."user" SET banned=false WHERE id=$1',[user]);
  checks.push('nonfinite/negative inputs, wrong markets, missing/unmapped/banned identity and foreign account blocked with rollback');
  const race=await account('stocks','100');
  const raced=await Promise.allSettled([command({...buy,accountId:race,quantity:'1'},'80'),command({...buy,accountId:race,quantity:'1'},'80')]);
  assert.equal(raced.filter(x=>x.status==='fulfilled').length,1); assert.equal(await balance(race),'20.00000000');
  checks.push('simultaneous buys cannot overspend');
  const fxAccount=await account('forex','10000');
  const open={action:'OPEN_FX',accountId:fxAccount,symbol:'EURUSD=X',direction:'LONG',units:'1000',leverage:10,stopLoss:'1.0',takeProfit:'1.2'};
  const fx=await command(open,'1.1'); assert.equal(fx.margin,'110.00');
  assert.equal(await balance(fxAccount),'9890.00000000');
  const closed=await command({action:'CLOSE_FX',accountId:fxAccount,positionId:fx.positionId},'1.11');
  assert.equal(closed.pnl,'10.00'); assert.equal(await balance(fxAccount),'10010.00000000');
  await assert.rejects(command({action:'CLOSE_FX',accountId:fxAccount,positionId:fx.positionId},'1.11'),/not found/);
  const usd=await command({...open,symbol:'USDJPY=X',direction:'SHORT',stopLoss:null,takeProfit:null},'150');
  assert.equal(usd.margin,'100.00');
  const usdClose=await command({action:'CLOSE_FX',accountId:fxAccount,positionId:usd.positionId},'149');
  assert.equal(usdClose.pnl,'6.71');
  for(const lev of [1,2,5,10]) {
    const f=await command({...open,leverage:lev},'1.1'); assert.equal(Number(f.margin),1100/lev);
    await command({action:'CLOSE_FX',accountId:fxAccount,positionId:f.positionId},'1.1');
  }
  const split=await command(open,'1.1');
  const partial=await command({action:'CLOSE_FX',accountId:fxAccount,positionId:split.positionId,units:'400'},'1.12');
  assert.equal(partial.pnl,'8.00'); assert.equal(partial.releasedMargin,'44.00');
  const residual=(await db.query('SELECT units::text,margin::text FROM poshkan_trade_test.fx_positions WHERE id=$1',[split.positionId])).rows[0];
  assert.deepEqual(residual,{units:'600.00000000',margin:'66.00'});
  const stopped=await command({action:'CLOSE_FX',accountId:fxAccount,positionId:split.positionId},'0.01'); assert.equal(stopped.pnl,'-66.00');
  await assert.rejects(command({...open,leverage:30},'1.1'),/leverage/);
  await assert.rejects(command({...open,stopLoss:'1.2'},'1.1'),/stop loss/);
  const protect=await command(open,'1.1');
  await command({action:'PROTECT_FX',accountId:fxAccount,positionId:protect.positionId,stopLoss:'1.05',takeProfit:'1.3'},'1.15');
  await assert.rejects(command({action:'CLOSE_FX',accountId:stock,positionId:protect.positionId},'1.15'),/not found/);
  const closeRace=await Promise.allSettled([command({action:'CLOSE_FX',accountId:fxAccount,positionId:protect.positionId},'1.15'),command({action:'CLOSE_FX',accountId:fxAccount,positionId:protect.positionId},'1.15')]);
  assert.equal(closeRace.filter(x=>x.status==='fulfilled').length,1);
  checks.push('forex long/short, USD-base conversion, all four leverage choices, partial margin release, stop-out floor, protection and concurrent close');
  const restricted=await db.connect();
  try {
    await restricted.query('SET ROLE poshkan_trade_preview');
    await assert.rejects(restricted.query('SELECT * FROM poshkan_trade_test.accounts'),/permission denied/);
    await assert.rejects(restricted.query('SELECT poshkan_trade_test.state()'),/authorized/);
    await restricted.query('RESET ROLE');
  } finally { restricted.release(); }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM poshkan_stage.auth_links WHERE application_access_enabled')).rows[0].n,0);
  checks.push('executor cannot read tables or retain an identity across transactions; original stage stays disabled');
  await db.query(readFileSync(join(app,'neon/orders-preview-setup.sql'),'utf8'));
  await db.query(readFileSync(join(app,'neon/orders-engine.sql'),'utf8'));
  checks.push(...await verifyOrders(db,{user,legacy,account,command,balance}));
  await db.query(readFileSync(join(app,'neon/worker-preview-setup.sql'),'utf8'));
  await db.query(readFileSync(join(app,'neon/worker-engine.sql'),'utf8'));
  checks.push(...await verifyWorker(db,{user,legacy,account,balance}));
  await db.query(readFileSync(join(app,'neon/app-preview-setup.sql'),'utf8'));
  await db.query(readFileSync(join(app,'neon/app-engine.sql'),'utf8'));
  checks.push(...await verifyApp(db,{user,legacy,account,command}));
  for (const file of ["services-engine.sql","service-guards.sql","mcp-guard.sql","services-schedule.sql","ai-scanner.sql"]) await db.query(readFileSync(join(app,"neon",file),"utf8"));
  checks.push(...await verifyServices(db,{user,legacy,account}));
  checks.push(...await verifyAi(db,{user,legacy,account}));
  writeFileSync(join(migration,'generated/trading-test-result.json'),JSON.stringify({passed:true,checks},null,2));
  console.log(JSON.stringify({passed:true,checks}));
} finally {
  await db.end();
  if(started) run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);
}
