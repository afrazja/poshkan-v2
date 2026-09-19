import 'server-only';
import { randomUUID } from 'node:crypto';
import YahooFinance from 'yahoo-finance2';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actor, transaction, placePreviewTrade } from '../neon-preview/trading';
import { saveOrder } from '../neon-preview/orders';
import { checkedQuote } from '../neon-preview/quote.mjs';

const yahoo=new YahooFinance({suppressNotices:['yahooSurvey']});
const decimal=(value:unknown)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0) throw new Error('Enter a positive amount.'); return value.toFixed(8).replace(/0+$/,'').replace(/\.$/,'');};
const nullable=(value:unknown)=>value==null?null:decimal(value);
type Result={filled:boolean;closed:boolean;price?:number;rate?:number;margin?:number;pnl?:number;reason?:string;error?:string;levels?:number};
export async function appTrading(action:string,input:Record<string,unknown>):Promise<Result> {
  const base:Result={filled:false,closed:false};
  try {
    const user=await actor();
    const accountId=input.accountId?z.uuid().parse(input.accountId):undefined;
    const request=input.requestId?z.uuid().parse(input.requestId):randomUUID();
    const symbol=typeof input.symbol==='string'?input.symbol.trim().toUpperCase():'';
    let result:Record<string,string>={};
    if(action==='SPOT') result=await placePreviewTrade(request,{action,accountId,symbol,side:input.side,quantity:decimal(input.quantity)});
    else if(action==='OPEN_FX') {
      result=await placePreviewTrade(request,{action,accountId,symbol,direction:input.direction,units:decimal(input.units),leverage:input.leverage??1,stopLoss:nullable(input.stopLoss),takeProfit:nullable(input.takeProfit),autoCloseMinutes:input.autoCloseMinutes??0});
    } else if(action==='CLOSE_FX'||action==='PROTECT_FX') result=await placePreviewTrade(request,{action,accountId,positionId:input.positionId,...(action==='PROTECT_FX'?{stopLoss:nullable(input.stopLoss),takeProfit:nullable(input.takeProfit)}:{})});
    else if(action==='PLACE_LIMIT') result=await saveOrder(request,{action,accountId,symbol,direction:input.side,quantity:decimal(input.quantity),target:decimal(input.limitPrice),expiryHours:null,timeInForce:input.timeInForce??'GTC'});
    else if(action==='PLACE_ENTRY') {
      const quote=await yahoo.quote(symbol);
      const rate=Number(checkedQuote(symbol,quote,true));
      result=await saveOrder(request,{action,accountId,symbol,direction:input.direction,quantity:decimal(input.units),target:decimal(input.entryRate),trigger:Number(input.entryRate)<rate?'AT_OR_BELOW':'AT_OR_ABOVE',leverage:input.leverage??1,stopLoss:nullable(input.stopLoss),takeProfit:nullable(input.takeProfit),expiryHours:null,expiryMinutes:input.expiresMinutes??null});
    } else if(action==='CANCEL_LIMIT'||action==='CANCEL_ENTRY') result=await saveOrder(request,{action,accountId,orderId:input.orderId});
    else if(action==='SET_LEVELS') {
      const levels=z.array(z.object({price:z.number(),units:z.number()})).max(10).parse(input.levels).map(l=>({price:decimal(l.price),units:decimal(l.units)}));
      result=await saveOrder(request,{action,accountId,positionId:input.positionId,levels});
    } else if(action==='EDIT_ENTRY') {
      const orderId=z.uuid().parse(input.orderId);
      const item=await transaction(user,async c=>(await c.query('SELECT symbol FROM poshkan_trade_test.fx_orders WHERE id=$1 AND account_id=$2 AND status=\'pending\'',[orderId,accountId])).rows[0]);
      if(!item) throw new Error('Account not found');
      const quote=await yahoo.quote(String(item.symbol));
      const price=checkedQuote(item.symbol,quote,true);
      if(await actor()!==user) throw new Error('Sign in again.');
      await transaction(user,c=>c.query('SELECT poshkan_trade_test.app_edit_entry($1,$2,$3,$4,$5,$6)',[orderId,accountId,decimal(input.entryRate),nullable(input.stopLoss),nullable(input.takeProfit),price]));
    } else if(action==='DELETE') {
      await transaction(user,c=>c.query("SELECT poshkan_trade_test.app_account('DELETE',$1,'{}')",[accountId]));
    } else if(['CHECK_LIMIT','CHECK_ENTRY','CHECK_POSITION'].includes(action)) {
      const id=z.uuid().parse(input.orderId??input.positionId);
      const kind=action==='CHECK_LIMIT'?'LIMIT':action==='CHECK_ENTRY'?'ENTRY':'POSITION';
      const candidates=await transaction(user,async c=>(await c.query('SELECT poshkan_trade_test.order_candidates() AS items')).rows[0].items as {id:string;kind:string;accountId:string;symbol:string}[]);
      const item=candidates.find(c=>c.id===id && c.kind===kind && (!accountId||c.accountId===accountId));
      if(!item) return base;
      let price:string|null=null,at:Date|null=null;
      try { const quote=await yahoo.quote(item.symbol); price=checkedQuote(item.symbol,quote,kind!=='LIMIT'); at=quote.regularMarketTime??null; } catch {}
      if(await actor()!==user) throw new Error('Sign in again.');
      const checked=await transaction(user,async c=>(await c.query('SELECT poshkan_trade_test.check_order($1,$2,$3,$4,$5,$6) AS result',[kind,id,item.accountId,item.symbol,price,at])).rows[0].result);
      revalidatePath('/dashboard','layout');
      return {...base,filled:checked.status==='filled',closed:checked.status==='closed',reason:checked.reason,levels:checked.levels??0,price:price?Number(price):undefined};
    } else throw new Error('Unsupported operation');
    revalidatePath('/dashboard','layout');
    return {...base,price:result.price?Number(result.price):undefined,rate:result.price?Number(result.price):undefined,margin:result.margin?Number(result.margin):undefined,pnl:result.pnl?Number(result.pnl):undefined};
  } catch(error) {
    const message=error instanceof Error?error.message:'';
    // Only known domain errors are safe to display; never expose SQL/provider diagnostics.
    const safe=/^(Enter a positive|Account not found|Not enough|Insufficient|A fresh market|The market is closed|Unsupported asset|This test supports|Invalid (order|trade|leverage)|Stop loss|Take profit|Total close|Sign in)/.test(message);
    return {...base,error:safe?message:'The change could not be completed. Check the amounts and try again.'};
  }
}
