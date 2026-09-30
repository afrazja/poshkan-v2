import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// Run the actual route with synthetic DB/provider responses. No app session or
// production endpoint is involved. Assert cash-flow and reset benchmark behavior.
const snapshots=[{snapshot_date:'2026-09-20',total_value:9000},{snapshot_date:'2026-09-21',total_value:1000},{snapshot_date:'2026-09-22',total_value:1000},{snapshot_date:'2026-09-23',total_value:1110},{snapshot_date:'2026-09-24',total_value:1121.1}];
const transactions=[{account_id:'fixture',side:'RESET',symbol:null,quantity:0,price:0,cash_delta:1000,created_at:'2026-09-21T14:00:00Z'},{account_id:'fixture',side:'DEPOSIT',symbol:null,quantity:0,price:0,cash_delta:100,created_at:'2026-09-23T14:00:00Z'}];
let benchmarkAvailable=true;
class Query {
  constructor(table){this.rows=table==='account_snapshots'?snapshots:transactions;this.rows=[...this.rows];}
  select(){return this;}
  eq(k,v){if(k!=='account_id')this.rows=this.rows.filter(r=>r[k]===v);return this;}
  gte(k,v){this.rows=this.rows.filter(r=>r[k]>=v);return this;}
  gt(k,v){this.rows=this.rows.filter(r=>r[k]>v);return this;}
  in(k,v){this.rows=this.rows.filter(r=>v.includes(r[k]));return this;}
  order(k,options={}){this.rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(options.ascending===false?-1:1));return this;}
  limit(n){this.rows=this.rows.slice(0,n);return this;}
  then(resolve){return Promise.resolve({data:this.rows}).then(resolve);}
}
const mocks={'next/server':{NextResponse:Response},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic'}}})},from:t=>new Query(t)})},'@/lib/marketdata':{getTimeSeries:async symbol=>{assert.equal(symbol,'^GSPC');if(!benchmarkAvailable)throw Error('Synthetic unavailable');return [{datetime:'2026-09-22',close:5000},{datetime:'2026-09-23',close:5050},{datetime:'2026-09-24',close:5100}];}}};
const compiled=ts.transpileModule(readFileSync('src/app/api/performance/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};new Function('require','module','exports',compiled)(name=>{assert.ok(name in mocks);return mocks[name];},module,module.exports);
const {GET}=module.exports;
const result=await (await GET(new Request('http://fixture/api/performance?accountId=fixture&range=1Y'))).json();
assert.deepEqual(result.points.map(p=>p.date),['2026-09-22','2026-09-23','2026-09-24']);
assert.ok(Math.abs(result.points[1].portfolio-1)<1e-8);assert.ok(Math.abs(result.points[2].portfolio-2.01)<1e-8);
assert.ok(Math.abs(result.points[1].spy-1)<1e-8);assert.ok(Math.abs(result.points[2].spy-2)<1e-8);
assert.equal(result.since,'2026-09-22');
benchmarkAvailable=false;const unavailable=await (await GET(new Request('http://fixture/api/performance?accountId=fixture&range=1Y'))).json();assert.ok(unavailable.points.every(p=>p.spy===null));
snapshots.splice(2);const sparse=await (await GET(new Request('http://fixture/api/performance?accountId=fixture&range=1Y'))).json();assert.deepEqual(sparse.points,[]);
console.log('PASS: actual performance route excludes pre-reset/reset-day snapshots, removes deposits from return, uses matching benchmark dates, and preserves missing/sparse history.');
