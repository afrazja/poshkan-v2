import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { TERMS, termBySlug } from "../terms-data";

export function generateStaticParams() {
  return TERMS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = termBySlug(slug);
  if (!t) return {};
  return {
    title: t.seoTitle,
    description: t.seoDescription,
    alternates: { canonical: `https://www.poshkan.com/learn/${t.slug}` },
    openGraph: {
      title: t.seoTitle,
      description: t.seoDescription,
      url: `https://www.poshkan.com/learn/${t.slug}`,
      siteName: "Poshkan",
      type: "article",
    },
    twitter: { card: "summary_large_image", title: t.seoTitle, description: t.seoDescription },
  };
}

export default async function TermPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = termBySlug(slug);
  if (!t) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: t.title.replace(/^What (is|are|does|'s the difference between) /i, "").replace(/\?$/, ""),
    description: t.definition,
    url: `https://www.poshkan.com/learn/${t.slug}`,
    inDefinedTermSet: { "@type": "DefinedTermSet", name: "Poshkan Trading Glossary", url: "https://www.poshkan.com/learn" },
  };

  const related = t.related.map(termBySlug).filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <nav className="text-sm text-muted">
          <Link href="/" className="hover:text-foreground hover:underline">Poshkan</Link>
          {" / "}
          <Link href="/learn" className="hover:text-foreground hover:underline">Learn</Link>
        </nav>

        <h1 className="mb-6 mt-4 text-3xl font-bold tracking-tight">{t.title}</h1>

        {/* Direct, snippet-friendly answer first */}
        <p className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm font-medium leading-relaxed">
          {t.definition}
        </p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted [&_strong]:text-foreground">
          {t.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {t.strategies && t.strategies.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-semibold">See it in a real strategy</h2>
            <ul className="space-y-1 text-sm">
              {t.strategies.map((s) => (
                <li key={s.slug}>
                  <Link href={`/strategies/${s.slug}`} className="text-primary hover:underline">
                    {s.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-semibold">Learn it by doing — on virtual money</h2>
          <p className="mt-1 text-sm text-muted">
            Poshkan is a free paper-trading simulator for stocks, crypto, and forex. Every trade,
            every stop-loss, every pip is 100% virtual — so mistakes cost nothing while the lessons
            stick.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Create a free account
          </Link>
        </div>

        {related.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-sm font-semibold text-muted">Related terms</h2>
            <div className="flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r!.slug}
                  href={`/learn/${r!.slug}`}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-primary/50 hover:text-foreground"
                >
                  {r!.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 border-t border-border pt-4 text-xs text-muted">
          Educational content, not financial advice. Poshkan is a paper-trading simulator — all
          money, trades, and returns are 100% virtual.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
