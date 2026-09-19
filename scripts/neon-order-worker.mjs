import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { createWorkerQuoteProvider, runWorkerPass } from './neon-worker-runtime.mjs';

const connectionString=process.env.NEON_WORKER_DATABASE_URL;
if(!connectionString || process.env.VERCEL) {
  console.error('The local order worker needs its dedicated Neon configuration.');
  process.exit(1);
}
const parsed=new URL(connectionString);
if(parsed.username!=='poshkan_preview_worker' || parsed.pathname!=='/neondb' || parsed.searchParams.get('sslmode')!=='verify-full') {
  console.error('Refusing an unrestricted or unexpected worker connection.');
  process.exit(1);
}
const shutdown=new AbortController();
process.on('SIGINT',()=>shutdown.abort());process.on('SIGTERM',()=>shutdown.abort());
const getQuote=createWorkerQuoteProvider(shutdown.signal);
let lastMessage='';
const report=message=>{if(message!==lastMessage){console.log(new Date().toISOString()+' '+message);lastMessage=message;}};
while(!shutdown.signal.aborted) {
  const client=new pg.Client({connectionString,application_name:'PoshkanNeonOrderWorker',connectionTimeoutMillis:15000,query_timeout:20000,statement_timeout:15000,keepAlive:true});
  let lost=false; client.on('error',()=>{lost=true;});
  try {
    await client.connect();
    const claimed=(await client.query('SELECT poshkan_trade_test.worker_claim() AS claimed')).rows[0].claimed;
    if(!claimed) {report('Another Poshkan test worker is already connected.');break;}
    while(!shutdown.signal.aborted) {
      if(lost) throw new Error('Connection lost');
      const pass=await runWorkerPass(client,getQuote,()=>shutdown.signal.aborted);
      report(pass.enabled?'Background test checks enabled.':'Background test checks stopped; waiting for the app.');
      await delay(pass.enabled?15000:30000,undefined,{signal:shutdown.signal});
    }
  } catch {
    if(!shutdown.signal.aborted) report('Worker connection or authorization unavailable; retrying in 30 seconds.');
  } finally {await client.end().catch(()=>{});}
  if(!shutdown.signal.aborted) await delay(30000,undefined,{signal:shutdown.signal}).catch(()=>{});
}
report('Order worker stopped.');
