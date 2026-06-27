"use client";

import { useState } from "react";

// Guided 3-step banner shown right after the demo account is created (?onboard=1).
// Points the user straight at the SMC scanner's symbol picker + backtest button.
export default function ScannerOnboard() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">🚀 Your demo is ready — let&apos;s see the magic</h2>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-foreground">
          Dismiss
        </button>
      </div>
      <ol className="space-y-2.5">
        <Step
          done
          n={1}
          title="Demo account created & scanner switched on"
          hint="A funded crypto account is watching BTC, ETH & SOL with the Smart-Money-Concepts strategy."
        />
        <Step
          n={2}
          title="Pick your symbols"
          hint="In the SMC Scanner below, add or remove symbols under “Watch symbols.” We pre-picked the big three."
        />
        <Step
          n={3}
          title="Run a backtest to see the setups it flags"
          hint="Hit “Run backtest” in the SMC Scanner — you'll see the trades it would've caught on recent history, with a win rate and equity curve."
        />
      </ol>
    </div>
  );
}

function Step({ n, title, hint, done }: { n: number; title: string; hint: string; done?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          done ? "bg-positive text-white" : "border border-primary text-primary"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span>
        <span className={done ? "text-muted line-through" : "font-medium"}>{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </li>
  );
}
