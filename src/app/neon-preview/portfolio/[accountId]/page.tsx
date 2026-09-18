import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readPreviewAccount } from "@/lib/neon-preview/portfolio";
import { AccountDetails } from "../account-details";

function pageNumber(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d{0,6}$/.test(value)) return 1;
  const number = Number(value);
  return number <= 1_000_000 ? number : 1;
}

export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ transactions?: string | string[]; forex?: string | string[] }>;
}) {
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const transactionPage = pageNumber(query.transactions);
  const forexPage = pageNumber(query.forex);
  const result = await readPreviewAccount(accountId, transactionPage, forexPage);
  if (result.status === "signed-out") redirect("/neon-preview");
  if (result.status !== "ok") notFound();
  const lastTransactionPage = Math.max(1, Math.ceil(result.account.transactionCount / 50));
  const lastForexPage = Math.max(1, Math.ceil(result.account.forexCount / 50));
  if (transactionPage > lastTransactionPage || forexPage > lastForexPage) {
    redirect(`/neon-preview/portfolio/${accountId}?transactions=${Math.min(transactionPage, lastTransactionPage)}&forex=${Math.min(forexPage, lastForexPage)}`);
  }
  return <>
    <Link href="/neon-preview/portfolio" className="mb-6 inline-block text-teal-300 underline">← All portfolios</Link>
    <AccountDetails account={result.account} transactionPage={transactionPage} forexPage={forexPage} />
  </>;
}
