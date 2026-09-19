// Header-only secret, fixed loopback destination; never logs payloads or tokens.
import { setTimeout } from 'node:timers/promises';
const once=process.argv.includes('--once');
if(!process.env.CRON_SECRET)throw new Error('Local services credential missing');
do {
  try {
    const response=await fetch('http://127.0.0.1:3025/api/cron/neon-services',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(300000),
    });
    if(response.status===401)break; // A new app instance replaced this worker.
    const result=await response.json();
    console.log(JSON.stringify({status:response.status,jobs:result.jobs}));
    if(once && !response.ok)process.exitCode=1;
  } catch { console.warn('Local service check could not complete'); if(once)process.exitCode=1; }
  if(!once)await setTimeout(60000);
}while(!once);
