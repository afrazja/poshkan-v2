import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { createAdminClient } from "@/lib/supabase/admin";
import { SCANS, type ScanRow } from "./scans-data";

export const revalidate = 3600;

const PAGE_URL = "https://www.poshkan.com/scans";

export const metadata = {
  title: "Free Daily Stock Scans — Golden Cross, RSI, 52-Week Highs",
  description:
    "Free daily technical scans of 100 US large caps, updated after every close: golden and death crosses, 200-day MA crossings, RSI oversold/overbought, and 52-week highs.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Free Daily Stock Scans — Golden Cross, RSI, 52-Week Highs",
    description:
      "Daily technical scans of 100 US large caps: moving-average crosses, RSI extremes, and 52-week highs. Free, no sign-up.",
    url: PAGE_URL,
    siteName: "Poshkan",
    type: "website",
  },
};

// Latest result row per scan — { slug: { count, date } }, or null when the
// migration hasn't been run yet (pages must degrade gracefully).
async function latestCounts(): Promise<Record<string, { count: number; date: string }> | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("market_scans")
      .select("scan_slug, run_date, results")
      .order("run_date", { ascending: false })
      .limit(SCANS.length * 3);
    if (error || !data) return null;
    const out: Record<string, { count: number; date: string }> = {};
    for (const row of data) {
      if (!out[row.scan_slug]) {
        out[row.scan_slug] = { count: (row.results as ScanRow[]).length, date: row.run_date };
      }
    }
    return out;
  } catch {
    return null;
  }
}

export default async function ScansIndex() {
  const counts = await latestCounts();

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Link href="/" className="text-sm text-muted hover:text-foreground hover:underline">
          ← Poshkan
        </Link>
        <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">Free daily stock scans</h1>
        <p className="mb-10 max-w-2xl text-muted">
          Six classic technical scans across 100 US large caps, recomputed after every market
          close — the same signals traders pay screener subscriptions for, free and with no
          sign-up. Spot a setup, then practice the trade with virtual money.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SCANS.map((s) => {
            const c = counts?.[s.slug];
            return (
              <Link
                key={s.slug}
                href={`/scans/${s.slug}`}
                className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
              >
                <h2 className="font-semibold">
                  {s.icon} {s.name}
                </h2>
                <p className="mt-1 text-sm text-muted">{s.short}</p>
                {c && (
                  <p className="mt-2 text-xs font-medium text-primary">
                    {c.count} {c.count === 1 ? "match" : "matches"} · {c.date}
                  </p>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-semibold">Trade the signals without the risk</h2>
          <p className="mt-1 text-sm text-muted">
            Every scan is a hypothesis, not a promise. Poshkan gives you free paper-trading
            accounts — US stocks, crypto, and leveraged forex — so you can test how these signals
            actually behave before putting real money behind them.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Create a free account
          </Link>
        </div>

        <p className="mt-10 border-t border-border pt-4 text-xs text-muted">
          Scans are computed from daily closing data for education and idea generation — nothing
          here is financial advice or a recommendation to buy or sell any security. Data may be
          delayed or inaccurate.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
