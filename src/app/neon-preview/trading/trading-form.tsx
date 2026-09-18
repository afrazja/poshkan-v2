"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TradingAccount } from "@/lib/neon-preview/trade-input";
import { trade } from "./actions";

const field = "mt-2 w-full rounded-lg border border-white/20 bg-slate-900 p-3 text-white";
export function TradingForm({ accounts }: { accounts: TradingAccount[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [action, setAction] = useState("SPOT");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const positions = accounts.find(a => a.id === accountId)?.forex ?? [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const input: Record<string, unknown> = { action, accountId };
    if (action === "SPOT") Object.assign(input, { symbol: value("symbol"), side: value("side"), quantity: value("quantity") });
    if (action === "OPEN_FX") Object.assign(input, { symbol: value("symbol"), direction: value("direction"), units: value("units"), leverage: Number(value("leverage")) });
    if (action === "CLOSE_FX" || action === "PROTECT_FX") input.positionId = value("positionId");
    if (action === "CLOSE_FX" && value("units")) input.units = value("units");
    if (action === "OPEN_FX" || action === "PROTECT_FX") Object.assign(input, { stopLoss: value("stopLoss") || null, takeProfit: value("takeProfit") || null });
    request.current ??= crypto.randomUUID();
    try {
      const response = await trade(request.current, input);
      if (response.error) setMessage(response.error);
      else { setMessage(`Test trade completed.${response.result?.price ? ` Price: ${response.result.price}.` : ""}${response.result?.pnl ? ` Realized P&L: $${response.result.pnl}.` : ""}`); request.current = null; router.refresh(); }
    } catch { setMessage("Connection interrupted. Retry without changing the form to reuse the same request ID."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} onChange={() => { request.current = null; setMessage(""); }} className="rounded-xl border border-white/10 bg-white/5 p-6">
    <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
      <legend className="sr-only">Place a trade in copied test accounts</legend>
      <label>Test account<select className={field} value={accountId} onChange={e => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}</select></label>
      <label>Operation<select className={field} value={action} onChange={e => setAction(e.target.value)}><option value="SPOT">Buy / sell holdings</option><option value="OPEN_FX">Open leveraged position</option><option value="CLOSE_FX">Close position (full or partial)</option><option value="PROTECT_FX">Set stop loss / take profit</option></select></label>
      {(action === "SPOT" || action === "OPEN_FX") && <label>Symbol<input className={field} name="symbol" placeholder="AAPL, BTC-USD or EURUSD=X" maxLength={24} required /></label>}
      {action === "SPOT" && <><label>Side<select className={field} name="side"><option>BUY</option><option>SELL</option></select></label><label>Quantity<input className={field} name="quantity" inputMode="decimal" required /></label></>}
      {action === "OPEN_FX" && <><label>Direction<select className={field} name="direction"><option>LONG</option><option>SHORT</option></select></label><label>Units<input className={field} name="units" inputMode="decimal" required /></label><label>Leverage<select className={field} name="leverage">{[1,2,5,10].map(n => <option key={n} value={n}>{n}×</option>)}</select></label></>}
      {(action === "CLOSE_FX" || action === "PROTECT_FX") && <label>Open position<select key={accountId} className={field} name="positionId" required defaultValue=""><option value="" disabled>Select a position</option>{positions.map(p => <option key={p.id} value={p.id}>{p.symbol} {p.direction} · {p.units} units</option>)}</select></label>}
      {action === "CLOSE_FX" && <label>Units to close (blank = all)<input className={field} name="units" inputMode="decimal" /></label>}
      {(action === "OPEN_FX" || action === "PROTECT_FX") && <><label>Stop loss (optional)<input className={field} name="stopLoss" inputMode="decimal" /></label><label>Take profit (optional)<input className={field} name="takeProfit" inputMode="decimal" /></label></>}
      <button className="rounded-lg bg-teal-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50 sm:col-span-2" disabled={!accountId}>{busy ? "Checking price and executing…" : "Execute test trade"}</button>
    </fieldset>
    {message && <p className="mt-5 text-sm text-teal-200" role="status">{message}</p>}
  </form>;
}
