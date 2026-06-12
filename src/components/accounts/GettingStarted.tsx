"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface StartChecks {
  hasAccount: boolean;
  hasTrade: boolean;
  hasJournal: boolean;
  hasAlert: boolean;
  hasAiReview: boolean;
}

const DISMISS_KEY = "poshkan-getting-started-dismissed";

// Self-checking onboarding checklist: every step flips to ✓ from real data,
// so it guides without nagging — and disappears once the journey is complete.
export default function GettingStarted({ checks }: { checks: StartChecks }) {
  const [dismissed, setDismissed] = useState(true); // assume hidden until we read storage

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const steps: { done: boolean; title: string; hint: React.ReactNode }[] = [
    {
      done: checks.hasAccount,
      title: "Create a trading account",
      hint: <>Tap the <strong>+ New account</strong> card below — pick stocks, crypto, or forex and fund it with virtual cash.</>,
    },
    {
      done: checks.hasTrade,
      title: "Place your first trade",
      hint: <>Open your account, search a stock (try <strong>AAPL</strong>), and hit <strong>Buy</strong>.</>,
    },
    {
      done: checks.hasJournal,
      title: "Journal a trade reason",
      hint: <>On the order review screen, fill the <strong>📓 Why this trade?</strong> box — one honest line.</>,
    },
    {
      done: checks.hasAlert,
      title: "Set a price alert",
      hint: <>Open any stock and tap <strong>🔔 Set alert</strong> — we&apos;ll email and push you when it hits.</>,
    },
    {
      done: checks.hasAiReview,
      title: "Get your AI coaching review",
      hint: <>Once you&apos;ve journaled a few trades, visit <Link href="/dashboard/journal" className="font-semibold text-primary hover:underline">📓 Journal</Link> and hit <strong>AI review</strong>.</>,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) return null;

  return (
    <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          🚀 Getting started <span className="ml-1 text-muted">{doneCount}/{steps.length}</span>
        </h2>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="text-xs text-muted hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      {/* progress bar */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.title} className="flex items-start gap-3 text-sm">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                s.done ? "bg-positive text-white" : "border border-border text-muted"
              }`}
            >
              {s.done ? "✓" : ""}
            </span>
            <span>
              <span className={s.done ? "text-muted line-through" : "font-medium"}>{s.title}</span>
              {!s.done && <span className="block text-xs text-muted">{s.hint}</span>}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-muted">
        Stuck on a term?{" "}
        <Link href="/help" className="font-medium text-primary hover:underline">
          Read the quick guide →
        </Link>
      </p>
    </div>
  );
}
