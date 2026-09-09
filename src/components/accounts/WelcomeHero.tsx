"use client";

import { useState } from "react";
import Link from "next/link";
import CreateAccountModal from "./CreateAccountModal";

// The first visit follows the same research → practice → review path as the
// checklist. The existing account form defaults to stocks and virtual cash.
export default function WelcomeHero() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <section className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8" aria-labelledby="welcome-title">
        <span className="text-xs font-semibold text-primary">Welcome to Poshkan</span>
        <h2 id="welcome-title" className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Understand your first investment decision
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Start with a company you know. Learn what it earns and how its price has behaved,
          practice with virtual money, then reflect on your decision.
        </p>
        <ol className="mt-5 space-y-3 text-sm">
          <li><strong>1. Research a company.</strong> Read its Before you buy panel.</li>
          <li><strong>2. Make a paper trade.</strong> Decide why you would own it before buying.</li>
          <li><strong>3. Review your decision.</strong> Revisit it in History and consider what changed.</li>
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Create a paper account
          </button>
          <Link href="/symbol/AAPL" className="text-sm font-medium text-primary hover:underline">
            Read a company example first →
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted">All money and trades are virtual.</p>
      </section>
      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
