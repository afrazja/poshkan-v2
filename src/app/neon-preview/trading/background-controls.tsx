"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkerState } from "@/lib/neon-preview/worker-state";
import { backgroundStatus, setBackground } from "./actions";

export function BackgroundControls({initial}: {initial: WorkerState}) {
  const cloud=process.env.NEXT_PUBLIC_POSHKAN_DATABASE_MODE==='neon';
  const [state,setState]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const changing=useRef(false);
  const lastCheck=useRef(initial.lastCheck);
  const router=useRouter();
  useEffect(()=>{
    let active=true, polling=false;
    const timer=setInterval(async()=>{
      if(polling||changing.current) return;
      polling=true;
      try {
        const response=await backgroundStatus();
        if(!active||changing.current) return;
        if(response.state) {
          setState(response.state);
          if(response.state.lastCheck!==lastCheck.current) {lastCheck.current=response.state.lastCheck;router.refresh();}
        } else setMessage(response.error??"Background status unavailable.");
      } catch {if(active) setMessage("Could not refresh background status. Check your connection.");}
      finally {polling=false;}
    },10000);
    return ()=>{active=false;clearInterval(timer);};
  },[router]);
  async function change() {
    if(changing.current) return;
    changing.current=true;setBusy(true);setMessage("");
    try {
      const response=await setBackground(!state.enabled);
      if(response.state) {setState(response.state);setMessage(response.state.enabled?(cloud?"Background checks resume on the next scheduled run.":"Background checks will start within 30 seconds. You can close this page."):"Background execution is stopped.");router.refresh();}
      else setMessage(response.error??"The setting could not be changed.");
    } catch {setMessage("Connection interrupted. Refresh the page to confirm the current setting.");}
    finally {changing.current=false;setBusy(false);}
  }
  return <section className="mt-10 rounded-xl border border-teal-300/30 bg-teal-300/5 p-6" aria-label="Background order checks">
    <h2 className="text-2xl font-semibold">Background order checks</h2>
    <p className="mt-3 text-slate-300">{cloud?'Scheduled checks run on the server while your browser is closed. The status below shows whether the service has contacted the app recently.':'Checks continue after you close this page while this PC is awake and connected. This is the local Neon test; your live Poshkan app is unchanged.'}</p>
    <p className="mt-3 font-medium">{state.enabled?(state.online?"Running in the background":"Enabled, but the background process is offline"):"Order execution is stopped"}</p>
    <p className="mt-1 text-sm text-slate-400">Background process: {state.online?"connected":"offline"}. {state.lastSeen?`Last contact: ${new Date(state.lastSeen).toUTCString()}.`:"Waiting for its first connection."}</p>
    <button type="button" onClick={()=>void change()} disabled={busy||(!state.online&&!state.enabled)} className="mt-5 rounded-lg border border-teal-300/40 px-5 py-3 text-teal-200 disabled:opacity-50">{busy?"Updating…":state.enabled?"Stop background checks":"Start background checks"}</button>
    <p className="mt-3 text-sm text-slate-400">When you stop, an active fill may finish before the app confirms it has stopped. Check now below remains available for a single manual pass.</p>
    {state.lastCheck&&<p className="mt-4 text-sm">Last completed check: {new Date(state.lastCheck).toUTCString()}</p>}
    {state.summary&&<p className="mt-2 text-sm text-slate-300">{state.summary.filled??0} orders filled · {state.summary.closed??0} positions closed · {state.summary.scaled??0} partial exits · {state.summary.unavailable??0} awaiting prices · {state.summary.failed??0} failed</p>}
    {message&&<p role="status" className="mt-4 text-sm text-teal-200">{message}</p>}
  </section>;
}
