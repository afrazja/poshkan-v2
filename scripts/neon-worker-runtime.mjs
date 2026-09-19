import { checkedQuote } from '../src/lib/neon-preview/quote.mjs';
import YahooFinance from 'yahoo-finance2';

export function createWorkerQuoteProvider(signal) {
  const yahoo=new YahooFinance({suppressNotices:['yahooSurvey'],versionCheck:false,logger:{info(){},warn(){},error(){},debug(){},dir(){}}});
  return symbol=>yahoo.quote(symbol,{}, {fetchOptions:{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])}});
}

// The production runner supplies Yahoo quotes. Tests inject a synthetic provider
// here, never through a web endpoint, environment price override or CLI switch.
export async function runWorkerPass(client, getQuote, shouldStop=()=>false) {
  const state=(await client.query('SELECT poshkan_trade_test.worker_poll() AS result')).rows[0].result;
  if (!state.enabled) return {enabled:false};
  const summary={filled:0,closed:0,scaled:0,canceled:0,expired:0,waiting:0,unavailable:0,failed:0,paused:0,unchanged:0};
  const quotes=new Map();
  for (const item of state.items) {
    if(shouldStop()) break;
    const key=`${item.symbol}:${item.kind==='LIMIT'?'spot':'fx'}`;
    if(!quotes.has(key)) {
      try {
        const quote=await getQuote(item.symbol);
        quotes.set(key,{price:checkedQuote(item.symbol,quote,item.kind!=='LIMIT'),at:quote.regularMarketTime});
      } catch { quotes.set(key,null); }
    }
    if(shouldStop()) break;
    const quote=quotes.get(key);
    try {
      const result=(await client.query('SELECT poshkan_trade_test.worker_check($1,$2,$3,$4,$5,$6) AS result',
        [item.kind,item.id,item.accountId,item.symbol,quote?.price??null,quote?.at??null])).rows[0].result;
      if(Object.hasOwn(summary,result.status)) summary[result.status]++;
      if(result.status==='paused') break;
    } catch(error) {
      if(error.code==='42501' || String(error.code??'').startsWith('08')) throw error;
      summary.failed++;
    }
  }
  await client.query('SELECT poshkan_trade_test.worker_report($1)',[summary]);
  return {enabled:true,summary};
}
