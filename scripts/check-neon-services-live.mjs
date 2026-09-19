import assert from 'node:assert/strict';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import pg from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const db=new pg.Client({connectionString:process.env.NEON_PREVIEW_DATABASE_URL});
const base='http://127.0.0.1:3025';
const token='pk_'+randomBytes(32).toString('hex');
const tokenId=randomUUID();
const testAccount=randomUUID(),placeRequest=randomUUID(),cancelRequest=randomUUID();
const mcp=new Client({name:'poshkan-migration-check',version:'1.0.0'});
const checks=[];
let inserted=false;
let accountInserted=false;
let owner;
try {
 await db.connect();
 owner=(await db.query('SELECT legacy_user_id AS id FROM poshkan_trade_test.auth_links WHERE neon_user_id=$1 AND application_access_enabled',[process.env.NEON_PREVIEW_USER_ID])).rows[0].id;
 for(const path of ['/api/cron/custom-scan','/api/mcp/mcp']) {
  const response=await fetch(base+path);assert.equal(response.status,401);
 }
 checks.push('machine endpoints reject missing credentials');
 await db.query("INSERT INTO poshkan_trade_test.api_tokens(id,user_id,name,token_hash) VALUES($1,$2,'Temporary migration verification',$3)",[tokenId,owner,createHash('sha256').update(token).digest('hex')]);inserted=true;
 await mcp.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 const listed=await mcp.listTools();assert.ok(listed.tools.some(t=>t.name==='open_crypto_position'));assert.ok(listed.tools.some(t=>t.name==='cancel_order'));
 const result=await mcp.callTool({name:'list_accounts',arguments:{}});assert.ok(!result.isError);
 const accounts=JSON.parse(result.content[0].text);
 const expected=(await db.query('SELECT id FROM poshkan_trade_test.accounts WHERE user_id=$1',[owner])).rows.map(r=>r.id).sort();
 assert.deepEqual(accounts.map(a=>a.id).sort(),expected);
 checks.push('real MCP protocol initializes, lists tools and returns only owner accounts');
 await db.query("INSERT INTO poshkan_trade_test.accounts(id,user_id,name,type,cash_balance) VALUES($1,$2,'Temporary protocol verification','stocks',1000)",[testAccount,owner]);accountInserted=true;
 const orderArgs={request_id:placeRequest,account_id:testAccount,symbol:'AAPL',side:'BUY',quantity:1,limit_price:1,time_in_force:'GTC'};
 const placed=await mcp.callTool({name:'place_limit_order',arguments:orderArgs});assert.ok(!placed.isError);
 const receipt=JSON.parse(placed.content[0].text);
 const retry=await mcp.callTool({name:'place_limit_order',arguments:orderArgs});assert.deepEqual(JSON.parse(retry.content[0].text),receipt);
 const row=(await db.query('SELECT id,status FROM poshkan_trade_test.orders WHERE account_id=$1',[testAccount])).rows;assert.equal(row.length,1);assert.equal(row[0].status,'pending');
 const cancelled=await mcp.callTool({name:'cancel_order',arguments:{request_id:cancelRequest,account_id:testAccount,order_id:row[0].id}});assert.ok(!cancelled.isError);
 assert.equal((await db.query('SELECT status FROM poshkan_trade_test.orders WHERE id=$1',[row[0].id])).rows[0].status,'canceled');
 assert.equal(Number((await db.query('SELECT cash_balance FROM poshkan_trade_test.accounts WHERE id=$1',[testAccount])).rows[0].cash_balance),1000);
 checks.push('real MCP order placement, idempotent retry and cancellation preserve cash');
 await db.query('DELETE FROM poshkan_trade_test.orders WHERE account_id=$1',[testAccount]);
 await db.query('DELETE FROM poshkan_trade_test.accounts WHERE id=$1',[testAccount]);accountInserted=false;
 await db.query('DELETE FROM poshkan_trade_test.api_tokens WHERE id=$1',[tokenId]);inserted=false;
 await assert.rejects(()=>mcp.callTool({name:'list_accounts',arguments:{}}));
 checks.push('revoking the test token immediately blocks the next MCP call');
 const headers={Authorization:`Bearer ${process.env.CRON_SECRET}`};
 for(const job of ['custom-scan','market-check','weekly-digest']) {
  const response=await fetch(base+'/api/cron/'+job,{headers,signal:AbortSignal.timeout(120000)});
  const result=await response.json();assert.equal(response.status,200);assert.ok(!result.error&&!result.skipped,job+' did not complete');
  checks.push(job+' completes against Neon with delivery captured');
 }
 const ai=await fetch(base+'/api/cron/scan-opportunities',{headers});assert.ok((await ai.json()).blocked);
 checks.push('scheduled AI scans remain explicitly disabled during rehearsal');
 const out=(await db.query('SELECT channel,count(*)::int AS count FROM poshkan_trade_test.delivery_captures WHERE user_id=$1 GROUP BY channel',[owner])).rows;
 const cache=(await db.query('SELECT count(*)::int AS count FROM poshkan_trade_test.market_quotes')).rows[0].count;
 const jobs=(await db.query('SELECT name,status FROM poshkan_trade_test.service_jobs WHERE user_id=$1',[owner])).rows;
 const snapshots=(await db.query('SELECT count(*)::int AS count FROM poshkan_trade_test.account_snapshots s JOIN poshkan_trade_test.accounts a ON a.id=s.account_id WHERE a.user_id=$1 AND s.snapshot_date=current_date',[owner])).rows[0].count;
 const scans=(await db.query('SELECT count(*)::int AS count FROM poshkan_trade_test.market_scans WHERE run_date=current_date')).rows[0].count;
 console.log(JSON.stringify({passed:true,checks,captured:out,quoteCacheRows:cache,jobs,snapshotsToday:snapshots,publicScansToday:scans}));
} finally {
 await mcp.close().catch(()=>{});
 if(inserted)await db.query('DELETE FROM poshkan_trade_test.api_tokens WHERE id=$1',[tokenId]);
 if(accountInserted){await db.query('DELETE FROM poshkan_trade_test.orders WHERE account_id=$1',[testAccount]);await db.query('DELETE FROM poshkan_trade_test.accounts WHERE id=$1',[testAccount]);}
 if(owner)await db.query('DELETE FROM poshkan_trade_test.requests WHERE actor_id=$1 AND request_id=ANY($2::uuid[])',[owner,[placeRequest,cancelRequest]]);
 await db.end();
}
