'use client';
import { useEffect,useState,type FormEvent } from 'react';
import type { Transaction } from '@/lib/types';
import type { ResearchCommand } from '@/lib/research-input';
import { formatCurrency } from '@/lib/format';
import PerformanceCard from './PerformanceCard';

type Entry={id:string;symbol:string;decision:string;hypothesis:string;strategy_version:string;entry_conditions:string;exit_conditions:string;holding_days:number;position_sizing:string;created_at:string;reviews:{id:string;note:string;created_at:string}[];links:{transaction_key:string;ledger_snapshot:Transaction}[]};
type Profile={label:string;fixed_fee:string;per_unit_fee:string;fee_bps:string;minimum_fee:string;half_spread_bps:string;slippage_bps:string};
type State={available:boolean;entries:Entry[];transactions:Transaction[];profile:Profile|null;review:{netRealized:number;explicitFees:number;spreadCost:number;slippageCost:number;sales:number;profitableSales:number;unknownSales:number;since:string|null}};
const fields=[['fixedFee','fixed_fee','Fixed fee / fill ($)'],['perUnitFee','per_unit_fee','Fee / share or unit ($)'],['feeBps','fee_bps','Notional fee (bps)'],['minimumFee','minimum_fee','Minimum fee / fill ($)'],['halfSpreadBps','half_spread_bps','Half spread / side (bps)'],['slippageBps','slippage_bps','Adverse slippage / side (bps)']] as const;
const inputClass='w-full rounded-lg border border-border bg-background p-2 text-sm';
export default function ResearchPanel({accountId}:{accountId:string}) {
  const [data,setData]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  // Retain failed requests: retrying an uncertain network result cannot duplicate
  // a plan, review, or profile change. Changing the command gets a new UUID.
  const [retry,setRetry]=useState<{key:string;id:string}|null>(null);
  async function load() {
    const response=await fetch(`/api/research?accountId=${encodeURIComponent(accountId)}`);
    if(!response.ok)throw new Error('Research could not be loaded.');
    setData(await response.json());
  }
  useEffect(()=>{let active=true;fetch(`/api/research?accountId=${encodeURIComponent(accountId)}`).then(r=>r.ok?r.json():Promise.reject()).then(j=>{if(active)setData(j);}).catch(()=>{if(active)setError('Research could not be loaded.');});return()=>{active=false;};},[accountId]);
  async function save(command:ResearchCommand,form?:HTMLFormElement) {
    if(busy)return;
    setBusy(true);setError('');
    const key=JSON.stringify(command),id=retry?.key===key?retry.id:crypto.randomUUID();
    setRetry({key,id});
    try {
      const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:id,command})});
      const result=await r.json();if(!r.ok)throw new Error(result.error);
      setRetry(null);form?.reset();await load();
    } catch(e){setError(e instanceof Error?e.message:'Could not save; retry this request.');}finally{setBusy(false);}
  }
  function plan(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const f=event.currentTarget,v=new FormData(f),get=(k:string)=>String(v.get(k)??'');
    void save({action:'PLAN',accountId,symbol:get('symbol'),decision:get('decision') as 'TRADE'|'NO_TRADE',hypothesis:get('hypothesis'),strategyVersion:get('strategyVersion'),entryConditions:get('entryConditions'),exitConditions:get('exitConditions'),holdingDays:Number(v.get('holdingDays')),positionSizing:get('positionSizing')},f);
  }
  if(!data)return <p role="status" className="text-sm text-muted">{error||'Loading research…'}</p>;
  if(!data.available)return null;
  const review=data.review;
  return <div className="space-y-5">
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold">Spot performance review</h3>
      <p className="mt-1 text-xs text-muted">Since {review.since?new Date(review.since).toLocaleString():'the first available transaction'} or the latest reset. Weighted-average account cost basis; net realized results include entry and exit fees and modeled fill costs. Open holdings use fee-inclusive basis and exclude future exit costs.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[['Net realized',review.netRealized],['Explicit fees paid',review.explicitFees],['Modeled spread cost',review.spreadCost],['Modeled slippage cost',review.slippageCost]].map(([label,value])=><div key={String(label)}><dt className="text-muted">{label}</dt><dd className="font-semibold">{formatCurrency(Number(value))}</dd></div>)}
      </dl>
      <p className="mt-3 text-xs text-muted">{review.profitableSales} profitable sale executions out of {review.sales} measured sales; these can be partial exits, not independent strategy trades. {review.unknownSales>0?`${review.unknownSales} older sales lack recoverable basis and are excluded.`:''} Historical fills have zero recorded costs; no history has been recosted. Cost totals include open trades: entry fees stay in basis until sold. Do not subtract these totals again from net results.</p>
    </section>
    <PerformanceCard accountId={accountId}/>
    <p className="text-xs text-muted">Benchmark: S&amp;P 500 index (^GSPC) price return over available daily snapshots. The portfolio covers the whole account, including any leveraged positions, with daily cash-flow-adjusted chained returns; intraday cash-flow timing is approximate. Recorded paper execution costs affect portfolio value. Neither series credits dividends; this is not a total-return or risk-matched benchmark. Missing history stays unavailable.</p>
    <details className="rounded-2xl border border-border bg-card p-5">
      <summary className="cursor-pointer font-semibold">Execution profile: {data.profile?.label??'Zero explicit fees; direct quote'}</summary>
      <p className="my-3 text-xs text-muted">Applies to future spot fills in this account’s asset class, including queued limits. Choose assumptions for your broker; stock/ETF commission can be zero. 1 bp = 0.01%. Explicit fee = max(minimum, fixed + per unit × quantity + filled notional × fee bps / 10,000). Spread and slippage shift price adversely on each side. This does not model leveraged positions.</p>
      <form onSubmit={e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f);const command:ResearchCommand={action:'PROFILE',accountId,label:String(v.get('label')),fixedFee:Number(v.get('fixedFee')),perUnitFee:Number(v.get('perUnitFee')),feeBps:Number(v.get('feeBps')),minimumFee:Number(v.get('minimumFee')),halfSpreadBps:Number(v.get('halfSpreadBps')),slippageBps:Number(v.get('slippageBps'))};void save(command);}} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Broker / assumption label<input name="label" required maxLength={80} defaultValue={data.profile?.label??'Commission-free stocks / ETFs'} className={inputClass}/></label>
        {fields.map(([name,key,label])=><label key={name} className="text-xs">{label}<input name={name} type="number" required min="0" max={name==='perUnitFee'?100:1000} step="any" defaultValue={data.profile?.[key]??0} className={inputClass}/></label>)}
        <button disabled={busy} className="rounded-lg bg-primary p-2 text-sm text-white disabled:opacity-50">Save future execution assumptions</button>
      </form>
    </details>
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold">Record research before trading</h3>
      <p className="my-2 text-xs text-muted">The timestamp and original plan are preserved. Record later changes as a new version or review. This journal does not place orders. For SPY / XLF / XLE research, start with a 2–5 trading-day holding plan.</p>
      <form onSubmit={plan} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Symbol<input name="symbol" required maxLength={24} placeholder="SPY" className={inputClass}/></label>
        <label className="text-xs">Decision<select name="decision" className={inputClass}><option value="TRADE">Trade candidate</option><option value="NO_TRADE">No trade</option></select></label>
        <label className="text-xs">Strategy and version<input name="strategyVersion" required maxLength={120} placeholder="Sector rotation v1" className={inputClass}/></label>
        <label className="text-xs">Expected hold (trading days)<input name="holdingDays" type="number" required min={1} max={252} defaultValue={3} className={inputClass}/></label>
        {[['hypothesis','Hypothesis / reason to abstain',4000],['entryConditions','Entry conditions',2000],['exitConditions','Exit conditions / invalidation',2000],['positionSizing','Position size and risk rule (or zero for no trade)',2000]].map(([name,label,max])=><label key={String(name)} className="text-xs">{label}<textarea name={String(name)} required maxLength={Number(max)} rows={3} className={inputClass}/></label>)}
        <button disabled={busy} className="rounded-lg bg-primary p-2 text-sm text-white disabled:opacity-50">Preserve original plan</button>
      </form>
    </section>
    {error&&<p role="alert" className="text-sm text-negative">{error}</p>}
    {data.entries.length===0&&<p className="text-sm text-muted">No research recorded yet.</p>}
    {data.entries.map(entry=><article key={entry.id} className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold">{entry.symbol} · {entry.decision==='NO_TRADE'?'No trade':'Trade candidate'} · {entry.strategy_version}</h3>
      <p className="text-xs text-muted">Original plan: {new Date(entry.created_at).toLocaleString()} · expected hold {entry.holding_days} trading days</p>
      <p className="whitespace-pre-wrap text-sm">{entry.hypothesis}</p>
      <dl className="space-y-2 text-sm">{[['Entry',entry.entry_conditions],['Exit',entry.exit_conditions],['Sizing',entry.position_sizing]].map(([k,v])=><div key={k}><dt className="text-muted">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>)}</dl>
      {entry.links.map(link=><p key={link.transaction_key} className="text-xs">Linked {link.ledger_snapshot.side} {link.ledger_snapshot.quantity} @ {formatCurrency(Number(link.ledger_snapshot.price))} · cash {formatCurrency(Number(link.ledger_snapshot.cash_delta))} · fee {formatCurrency(Number(link.ledger_snapshot.explicit_fee??0))} · {new Date(link.ledger_snapshot.created_at).toLocaleString()}</p>)}
      {entry.decision==='TRADE'&&<form className="flex gap-2" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;void save({action:'LINK',entryId:entry.id,transactionId:String(new FormData(f).get('transactionId'))});}}>
        <select name="transactionId" required aria-label={`Transaction for ${entry.symbol}`} className={inputClass}><option value="">Link a later matching transaction</option>{data.transactions.filter(t=>t.symbol===entry.symbol&&['BUY','SELL'].includes(t.side)&&Date.parse(t.created_at)>=Date.parse(entry.created_at)&&!data.entries.some(e=>e.links.some(l=>l.transaction_key===t.id))).map(t=><option key={t.id} value={t.id}>{t.side} {t.quantity} · {new Date(t.created_at).toLocaleString()}</option>)}</select>
        <button disabled={busy} className="rounded-lg border border-border px-3 text-sm">Link</button>
      </form>}
      {entry.reviews.map(r=><div key={r.id} className="border-l-2 border-primary pl-3"><p className="text-xs text-muted">Review {new Date(r.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap text-sm">{r.note}</p></div>)}
      <form onSubmit={e=>{e.preventDefault();const f=e.currentTarget;void save({action:'REVIEW',entryId:entry.id,note:String(new FormData(f).get('note'))},f);}} className="flex items-end gap-2">
        <label className="flex-1 text-xs">Later review / lessons<textarea name="note" required maxLength={4000} rows={2} className={inputClass}/></label><button disabled={busy} className="rounded-lg border border-border p-2 text-sm">Add review</button>
      </form>
    </article>)}
    <p className="text-xs text-muted">Simulation limits: provider quotes can be delayed; timestamps indicate observations, not executable bids/offers. Fills are full size with no liquidity, queue priority, partial fills, settlement, corporate actions, dividend credits, or guaranteed background timing. Research survives account resets; linked snapshots survive account deletion.</p>
  </div>;
}
