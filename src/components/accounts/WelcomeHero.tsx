"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDemoAccountAction } from "@/app/dashboard/actions";

// First-run hero for users with zero accounts — one tap spins up a funded demo
// with a scanner already on, then drops them into the guided scanner flow.
export default function WelcomeHero() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createDemo() {
    setLoading(true);
    setErr(null);
    try {
      const res = await createDemoAccountAction();
      if (res.error) {
        setErr(res.error);
        return;
      }
      router.push("/dashboard/scanners?onboard=1");
    } catch (e) {
      setErr(`Couldn't set up the demo: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6 sm:p-8">
      <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
        ✦ Welcome to Poshkan
      </span>
      <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">See the magic in 60 seconds</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">
        We&apos;ll spin up a funded demo crypto account with a strategy scanner already switched on —
        then you run a one-tap backtest and watch it surface real setups from recent market history.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm">
        <li className="flex items-center gap-2">
          <Num n={1} /> A funded demo account, pre-seeded
        </li>
        <li className="flex items-center gap-2">
          <Num n={2} /> A scanner watching BTC, ETH &amp; SOL
        </li>
        <li className="flex items-center gap-2">
          <Num n={3} /> One tap to backtest &amp; see the setups
        </li>
      </ul>
      {err && <p className="mt-3 text-sm text-negative">{err}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={createDemo}
          disabled={loading}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Setting up…" : "✨ Create my demo account"}
        </button>
        <span className="text-xs text-muted">…or scroll down to build your own ↓</span>
      </div>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
      {n}
    </span>
  );
}
