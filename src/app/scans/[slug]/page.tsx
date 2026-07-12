import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { createAdminClient } from "@/lib/supabase/admin";
import { SCANS, scanBySlug, SCAN_UNIVERSE, type ScanRow } from "../scans-data";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return SCANS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const scan = scanBySlug(slug);
  if (!scan) return {};
  const url = `https://www.poshkan.com/scans/${scan.slug}`;
  return {
    title: scan.metaTitle,
    description: scan.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: scan.metaTitle,
      description: scan.metaDescription,
      url,
      siteName: "Poshkan",
      type: "website",
    },
    twitter: { card: "summary_large_image", title: scan.metaTitle, description: scan.metaDescription },
  };
}

// Latest stored result for one scan; null = migration/cron hasn't run yet.
async function latestResult(slug: string): Promise<{ rows: ScanRow[]; date: string } | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("market_scans")
      .select("run_date, results")
      .eq("scan_slug", slug)
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return { rows: data.results as ScanRow[], date: data.run_date };
  } catch {
    return null;
  }
}

export default async function ScanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const scan = scanBySlug(slug);
  if (!scan) notFound();
  const result = await latestResult(scan.slug);
  const others = SCANS.filter((s) => s.slug !== scan.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: scan.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Poshkan", item: "https://www.poshkan.com" },
          { "@type": "ListItem", position: 2, name: "Daily scans", item: "https://www.poshkan.com/scans" },
          { "@type": "ListItem", position: 3, name: scan.name },
        ],
      },
      ...(result && result.rows.length
        ? [
            {
              "@type": "ItemList",
              name: `${scan.name} — ${result.date}`,
              numberOfItems: result.rows.length,
              itemListElement: result.rows.slice(0, 25).map((r, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: `${r.name} (${r.symbol})`,
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <nav className="text-sm text-muted">
          <Link href="/" className="hover:text-foreground hover:underline">Poshkan</Link>
          {" / "}
          <Link href="/scans" className="hover:text-foreground hover:underline">Daily scans</Link>
          {" / "}
          {scan.name}
        </nav>

        <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">
          {scan.icon} {scan.name}
        </h1>
        {result && (
          <p className="mb-4 text-sm font-medium text-primary">
            {result.rows.length} {result.rows.length === 1 ? "match" : "matches"} · updated {result.date} after the US close
          </p>
        )}

        <div className="space-y-4 text-sm leading-relaxed text-muted">
          {scan.intro.map((p) => (
            <p key={p.slice(0, 32)}>{p}</p>
          ))}
        </div>

        {/* Results table */}
        <div className="mt-8">
          {!result ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
              Today&apos;s results are being computed — check back after the US market close.
            </div>
          ) : result.rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
              No stocks in the 100-stock universe match this scan as of {result.date}. That happens —
              signals come in waves. Check back tomorrow, or browse the other scans below.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3 text-right">Close</th>
                    <th className="px-4 py-3 text-right">Day</th>
                    <th className="px-4 py-3 text-right">{scan.valueLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.symbol} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 text-muted">{i + 1}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold">{r.symbol}</td>
                      <td className="px-4 py-2.5">{r.name}</td>
                      <td className="px-4 py-2.5 text-right">${r.close.toFixed(2)}</td>
                      <td
                        className={`px-4 py-2.5 text-right ${r.changePct >= 0 ? "text-emerald-500" : "text-red-500"}`}
                      >
                        {r.changePct > 0 ? "+" : ""}
                        {r.changePct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{scan.valueFmt(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-semibold">Found a setup? Trade it with virtual money.</h2>
          <p className="mt-1 text-sm text-muted">
            A scan is a starting point, not a conclusion. Open a free Poshkan paper-trading
            account, place the trade with virtual cash, set a stop and a target, and find out how
            the signal really behaves — with zero risk.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Start paper trading — free
          </Link>
        </div>

        <div className="mt-10 space-y-4 text-sm leading-relaxed text-muted">
          <h2 className="text-lg font-bold text-foreground">How this scan works</h2>
          <ul className="list-disc space-y-2 pl-5">
            {scan.how.map((h) => (
              <li key={h.slice(0, 32)}>{h}</li>
            ))}
            <li>
              Recomputed once per trading day after the US close, from daily closing data across{" "}
              {SCAN_UNIVERSE.length} symbols.
            </li>
          </ul>

          <h2 className="pt-4 text-lg font-bold text-foreground">Frequently asked questions</h2>
          <dl className="space-y-4">
            {scan.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-1">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Cross-links */}
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">More daily scans</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((s) => (
              <Link
                key={s.slug}
                href={`/scans/${s.slug}`}
                className="rounded-xl border border-border bg-card p-3 text-sm transition hover:border-primary/50"
              >
                <span className="font-semibold">
                  {s.icon} {s.name}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Prefer a rules-based approach? Read the{" "}
            <Link href="/strategies" className="underline hover:text-foreground">
              trading strategy guides
            </Link>{" "}
            or size a position with the{" "}
            <Link href="/tools" className="underline hover:text-foreground">
              free calculators
            </Link>
            .
          </p>
        </div>

        <p className="mt-10 border-t border-border pt-4 text-xs text-muted">
          Computed from daily closing data for education and idea generation — nothing here is
          financial advice or a recommendation to buy or sell any security. Data may be delayed or
          inaccurate.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
