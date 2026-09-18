import Link from "next/link";
import { LoginForm } from "./forms";

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const query = await searchParams;
  return <section className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
    <h1 className="mb-3 text-3xl font-semibold">Sign in with Neon</h1>
    <p className="mb-7 text-slate-400">First visit? Set up your password using the email link below. Your database password is separate.</p>
    {query.password === "saved" && <p role="status" className="mb-5 text-teal-200">Password saved. Sign in with your new password.</p>}
    <LoginForm />
    <Link className="mt-6 inline-block text-teal-300 underline" href="/neon-preview/forgot">Set up / reset password</Link>
  </section>;
}
