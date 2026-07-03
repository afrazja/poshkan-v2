import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { STRATEGIES, strategyBySlug } from "../strategies-data";

export function generateStaticParams() {
  return STRATEGIES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = strategyBySlug(slug);
  if (!s) return {};
  return {
    title: s.seoTitle,
    description: s.seoDescription,
    alternates: { canonical: `https://www.poshkan.com/strategies/${s.slug}` },
    openGraph: {
      title: s.seoTitle,
      description: s.seoDescription,
      url: `https://www.poshkan.com/strategies/${s.slug}`,
      siteName: "Poshkan",
      type: "article",
    },
    twitter: { card: "summary_large_image", title: s.seoTitle, description: s.seoDescription },
  };
}

export default async function StrategyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = strategyBySlug(slug);
  if (!s) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: s.seoTitle,
        description: s.seoDescription,
        url: `https://www.poshkan.com/strategies/${s.slug}`,
        publisher: { "@type": "Organization", name: "Poshkan", url: "https://www.poshkan.com" },
      },
      // Mirrors the visible breadcrumb nav — helps Google map site hierarchy.
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Poshkan", item: "https://www.poshkan.com" },
          { "@type": "ListItem", position: 2, name: "Strategies", item: "https://www.poshkan.com/strategies" },
          { "@type": "ListItem", position: 3, name: s.name },
        ],
      },
    ],
  };

  const others = STRATEGIES.filter((o) => o.slug !== s.slug);

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <nav className="text-sm text-muted">
          <Link href="/" className="hover:text-foreground hover:underline">Poshkan</Link>
          {" / "}
          <Link href="/strategies" className="hover:text-foreground hover:underline">Strategies</Link>
        </nav>

        <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">
          {s.icon} {s.name}
        </h1>
        <p className="mb-8 text-lg text-muted">{s.hook}</p>

        <div className="space-y-4 text-sm leading-relaxed text-muted [&_strong]:text-foreground">
          {s.lead.map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          <h2 className="pt-4 text-lg font-bold text-foreground">How the strategy works</h2>
          <ol className="list-decimal space-y-2 pl-5">
            {s.how.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h2 className="pt-4 text-lg font-bold text-foreground">When it shines — and when it doesn&apos;t</h2>
          {s.shines.map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          <h2 className="pt-4 text-lg font-bold text-foreground">Key terms</h2>
          <dl className="space-y-2">
            {s.terms.map((t) => (
              <div key={t.term}>
                <dt className="font-semibold text-foreground">{t.term}</dt>
                <dd>{t.def}</dd>
              </div>
            ))}
          </dl>

          <h2 className="pt-4 text-lg font-bold text-foreground">How to judge it</h2>
          {s.judging.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-semibold">Watch this strategy trade — free, on virtual money</h2>
          <p className="mt-1 text-sm text-muted">
            Poshkan runs {s.shortName === "AI" ? "the AI Scanner" : `${s.name} as a live scanner`} on{" "}
            {s.markets}. Flip it on in alert mode, watch the signals land, backtest where it applies —
            and never risk a cent while you learn.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Create a free account
          </Link>
        </div>

        {/* Cross-links */}
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-muted">More strategies explained</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/strategies/${o.slug}`}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-primary/50 hover:text-foreground"
              >
                {o.icon} {o.name}
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-10 border-t border-border pt-4 text-xs text-muted">
          Educational content, not financial advice. Poshkan is a paper-trading simulator — all
          money, trades, and returns are 100% virtual.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
