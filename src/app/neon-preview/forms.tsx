"use client";

import { useActionState } from "react";
import { signIn, requestReset, resetPassword } from "./actions";

const input = "mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-3 text-white focus:outline-2 focus:outline-teal-400";
const button = "rounded-lg bg-teal-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {});
  return <form action={action} className="space-y-5">
    <label className="block">Email<input className={input} name="email" type="email" autoComplete="email" required /></label>
    <label className="block">App login password<input className={input} name="password" type="password" autoComplete="current-password" required /></label>
    {state.error && <p role="alert" className="text-rose-300">{state.error}</p>}
    <button className={button} disabled={pending}>{pending ? "Signing in…" : "Sign in to test portfolio"}</button>
  </form>;
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, {});
  return <form action={action} className="space-y-5">
    <label className="block">Your Poshkan email<input className={input} name="email" type="email" autoComplete="email" required /></label>
    {state.error && <p role="alert" className="text-rose-300">{state.error}</p>}
    {state.message && <p role="status" className="text-teal-200">{state.message}</p>}
    <button className={button} disabled={pending}>{pending ? "Requesting link…" : "Send password setup link"}</button>
  </form>;
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, {});
  return <form action={action} className="space-y-5">
    <input name="token" value={token} type="hidden" />
    <label className="block">New app login password<input className={input} name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
    <label className="block">Confirm password<input className={input} name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
    <p className="text-sm text-slate-400">Use at least 8 characters. This changes your Neon app login only.</p>
    {state.error && <p role="alert" className="text-rose-300">{state.error}</p>}
    <button className={button} disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
  </form>;
}
