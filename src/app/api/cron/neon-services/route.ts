import { servicesEnabled, serviceWork } from '@/lib/neon-app/services';
import { GET as custom } from '../custom-scan/route';
import { GET as market } from '../market-check/route';
import { GET as snapshots } from '../snapshots/route';
import { GET as digest } from '../weekly-digest/route';
import { GET as ai } from '../scan-opportunities/route';

export async function POST(request:Request) {
  if(!servicesEnabled())return Response.json({error:'Unavailable'},{status:404});
  if(!process.env.CRON_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return Response.json({error:'Unauthorized'},{status:401});
  const jobs: Record<string,unknown> = {};
  const definitions: Array<[string,number,(req:Request)=>Promise<Response>]> = [['market',60,market],['custom',300,custom],['ai',300,ai],['snapshots',86400,snapshots]];
  if(new Date().getUTCDay()===1)definitions.push(['digest',604800,digest]);
  for(const [name,seconds,run] of definitions) {
    const ticket=crypto.randomUUID();
    const claim=await serviceWork(async c=>(await c.query('SELECT poshkan_trade_test.claim_service_job($1,$2,$3) AS claimed',[name,seconds,ticket])).rows[0].claimed);
    if(!claim){jobs[name]='not due';continue;}
    try {
      const response=await run(request);
      const result=await response.json();
      const status=!response.ok||result.error?'failed':result.blocked||result.skipped?'blocked':'completed';
      await serviceWork(c=>c.query('SELECT poshkan_trade_test.finish_service_job($1,$2,$3)',[name,ticket,status]));
      jobs[name]=status;
    } catch {
      await serviceWork(c=>c.query('SELECT poshkan_trade_test.finish_service_job($1,$2,$3)',[name,ticket,'failed']));
      jobs[name]='failed';
    }
  }
  return Response.json({jobs,delivery:'capture only'},{status:Object.values(jobs).includes('failed')?500:200});
}
