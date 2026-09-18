import Link from "next/link";
import { ResetForm } from "../forms";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  return <section className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
    <h1 className="mb-7 text-3xl font-semibold">Choose your password</h1>
    {token && !query.error ? <ResetForm token={token} /> : <p role="alert">Open a fresh password setup link from your email to continue.</p>}
    <Link href="/neon-preview/forgot" className="mt-6 inline-block text-teal-300 underline">Request a new link</Link>
  </section>;
}
