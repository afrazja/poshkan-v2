"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OrderState, TradingAccount } from "@/lib/neon-preview/trade-input";
import { order, runOrderChecks } from "./actions";

const field = "mt-2 w-full rounded-lg border border-white/20 bg-slate-900 p-3 text-white";
const button = "rounded-lg border border-teal-300/40 px-4 py-3 text-teal-200 disabled:opacity-50";

export function OrderControls({accounts,state}: {accounts: TradingAccount[]; state: OrderState}) {
  const [accountId,setAccountId] = useState(accounts[0]?.id??"");
  const [operation,setOperation] = useState("PLACE_LIMIT");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [checking,setChecking] = useState(false);
  const [checkMessage,setCheckMessage] = useState("Ready for a manual check.");
  const request = useRef<string|null>(null);
  const saving = useRef(false);
  const running = useRef(false);
  const router = useRouter();
  const selected = accounts.find(a=>a.id===accountId);
  const placement = operation==="PLACE_LIMIT" || operation==="PLACE_ENTRY";

  const check = useCallback(async () => {
    if (running.current) return;
    running.current=true; setChecking(true);
    try {
      const response=await runOrderChecks();
      if (response.error) setCheckMessage(response.error);
      else if (response.result) {
        const r=response.result;
        setCheckMessage(`Checked at ${new Date().toLocaleTimeString()}: ${r.filled} filled · ${r.closed} closed · ${r.scaled} scaled exits · ${r.canceled} canceled · ${r.expired} expired · ${r.waiting} waiting · ${r.unavailable} without a current price · ${r.failed} failed.`);
        router.refresh();
      }
    } catch {setCheckMessage("Connection interrupted. Completed fills will not repeat on the next check.");}
    finally {running.current=false;setChecking(false);}
  },[router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const data=new FormData(event.currentTarget);
    const v=(key: string)=>String(data.get(key)??"").trim();
    const input: Record<string,unknown>={action:operation,accountId};
    if (placement) Object.assign(input,{symbol:v("symbol"),direction:v("direction"),quantity:v("quantity"),target:v("target"),expiryHours:v("expiry")==="24"?24:null});
    if (operation==="PLACE_ENTRY") Object.assign(input,{trigger:v("trigger"),leverage:Number(v("leverage")),stopLoss:v("stopLoss")||null,takeProfit:v("takeProfit")||null});
    if (!placement) input.positionId=v("positionId");
    if (operation==="SET_TIMER") input.minutes=Number(v("minutes"));
    if (operation==="SET_LEVELS") input.levels=[0,1,2].filter(n=>v(`price${n}`)||v(`units${n}`)).map(n=>({price:v(`price${n}`),units:v(`units${n}`)}));
    await save(input);
  }
  // Retain both payload and ID when retrying a failed request.
  // Expiry is calculated by the database on the first successful placement.
  const pending = useRef<{id:string;input:Record<string,unknown>}|null>(null);
  async function save(input: Record<string,unknown>) {
    if (saving.current) return;
    saving.current=true;setBusy(true);setMessage("");
    request.current??=crypto.randomUUID();
    pending.current??={id:request.current,input};
    try {
      const response=await order(pending.current.id,pending.current.input);
      if (response.error) setMessage(response.error);
      else {setMessage(`Test order ${response.result?.status??"saved"}.`);request.current=null;pending.current=null;router.refresh();}
    } catch {setMessage("Connection interrupted. Retry the unchanged form to reuse the same request.");}
    finally {saving.current=false;setBusy(false);}
  }
  return <section className="mt-10 space-y-6" aria-label="Pending orders and automatic exits">
    <h2 className="text-2xl font-semibold">Pending orders and automatic exits</h2>
    <p className="text-slate-400">Orders use your test accounts. Cash and holdings are checked when an order fills; they are not reserved. Stop losses use the observed market price, so a gap can close beyond the stop.</p>
    <div className="rounded-xl border border-teal-300/20 bg-teal-300/5 p-5">
      <p className="mb-4">Run one immediate check of pending orders and exits using current market prices.</p>
      <button type="button" className={button} disabled={checking} onClick={()=>void check()}>{checking?"Checking…":"Check now"}</button>
      <p role="status" className="mt-3 text-sm text-slate-300">{checkMessage}</p>
    </div>
    <form onSubmit={submit} onChange={()=>{request.current=null;pending.current=null;setMessage("");}} className="rounded-xl border border-white/10 bg-white/5 p-6">
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Configure test orders and exits</legend>
        <label>Test account<select className={field} value={accountId} onChange={e=>setAccountId(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}</select></label>
        <label>Order or exit<select className={field} value={operation} onChange={e=>setOperation(e.target.value)}><option value="PLACE_LIMIT">Limit buy / sell</option><option value="PLACE_ENTRY">Pending leveraged entry</option><option value="SET_TIMER">Timed close</option><option value="SET_LEVELS">Scaled take profits</option></select></label>
        {placement?<>
          <label>Symbol<input className={field} name="symbol" placeholder="AAPL, BTC-USD or EURUSD=X" maxLength={24} required /></label>
          <label>Direction<select key={operation} className={field} name="direction">{(operation==="PLACE_LIMIT"?["BUY","SELL"]:["LONG","SHORT"]).map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Quantity / units<input className={field} name="quantity" inputMode="decimal" required /></label>
          <label>Target price<input className={field} name="target" inputMode="decimal" required /></label>
          <label>Expires<select className={field} name="expiry"><option value="">Until canceled</option><option value="24">In 24 hours</option></select></label>
          {operation==="PLACE_ENTRY"&&<><label>Trigger<select className={field} name="trigger"><option value="AT_OR_BELOW">At or below target</option><option value="AT_OR_ABOVE">At or above target</option></select></label><label>Leverage<select className={field} name="leverage">{[1,2,5,10].map(n=><option key={n} value={n}>{n}×</option>)}</select></label><label>Stop loss (optional)<input className={field} name="stopLoss" inputMode="decimal" /></label><label>Take profit (optional)<input className={field} name="takeProfit" inputMode="decimal" /></label></>}
        </>:<label>Open position<select key={accountId} name="positionId" className={field} required defaultValue=""><option value="" disabled>Select a position</option>{selected?.forex.map(f=><option key={f.id} value={f.id}>{f.symbol} {f.direction} · {f.units} units</option>)}</select></label>}
        {operation==="SET_TIMER"&&<label>Minutes until close (0 clears timer)<input className={field} name="minutes" type="number" min="0" max="10080" step="1" required /></label>}
        {operation==="SET_LEVELS"&&<><p className="text-sm text-slate-400 sm:col-span-2">Replace pending take-profit levels. Leave all three blank to clear them. Each price must be on the profit side of the opening price; total units cannot exceed the open position. Adding levels clears its single take-profit target.</p>{[0,1,2].map(n=><div key={n} className="grid gap-4 sm:col-span-2 sm:grid-cols-2"><label>Level {n+1} price<input className={field} name={`price${n}`} inputMode="decimal" /></label><label>Level {n+1} units<input className={field} name={`units${n}`} inputMode="decimal" /></label></div>)}</>}
        <button className={button+" sm:col-span-2"} disabled={!accountId}>{busy?"Saving…":"Save test order / exit"}</button>
      </fieldset>
      {message&&<p role="status" className="mt-4 text-sm text-teal-200">{message}</p>}
    </form>
    <div className="space-y-3"><h3 className="text-lg font-semibold">Orders</h3>{state.orders.length===0&&<p className="text-slate-400">No orders yet.</p>}{state.orders.map(o=><article key={o.kind+o.id} className="rounded-xl border border-white/10 p-4"><p>{accounts.find(a=>a.id===o.accountId)?.name} · {o.symbol} · {o.direction} {o.quantity} · target {o.target}</p><p className="mt-1 text-sm text-slate-400">{o.status}{o.fillPrice?` · filled at ${o.fillPrice}`:""}{o.expires?` · expires ${new Date(o.expires).toUTCString()}`:""}{o.error?` · ${o.error}`:""}</p>{o.status==="pending"&&<button type="button" disabled={busy} className={button+" mt-3"} onClick={()=>{request.current=null;pending.current=null;void save({action:o.kind==="LIMIT"?"CANCEL_LIMIT":"CANCEL_ENTRY",accountId:o.accountId,orderId:o.id});}}>Cancel order</button>}</article>)}</div>
    {state.exits.filter(e=>e.at||e.levels.length).map(e=><article key={e.id} className="rounded-xl border border-white/10 p-4"><h3 className="font-semibold">{e.symbol} · scheduled exits</h3>{e.at&&<p className="mt-2 text-sm">Close at {new Date(e.at).toUTCString()} when a valid market price is available.</p>}<ul className="mt-2 text-sm">{e.levels.map(l=><li key={l.id}>{l.units} units at {l.price}</li>)}</ul></article>)}
  </section>;
}
