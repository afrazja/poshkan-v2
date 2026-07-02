import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { TERMS } from "./terms-data";

export const metadata = {
  title: "Trading Terms Explained — Pips, Leverage, Stop-Losses & More",
  description:
    "A plain-English glossary of trading terms: pips, leverage and margin, stop-losses, ATR, ADX, fair value gaps, liquidity sweeps, and more — each with examples and a place to practice free.",
  alternates: { canonical: "https://www.poshkan.com/learn" },
};

export default function LearnIndex() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Link href="/" className="text-sm text-muted hover:text-foreground hover:underline">
          ← Poshkan
        </Link>
        <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">Trading terms, explained</h1>
        <p className="mb-10 max-w-2xl text-muted">
          Every term below in plain English, with real examples — no jargon defining jargon. And
          because reading only gets you so far, each one links to a place you can practice it with
          100% virtual money.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TERMS.map((t) => (
            <Link
              key={t.slug}
              href={`/learn/${t.slug}`}
              className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
            >
              <h2 className="font-semibold">{t.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{t.definition}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="font-medium">The fastest way to learn a term is to trade it — risk-free.</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Create a free account
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
