import Link from "next/link";
import type { PreviewAccountDetail } from "@/lib/neon-preview/portfolio";

// Preserve decimal text from PostgreSQL, including small fractional holdings.
function decimal(value: string | null, money = false) {
  if (value === null) return "—";
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const digits = money ? trimmed.padEnd(2, "0") : trimmed;
  return `${negative ? "−" : ""}${money ? "$" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${digits ? "." + digits : ""}`;
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) : "—";
}

const cell = "whitespace-nowrap border-t border-white/10 px-4 py-3 text-left text-sm";
const header = "whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400";

function Pages({ accountId, kind, current, count, transactionPage, forexPage }: {
  accountId: string; kind: "transactions" | "forex"; current: number; count: number; transactionPage: number; forexPage: number;
}) {
  const pages = Math.max(1, Math.ceil(count / 50));
  const href = (page: number) => `/neon-preview/portfolio/${accountId}?transactions=${kind === "transactions" ? page : transactionPage}&forex=${kind === "forex" ? page : forexPage}#${kind}`;
  return <nav aria-label={`${kind === "forex" ? "Forex" : "Transaction"} history pages`} className="mt-4 flex flex-wrap items-center gap-5 text-sm">
    <span className="text-slate-400">{count} entries · Page {current} of {pages}</span>
    {current > 1 && <Link className="text-teal-300 underline" href={href(current - 1)}>Previous</Link>}
    {current < pages && <Link className="text-teal-300 underline" href={href(current + 1)}>Next</Link>}
  </nav>;
}

export function AccountDetails({ account, transactionPage, forexPage }: { account: PreviewAccountDetail; transactionPage: number; forexPage: number }) {
  return <div className="space-y-9">
    <header>
      <p className="mb-2 text-sm uppercase text-teal-300">{account.type}</p>
      <h1 className="text-3xl font-semibold">{account.name}</h1>
      <p className="my-4 text-2xl">{decimal(account.cashBalance, true)} <span className="text-base text-slate-400">cash</span></p>
      <p className="text-sm leading-6 text-slate-400">Read-only snapshot from September 18, 2026. Cost basis is the acquisition cost, not current market value. Dates are shown in UTC. Live prices and trading are not enabled yet.</p>
    </header>
    <section aria-labelledby="holdings-title">
      <h2 id="holdings-title" className="mb-4 text-xl font-semibold">Holdings <span className="text-slate-400">({account.holdings.length})</span></h2>
      {account.holdings.length === 0 ? <p className="text-slate-400">No stock or crypto holdings in this snapshot.</p> : <div role="region" aria-label="Holdings table" tabIndex={0} className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full"><thead className="bg-white/5"><tr>{["Symbol", "Quantity", "Average cost", "Cost basis"].map(h => <th scope="col" className={header} key={h}>{h}</th>)}</tr></thead>
          <tbody>{account.holdings.map(p => <tr key={p.id}><th scope="row" className={cell}>{p.symbol}</th><td className={cell}>{decimal(p.quantity)}</td><td className={cell}>{decimal(p.averageCost, true)}</td><td className={cell}>{decimal(p.costBasis, true)}</td></tr>)}</tbody>
        </table>
      </div>}
    </section>
    <section id="transactions" aria-labelledby="transactions-title">
      <h2 id="transactions-title" className="mb-4 text-xl font-semibold">Transaction history</h2>
      {account.transactions.length === 0 ? <p className="text-slate-400">No transactions in this snapshot.</p> : <div role="region" aria-label="Transaction history table" tabIndex={0} className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full"><thead className="bg-white/5"><tr>{["Date (UTC)", "Action", "Symbol", "Quantity", "Price", "Cash change"].map(h => <th scope="col" className={header} key={h}>{h}</th>)}</tr></thead>
          <tbody>{account.transactions.map(t => <tr key={t.id}><td className={cell}>{date(t.createdAt)}</td><td className={cell}>{t.side.replaceAll("_", " ")}</td><td className={cell}>{t.symbol || "—"}</td><td className={cell}>{decimal(t.quantity)}</td><td className={cell}>{decimal(t.price, true)}</td><td className={`${cell} ${t.cashDelta.startsWith("-") ? "text-rose-300" : "text-teal-200"}`}>{decimal(t.cashDelta, true)}</td></tr>)}</tbody>
        </table>
      </div>}
      <Pages accountId={account.id} kind="transactions" current={transactionPage} count={account.transactionCount} transactionPage={transactionPage} forexPage={forexPage} />
    </section>
    <section id="forex" aria-labelledby="forex-title">
      <h2 id="forex-title" className="mb-4 text-xl font-semibold">Forex positions and history</h2>
      {account.forex.length === 0 ? <p className="text-slate-400">No forex positions in this snapshot.</p> : <div role="region" aria-label="Forex history table" tabIndex={0} className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full"><thead className="bg-white/5"><tr>{["Opened (UTC)", "Symbol", "Direction", "Status", "Units", "Open rate", "Margin", "Stop loss", "Take profit", "Closed (UTC)", "Close rate", "Realized P&L"].map(h => <th scope="col" className={header} key={h}>{h}</th>)}</tr></thead>
          <tbody>{account.forex.map(f => <tr key={f.id}><td className={cell}>{date(f.openedAt)}</td><th scope="row" className={cell}>{f.symbol}</th><td className={cell}>{f.direction}</td><td className={cell}>{f.status}</td><td className={cell}>{decimal(f.units)}</td><td className={cell}>{decimal(f.openRate)}</td><td className={cell}>{decimal(f.margin, true)}</td><td className={cell}>{decimal(f.stopLoss)}</td><td className={cell}>{decimal(f.takeProfit)}</td><td className={cell}>{date(f.closedAt)}</td><td className={cell}>{decimal(f.closeRate)}</td><td className={cell}>{decimal(f.pnl, true)}</td></tr>)}</tbody>
        </table>
      </div>}
      <Pages accountId={account.id} kind="forex" current={forexPage} count={account.forexCount} transactionPage={transactionPage} forexPage={forexPage} />
    </section>
  </div>;
}
