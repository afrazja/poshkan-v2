import Link from "next/link";
import { ForgotForm } from "../forms";

export default function ForgotPage() {
  return <section className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
    <h1 className="mb-3 text-3xl font-semibold">Set up your login password</h1>
    <p className="mb-7 text-slate-400">Enter the email used for your Neon account. The email link lets you choose your password privately.</p>
    <ForgotForm />
    <Link href="/neon-preview" className="mt-6 inline-block text-teal-300 underline">Back to sign in</Link>
  </section>;
}
