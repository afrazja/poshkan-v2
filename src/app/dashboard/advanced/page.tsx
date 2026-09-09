import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";

export const metadata = { title: "Advanced tools · Poshkan" };

export default function AdvancedPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold tracking-tight">Advanced tools</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        When you are comfortable researching a company and reviewing your paper trades,
        explore how to turn a market idea into rules you can test.
      </p>
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="advanced-lab-title">
        <FlaskConical size={24} className="mb-3 text-primary" aria-hidden />
        <h2 id="advanced-lab-title" className="text-lg font-semibold">Strategy Lab</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Build entry and exit rules, backtest them against historical candles, and observe
          live paper alerts. Start with a guided example or create your own experiment.
          The AI Scanner and your existing strategies are available here too.
        </p>
        <Link href="/dashboard/scanners" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Open Strategy Lab <ArrowRight size={16} aria-hidden />
        </Link>
      </section>
      <p className="mt-5 text-sm text-muted">
        Working on the basics? <Link href="/dashboard" className="font-medium text-primary hover:underline">Return to your accounts and beginner checklist →</Link>
      </p>
    </div>
  );
}
