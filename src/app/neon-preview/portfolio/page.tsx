import { redirect } from "next/navigation";
import Link from "next/link";
import { readPreviewPortfolio } from "@/lib/neon-preview/portfolio";
import { signOut } from "../actions";

export default async function PortfolioPage() {
  const result = await readPreviewPortfolio();
  if (result.status === "signed-out") redirect("/neon-preview");
  return <>
    <div className="mb-8 flex items-center justify-between gap-4">
      <h1 className="text-3xl font-semibold">Your imported portfolios</h1>
      <form action={signOut}><button className="rounded-lg border border-white/20 px-4 py-2">Sign out</button></form>
    </div>
    {result.status === "forbidden" ? <p role="alert">This Neon account has no access to the local portfolio test.</p> : <>
      <p className="mb-7 text-slate-400">Read-only snapshot from September 18, 2026. Balances below are cash, not current portfolio valuations. Trading and live prices will be tested in the next migration stage.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {result.accounts.map(account => <article key={account.id} className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase text-teal-300">{account.type}</p>
          <h2 className="mt-2 text-xl font-semibold">{account.name}</h2>
          <p className="my-4 text-2xl">${Number(account.cashBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm text-slate-400">cash</span></p>
          <p className="text-slate-400">{account.holdings} holdings · {account.openForex} open forex positions · {account.transactions} ledger entries</p>
          <Link href={`/neon-preview/portfolio/${account.id}`} className="mt-5 inline-block text-teal-300 underline" aria-label={`View ${account.name} details and history`}>View details and history →</Link>
        </article>)}
      </div>
      {result.accounts.length === 0 && <p>No portfolios were found for your mapped account.</p>}
    </>}
  </>;
}
