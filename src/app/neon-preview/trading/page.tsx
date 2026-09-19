import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { previewAuth } from "@/lib/neon-preview/auth";
import { readTradingAccounts } from "@/lib/neon-preview/trading";
import { TradingForm } from "./trading-form";
import { readOrders } from "@/lib/neon-preview/orders";
import { OrderControls } from "./order-controls";

export default async function TradingPage() {
  if (process.env.NEON_TRADING_PREVIEW !== "1") notFound();
  const { data } = await previewAuth().getSession({ query: { disableCookieCache: true } });
  if (!data?.user) redirect("/neon-preview");
  const accounts = await readTradingAccounts();
  const orders = await readOrders();
  return <>
    <Link href="/neon-preview/portfolio" className="text-teal-300 underline">← Imported portfolios</Link>
    <h1 className="mt-6 text-3xl font-semibold">Trading test</h1>
    <p className="mb-8 mt-3 text-slate-400">These are separate copies of your accounts. Test trades change only these copies; your live app and imported snapshot stay unchanged. Execution prices come from the market feed.</p>
    <TradingForm accounts={accounts} />
    <section className="mt-10 space-y-4" aria-label="Test account balances">
      <h2 className="text-xl font-semibold">Test balances and open positions</h2>
      {accounts.map(a => <article key={a.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-semibold">{a.name} · {a.type}</h3><p className="mt-2">${a.cash} cash</p>
        <details className="mt-3 text-sm text-slate-300"><summary className="cursor-pointer">Holdings ({a.holdings.length})</summary><ul className="mt-2 space-y-1">{a.holdings.map(p => <li key={p.id}>{p.symbol} · {p.quantity} units</li>)}</ul></details>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">{a.forex.map(f => <li key={f.id}>{f.symbol} · {f.direction} · {f.units} units · ${f.margin} margin · SL {f.stopLoss ?? "—"} / TP {f.takeProfit ?? "—"}</li>)}</ul>
      </article>)}
    </section>
    {orders && <OrderControls accounts={accounts} state={orders} />}
  </>;
}
