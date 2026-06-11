import Link from "next/link";

export const metadata = { title: "Terms of Use — Poshkan" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-muted hover:text-foreground hover:underline">
        ← Back to Poshkan
      </Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold tracking-tight">Terms of Use</h1>
      <p className="mb-8 text-sm text-muted">Last updated: June 2026</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-1 font-semibold">1. Poshkan is a simulator</h2>
          <p>
            Poshkan is a <strong>paper-trading practice platform</strong>. Every account balance,
            trade, position, profit, and loss on Poshkan is <strong>virtual</strong>. No real
            money is ever deposited, invested, traded, won, or lost. Nothing you do here buys or
            sells any real security, cryptocurrency, or currency.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">2. Not financial advice</h2>
          <p>
            Nothing on Poshkan — including prices, charts, news, leaderboards, or any AI-generated
            review or commentary — is investment advice, a recommendation, or an offer to buy or
            sell anything. Poshkan is for education and entertainment only. Decisions you make
            with real money elsewhere are entirely your own responsibility.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">3. Market data</h2>
          <p>
            Prices and other market data come from third-party sources and may be delayed,
            incomplete, or inaccurate. Simulated results here will differ from real-world trading,
            which involves spreads, fees, slippage, and liquidity that this simulator does not
            fully reproduce. Practice performance does not predict real returns.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">4. Your account</h2>
          <p>
            You are responsible for keeping your password and any API tokens secret. Your username
            and your accounts&apos; virtual returns may appear on the public leaderboard. Don&apos;t
            abuse the service (no attempts to break, overload, or misuse it) — we may suspend
            accounts that do.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">5. No warranty</h2>
          <p>
            Poshkan is a free hobby project provided <em>as is</em>, without warranties of any
            kind. It may be unavailable, change, or shut down at any time. To the maximum extent
            permitted by law, Poshkan and its creator accept no liability for any loss or damage
            arising from use of the service.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">6. Contact</h2>
          <p>
            Questions or account deletion requests: use the in-app account deletion, or contact
            the operator of this deployment.
          </p>
        </section>
      </div>
    </main>
  );
}
