import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { STRATEGIES } from "./strategies-data";

export const metadata = {
  title: "Trading Strategies Explained — SMC, OTE, Breakouts, Mean Reversion & More",
  description:
    "Plain-English explainers for six real trading strategies — Smart Money Concepts, Optimal Trade Entry, trend breakouts, mean reversion, range trading, and AI trading — each one runnable free on virtual money.",
  alternates: { canonical: "https://www.poshkan.com/strategies" },
};

export default function StrategiesIndex() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Link href="/" className="text-sm text-muted hover:text-foreground hover:underline">
          ← Poshkan
        </Link>
        <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">Trading strategies, explained</h1>
        <p className="mb-10 max-w-2xl text-muted">
          Every strategy below is explained in plain English — and every one of them runs as a live
          scanner on Poshkan, so you can watch it find setups and place virtual trades instead of
          taking anyone&apos;s word for it.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STRATEGIES.map((s) => (
            <Link
              key={s.slug}
              href={`/strategies/${s.slug}`}
              className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50"
            >
              <div className="text-2xl">{s.icon}</div>
              <h2 className="mt-2 font-semibold">{s.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.hook}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="font-medium">Reading is one thing. Watching a strategy trade is another.</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Try them free — 100% virtual money
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
