import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import OwnerView from "@/components/account/OwnerView";
import { getSymbolReport, reportHasContent, reportSummary } from "@/lib/symbol-report";
import { getQuote } from "@/lib/marketdata";
import { isCryptoSymbol } from "@/lib/assets";
import { formatCurrency, formatPercent, changeColor } from "@/lib/format";

// The Owner's View, in public. Everything the app shows before you buy —
// where the price sits in its own history, how far it has fallen and whether it
// came back, what the business earns, whether a coin is really a separate bet
// from Bitcoin — rendered on the server so a search engine and a logged-out
// reader see the same page a member does.
//
// This is the front door. People already search "has NVDA ever dropped 30%"
// and "is ethereum correlated with bitcoin"; every other site answers the price
// half and stops. The paper account is what we offer after the answer has
// proved useful, not the toll gate in front of it.
//
// The /api/fundamentals endpoint stays behind auth: one rendered page at a time
// is a reader, a JSON endpoint is a scraper.

// Fundamentals move quarterly and drawdown history daily; an hour is generous
// and makes the cost one upstream call per symbol per hour however many people
// arrive.
export const revalidate = 3600;

function clean(raw: string): string {
  return decodeURIComponent(raw).trim().toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const symbol = clean((await params).symbol);
  const report = await getSymbolReport(symbol).catch(() => null);
  if (!report || !reportHasContent(report)) {
    return { title: `${symbol} — Poshkan`, robots: { index: false, follow: false } };
  }

  const name = report.fundamentals?.name ?? symbol;
  const d = report.priceContext?.drawdowns;
  // Lead the title with the question the page actually answers, not the ticker
  // alone — that is what makes a search result worth clicking.
  const title =
    d && d.count > 0 && d.maxDepthPct != null
      ? `${symbol} — how far it falls, and how often it comes back`
      : `${symbol} — price history and what the numbers mean`;
  const description = reportSummary(symbol, report);

  return {
    title,
    description,
    alternates: { canonical: `https://www.poshkan.com/symbol/${symbol}` },
    openGraph: {
      title: `${name} (${symbol})`,
      description,
      url: `https://www.poshkan.com/symbol/${symbol}`,
      type: "article",
    },
    twitter: { card: "summary_large_image", title: `${name} (${symbol})`, description },
  };
}

export default async function SymbolPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = clean((await params).symbol);
  if (!/^[A-Z0-9.\-=^]{1,15}$/.test(symbol)) notFound();

  const [report, quote] = await Promise.all([
    getSymbolReport(symbol).catch(() => null),
    getQuote(symbol).catch(() => null),
  ]);
  if (!report || !reportHasContent(report)) notFound();

  const name = report.fundamentals?.name ?? symbol;
  const isCrypto = isCryptoSymbol(symbol);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <nav className="mb-6 text-sm">
        <Link href="/" className="text-muted hover:text-foreground hover:underline">
          Poshkan
        </Link>
        <span className="mx-2 text-muted">/</span>
        <span className="text-foreground">{symbol}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
          <p className="mt-1 text-sm text-muted">
            {symbol} · {isCrypto ? "Cryptocurrency" : report.fundamentals?.profile?.sector ?? "US listed"}
          </p>
        </div>
        {quote && (
          <div className="text-right">
            <div className="text-2xl font-bold">{formatCurrency(quote.price)}</div>
            <div className={`text-sm font-medium ${changeColor(quote.percentChange)}`}>
              {formatPercent(quote.percentChange)} today
            </div>
          </div>
        )}
      </header>

      <p className="mt-4 text-sm leading-relaxed text-muted">
        What a holder would want to know before buying {symbol}: where the price sits in its own history,
        how far it has fallen before and whether it recovered, and what
        {isCrypto ? " the coin is really a bet on" : " the business behind it earns"}. All of it is
        arithmetic over free market data — no opinions, no recommendations.
      </p>

      {/* The same cards the app shows, rendered here on the server. */}
      <OwnerView symbol={symbol} initial={report} />

      <section className="mt-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Now try it without risking anything</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Poshkan is paper trading: real prices, virtual money. Buy {symbol} with $10,000 that isn&rsquo;t
          real, set a stop before you enter, and find out what your idea would actually have done.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Start paper trading — free
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-background"
          >
            How it works
          </Link>
        </div>
      </section>

      <p className="mt-6 text-xs text-muted">
        Data from Yahoo Finance, refreshed hourly. Nothing here is financial advice. Poshkan is a
        paper-trading simulator — all money, trades and returns are virtual.
      </p>
    </div>
  );
}
