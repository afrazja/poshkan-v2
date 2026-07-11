import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { TOOL_CALCS, TOOL_PAIRS } from "./tools-data";

export const revalidate = 3600;

export const metadata = {
  title: "Free Forex Calculators — Pip Value, Position Size, Margin & Profit",
  description:
    "Free forex and gold calculators with live rates: pip value, position size by risk percent, required margin by leverage, and trade profit in pips and USD. No sign-up needed.",
  alternates: { canonical: "https://www.poshkan.com/tools" },
  openGraph: {
    title: "Free Forex Calculators — Pip Value, Position Size, Margin & Profit",
    description:
      "Free forex and gold calculators with live rates: pip value, position size, margin and profit. No sign-up needed.",
    url: "https://www.poshkan.com/tools",
    siteName: "Poshkan",
    type: "website",
  },
};

export default function ToolsIndex() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Link href="/" className="text-sm text-muted hover:text-foreground hover:underline">
          ← Poshkan
        </Link>
        <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">Free forex calculators</h1>
        <p className="mb-10 max-w-2xl text-muted">
          The four numbers every trade needs — pip value, position size, margin and profit —
          calculated with live rates for the majors, the big crosses and gold. Free, instant, no
          sign-up.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOOL_CALCS.map((c) => (
            <Link
              key={c.slug}
              href={`/tools/${c.slug}`}
              className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
            >
              <h2 className="font-semibold">
                {c.icon} {c.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{c.short}</p>
            </Link>
          ))}
        </div>

        <h2 className="mb-3 mt-12 text-sm font-semibold text-muted">By pair</h2>
        <div className="space-y-4">
          {TOOL_CALCS.map((c) => (
            <div key={c.slug}>
              <h3 className="mb-2 text-sm font-medium">
                {c.icon} {c.name}
              </h3>
              <div className="flex flex-wrap gap-2">
                {TOOL_PAIRS.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/tools/${c.slug}/${p.slug}`}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-primary/50 hover:text-foreground"
                  >
                    {p.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="font-medium">
            Calculators tell you the size — a simulator shows you the outcome.
          </p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted">
            Poshkan is a free paper-trading platform with leveraged forex, live rates, stop-losses
            and real margin mechanics. Practice the trade you just sized — with 100% virtual money.
          </p>
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
