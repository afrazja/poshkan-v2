import Link from "next/link";

export const metadata = { title: "Privacy — Poshkan" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-muted hover:text-foreground hover:underline">
        ← Back to Poshkan
      </Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold tracking-tight">Privacy</h1>
      <p className="mb-8 text-sm text-muted">Last updated: June 2026</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-1 font-semibold">What we collect</h2>
          <p>
            Your email address and username (for your account), and your activity inside the
            simulator: virtual accounts, trades, orders, watchlists, alerts, and —
            if you enable them — push-notification subscriptions and API tokens (stored only as
            hashes).
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">How it&apos;s used</h2>
          <p>
            Only to run Poshkan: signing you in, executing your simulated trades, sending the
            emails and notifications you asked for (alerts, password resets), showing the
            leaderboard (username + virtual returns only), and — if you use it — running the AI
            scanner on your watchlist. We don&apos;t sell your data or run ads.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Services we rely on</h2>
          <p>
            Poshkan runs on Vercel (hosting), Supabase (database &amp; authentication), Resend
            (email delivery), Yahoo Finance (market data — your personal data is never sent
            there), and Anthropic (the AI scanner — your watchlist symbols and market data are
            sent to the Claude API only when the scanner runs for you). Each processes data under
            its own privacy policy.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Deleting your data</h2>
          <p>
            Deleting a trading account inside the app permanently removes its positions, orders,
            and history. To delete your entire profile, contact the operator of this deployment —
            all your data will be removed.
          </p>
        </section>
      </div>
    </main>
  );
}
