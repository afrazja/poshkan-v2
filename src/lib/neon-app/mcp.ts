import 'server-only';
import { createHash } from 'node:crypto';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { transaction } from '../neon-preview/trading';
import { tradeInput, orderInput } from '../neon-preview/trade-input';
import { checkedQuote } from '../neon-preview/quote.mjs';
import YahooFinance from 'yahoo-finance2';
import { getQuote, getOhlc, searchSymbols } from '../marketdata';
import { servicesEnabled } from './services';
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const uuid=z.string().uuid();
const ok=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});

export async function neonMcpHandler(req: Request) {
  if (!servicesEnabled()) return new Response('Unavailable',{status:404});
  const token=req.headers.get('authorization')?.match(/^Bearer (pk_\S+)$/i)?.[1];
  if (!token || token.length>512) return new Response('Unauthorized',{status:401});
  const hash=createHash('sha256').update(token).digest('hex');
  const userId=process.env.NEON_PREVIEW_USER_ID!;
  const work=<T>(fn:Parameters<typeof transaction<T>>[1])=>transaction(userId,async c=>{
    await c.query('SELECT poshkan_trade_test.verify_api_token($1)',[hash]);
    return fn(c);
  });
  try { await work(async()=>true); } catch { return new Response('Unauthorized',{status:401}); }
  const respond=async(fn:()=>Promise<unknown>)=>{
    try { await work(async()=>true); return ok(await fn()); }
    catch { return {content:[{type:'text' as const,text:'The request failed. Check account ownership, inputs, available cash and quote availability. Retry mutations with the same request_id.'}],isError:true}; }
  };
  const read=()=>work(async c=>(await c.query('SELECT poshkan_trade_test.state() AS state')).rows[0].state as Array<{id:string;type:string;forex:Array<{id:string;symbol:string}>}>);
  const trade=async(requestId:string,raw:unknown)=>{
    const command=tradeInput.parse(raw);
    const completed=await work(async c=>(await c.query('SELECT poshkan_trade_test.completed($1,$2) AS receipt',[requestId,command])).rows[0].receipt);
    if (completed) return completed;
    const account=(await read()).find(a=>a.id===command.accountId);
    if (!account) throw new Error('Account not found');
    if(command.action==='OPEN_FX' && account.type!=='forex') throw new Error('Use guarded crypto entry for crypto accounts');
    const symbol='symbol' in command?command.symbol:account.forex.find(p=>p.id===command.positionId)?.symbol;
    if (!symbol) throw new Error('Position not found');
    const quote=await yahoo.quote(symbol);
    const price=checkedQuote(symbol,quote,command.action!=='SPOT');
    return work(async c=>(await c.query('SELECT poshkan_trade_test.command($1,$2,$3) AS receipt',[requestId,command,price])).rows[0].receipt);
  };
  const order=async(requestId:string,raw:unknown)=>{
    const command=orderInput.parse(raw);
    if(command.action==='PLACE_ENTRY' && !(await read()).some(a=>a.id===command.accountId&&a.type==='forex')) throw new Error('Use guarded crypto entry for crypto accounts');
    return work(async c=>(await c.query('SELECT poshkan_trade_test.order_command($1,$2) AS receipt',[requestId,command])).rows[0].receipt);
  };
  const number=z.number().finite().positive();
  const leverage=z.union([z.literal(1),z.literal(2),z.literal(5),z.literal(10)]);
  const handler=createMcpHandler(server=>{
    server.tool('list_accounts','List the token owner’s Neon test paper accounts and holdings.',{},()=>respond(read));
    server.tool('get_account','Read one owned paper account.',{account_id:uuid},({account_id})=>respond(async()=>{
      const account=(await read()).find(a=>a.id===account_id); if(!account)throw new Error('Account not found');
      return account;
    }));
    server.tool('get_transactions','Read recent ledger entries for an owned account.',{account_id:uuid,limit:z.number().int().min(1).max(200).default(50)},({account_id,limit})=>respond(()=>work(async c=>(await c.query('SELECT symbol,side,quantity,price,cash_delta,created_at FROM poshkan_trade_test.transactions WHERE account_id=$1 ORDER BY created_at DESC LIMIT $2',[account_id,limit])).rows)));
    server.tool('get_quote','Read a market quote; never supply it as an execution price.',{symbol:z.string().min(1).max(24)},({symbol})=>respond(()=>getQuote(symbol)));
    server.tool('search_symbols','Find ticker symbols.',{query:z.string().min(1).max(100)},({query})=>respond(()=>searchSymbols(query)));
    server.tool('get_price_history','Read OHLC price history.',{symbol:z.string().min(1).max(24),interval:z.enum(['5min','15min','1h','1day','1week']).default('1day'),limit:z.number().int().min(2).max(300).default(60)},({symbol,interval,limit})=>respond(()=>getOhlc(symbol,interval,limit)));
    server.tool('trade','Execute a paper spot trade. Generate a UUID request_id once; keep it unchanged when retrying the same trade.',{request_id:uuid,account_id:uuid,symbol:z.string(),side:z.enum(['BUY','SELL']),quantity:number},a=>respond(()=>trade(a.request_id,{action:'SPOT',accountId:a.account_id,symbol:a.symbol,side:a.side,quantity:String(a.quantity)})));
    server.tool('open_crypto_position','Guarded paper crypto entry: max 0.5% cash stop risk, 25% margin, at least 3:1 reward/risk, one position, mandatory atomic timed exit. Use dry_run to validate. Reuse request_id on retries.',{request_id:uuid,account_id:uuid,symbol:z.string().regex(/^[A-Za-z0-9]+-USD$/),direction:z.enum(['LONG','SHORT']),units:number,leverage:z.union([z.literal(1),z.literal(2)]).default(2),stop_loss:number,take_profit:number,auto_close_minutes:z.number().int().min(1).max(8640).default(4320),dry_run:z.boolean().default(true)},a=>respond(async()=>{
      const command={action:'GUARDED_CRYPTO',accountId:a.account_id,symbol:a.symbol.toUpperCase(),direction:a.direction,units:a.units,leverage:a.leverage,stopLoss:a.stop_loss,takeProfit:a.take_profit,autoCloseMinutes:a.auto_close_minutes,dryRun:a.dry_run};
      const receipt=await work(async c=>(await c.query('SELECT poshkan_trade_test.completed($1,$2) AS receipt',[a.request_id,command])).rows[0].receipt);
      if(receipt)return receipt;
      const q=await yahoo.quote(command.symbol),price=checkedQuote(command.symbol,q,true);
      return work(async c=>(await c.query('SELECT poshkan_trade_test.mcp_crypto_command($1,$2,$3) AS receipt',[a.request_id,command,price])).rows[0].receipt);
    }));
    server.tool('open_forex_position','Open a paper leveraged position with explicit leverage and an atomic optional timed exit. Reuse request_id on retries.',{request_id:uuid,account_id:uuid,symbol:z.string(),direction:z.enum(['LONG','SHORT']),units:number,leverage,stop_loss:number.nullable().default(null),take_profit:number.nullable().default(null),auto_close_minutes:z.number().int().min(0).max(10080).default(0)},a=>respond(()=>trade(a.request_id,{action:'OPEN_FX',accountId:a.account_id,symbol:a.symbol,direction:a.direction,units:String(a.units),leverage:a.leverage,stopLoss:a.stop_loss===null?null:String(a.stop_loss),takeProfit:a.take_profit===null?null:String(a.take_profit),autoCloseMinutes:a.auto_close_minutes})));
    server.tool('close_forex_position','Close a paper leveraged position, optionally partially. Reuse request_id on retries.',{request_id:uuid,account_id:uuid,position_id:uuid,units:number.optional()},a=>respond(()=>trade(a.request_id,{action:'CLOSE_FX',accountId:a.account_id,positionId:a.position_id,...(a.units?{units:String(a.units)}:{})})));
    server.tool('list_forex_positions','Read the owner’s open leveraged positions.',{account_id:uuid},a=>respond(async()=>{const account=(await read()).find(x=>x.id===a.account_id);if(!account)throw new Error('Account not found');return account.forex;}));
    server.tool('place_limit_order','Place a paper limit order. Reuse request_id on retries.',{request_id:uuid,account_id:uuid,symbol:z.string(),side:z.enum(['BUY','SELL']),quantity:number,limit_price:number,time_in_force:z.enum(['DAY','GTC']).default('GTC')},a=>respond(()=>order(a.request_id,{action:'PLACE_LIMIT',accountId:a.account_id,symbol:a.symbol,direction:a.side,quantity:String(a.quantity),target:String(a.limit_price),timeInForce:a.time_in_force,expiryHours:null})));
    server.tool('place_forex_entry_order','Place a pending paper entry with explicit trigger, leverage, and optional expiry. Reuse request_id on retries.',{request_id:uuid,account_id:uuid,symbol:z.string(),direction:z.enum(['LONG','SHORT']),units:number,entry_rate:number,trigger:z.enum(['AT_OR_ABOVE','AT_OR_BELOW']),leverage,stop_loss:number.nullable().default(null),take_profit:number.nullable().default(null),expires_minutes:z.number().int().min(1).max(10080).nullable().default(null)},a=>respond(()=>order(a.request_id,{action:'PLACE_ENTRY',accountId:a.account_id,symbol:a.symbol,direction:a.direction,quantity:String(a.units),target:String(a.entry_rate),trigger:a.trigger,leverage:a.leverage,stopLoss:a.stop_loss===null?null:String(a.stop_loss),takeProfit:a.take_profit===null?null:String(a.take_profit),expiryHours:null,expiryMinutes:a.expires_minutes})));
    for(const [name,action] of [['cancel_order','CANCEL_LIMIT'],['cancel_forex_order','CANCEL_ENTRY']] as const)server.tool(name,'Cancel an owned pending paper order. Reuse request_id on retries.',{request_id:uuid,account_id:uuid,order_id:uuid},a=>respond(()=>order(a.request_id,{action,accountId:a.account_id,orderId:a.order_id})));
    server.tool('list_forex_orders','Read pending orders and exit plans for owned accounts.',{},()=>respond(()=>work(async c=>(await c.query('SELECT poshkan_trade_test.order_state() AS state')).rows[0].state)));
  },{},{basePath:'/api/mcp',verboseLogs:false});
  return handler(req);
}
