import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {positionExitLabel,positionHoldingMinutes} from '../src/lib/position-records.mjs';
const load=(file,mocks)=>{const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{assert.ok(name in mocks,name);return mocks[name];},module,module.exports);return module.exports;};
const assets=load('src/lib/assets.ts',{});
const validation=load('src/lib/neon-app/mcp-position-validation.ts',{'../assets':assets});
const inputs=load('src/lib/neon-preview/trade-input.ts',{'zod':{z},'./quote.mjs':{checkedQuote:()=>100}});
const tools=new Map(),queries=[],quoted=[];let quoteCalls=0,receipt=null;
const stocks='11111111-1111-4111-8111-111111111111',forex='22222222-2222-4222-8222-222222222222',crypto='33333333-3333-4333-8333-333333333333';
const accounts=[{id:stocks,type:'stocks',forex:[]},{id:forex,type:'forex',forex:[]},{id:crypto,type:'crypto',forex:[]}];
const records=[{id:'position',account_id:stocks,direction:'SHORT',open_rate:100,stop_loss:110,take_profit:80,auto_close_at:'2026-10-04T12:00:00Z',opened_at:'2026-10-01T12:00:00Z',holding_minutes:4320,status:'closed',exit_reason:'timer'}];
const c={query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('verify_api_token'))return {rows:[{}]};if(sql.includes('.completed('))return {rows:[{receipt}]};if(sql.includes('.state()'))return {rows:[{state:accounts}]};if(sql.includes('.order_command('))return {rows:[{receipt:{status:'pending'}}]};if(sql.includes('.fx_positions'))return {rows:records};throw Error(sql);}};
class Yahoo {async quote(){quoteCalls++;return {regularMarketTime:new Date()};}}
const mocks={
 'server-only':{},'../neon-preview/config':{approvedUserId:()=> 'synthetic'},'./schema.mjs':{databaseSchema:()=> 'poshkan_live'},'node:crypto':await import('node:crypto'),
 'mcp-handler':{createMcpHandler:setup=>{setup({tool:(name,description,schema,fn)=>tools.set(name,{description,schema,fn})});return ()=>new Response('synthetic');}},'zod':{z},
 '../neon-preview/trading':{transaction:async(user,fn)=>{assert.equal(user,'synthetic');return fn(c);}},'../neon-preview/trade-input':inputs,'../neon-preview/quote.mjs':{checkedQuote:()=>100},
 'yahoo-finance2':{default:Yahoo},'../marketdata':{},'./services':{servicesEnabled:()=>true},'../mcp-oauth':{unauthorizedMcpResponse:()=>new Response('Unauthorized',{status:401})},
 './quoted-trade':{quotedTrade:async(client,id,command)=>{quoted.push(command);return {positionId:'synthetic',action:command.action};}},'./research':{},'./mcp-position-validation':validation,'../position-records.mjs':{positionExitLabel,positionHoldingMinutes}
};
const {neonMcpHandler}=load('src/lib/neon-app/mcp.ts',mocks);
assert.equal((await neonMcpHandler(new Request('http://fixture'))).status,401);
await neonMcpHandler(new Request('http://fixture',{headers:{authorization:'Bearer pk_synthetic_fixture'}}));
const call=async(name,args)=>tools.get(name).fn(z.object(tools.get(name).schema).parse(args));
const base={request_id:'44444444-4444-4444-8444-444444444444',account_id:stocks,symbol:'SPY',units:2,leverage:2,stop_loss:90,take_profit:120,auto_close_minutes:4320};
for(const direction of ['LONG','SHORT'])assert.ok(!(await call('open_forex_position',{...base,direction,stop_loss:direction==='LONG'?90:110,take_profit:direction==='LONG'?120:80})).isError);
assert.equal(quoted.at(-1).autoCloseMinutes,4320);assert.equal(quoted.at(-1).direction,'SHORT');
let before=quoteCalls;
for(const args of [{...base,account_id:crypto,symbol:'BTC-USD'},{...base,symbol:'EURUSD=X'},{...base,account_id:forex,symbol:'SPY'},{...base,account_id:'55555555-5555-4555-8555-555555555555'}])assert.ok((await call('open_forex_position',{...args,direction:'LONG'})).isError);
assert.equal(quoteCalls,before);
assert.ok(!(await call('open_forex_position',{...base,account_id:forex,symbol:'EURUSD=X',direction:'LONG'})).isError);
receipt={positionId:'original'};before=quoteCalls;assert.deepEqual(JSON.parse((await call('open_forex_position',{...base,direction:'LONG'})).content[0].text),receipt);assert.equal(quoteCalls,before);receipt=null;
const pending={request_id:base.request_id,account_id:stocks,symbol:'SPY',direction:'SHORT',units:1,leverage:2,entry_rate:100,trigger:'AT_OR_BELOW'};
assert.ok(!(await call('place_forex_entry_order',pending)).isError);
assert.ok((await call('place_forex_entry_order',{...pending,account_id:crypto,symbol:'BTC-USD'})).isError);
assert.ok((await call('place_forex_entry_order',{...pending,symbol:'EURUSD=X'})).isError);
const list=JSON.parse((await call('list_forex_positions',{account_id:stocks,status:'closed'})).content[0].text);
assert.equal(list[0].direction,'SHORT');assert.equal(list[0].rate,100);assert.equal(list[0].stopLoss,110);assert.equal(list[0].holdingMinutes,4320);assert.equal(list[0].exitReasonLabel,'Timed exit');assert.ok(list[0].autoCloseAt);
assert.equal(queries.at(-1).args[1],'closed');
await call('list_forex_positions',{account_id:stocks});assert.equal(queries.at(-1).args[1],'open');
assert.ok((await call('list_forex_positions',{account_id:'55555555-5555-4555-8555-555555555555'})).isError);
assert.equal(positionExitLabel({status:'closed'}),'Closed (reason not recorded)');assert.equal(positionExitLabel({status:'closed',exit_reason:'manual'}),'Manual close');assert.equal(positionExitLabel({status:'sl'}),'Stop-loss');
console.log('PASS: actual MCP registration and handlers allow stock LONG/SHORT and pending entry, preserve guarded crypto and asset/owner restrictions, retries avoid refetch, and position history exposes protection/deadlines/reasons with legacy unknowns.');

const {renderToStaticMarkup}=await import('react-dom/server');const React=await import('react');
const {default:Details}=load('src/components/account/PositionPlanDetails.tsx',{'@/lib/position-records.mjs':{positionHoldingMinutes},'react/jsx-runtime':await import('react/jsx-runtime')});
const html=renderToStaticMarkup(React.createElement(Details,{position:records[0],fmtPrice:n=>'$'+n}));assert.ok(html.includes('SL $110'));assert.ok(html.includes('TP $80'));assert.ok(html.includes('4320 minutes'));assert.ok(html.includes('Deadline:'));
console.log('PASS: actual shared position detail component renders saved SL/TP, timeframe and deadline.');
