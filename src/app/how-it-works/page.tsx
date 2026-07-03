import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "How the simulation works — Poshkan",
  description:
    "Exactly how Poshkan's paper-trading simulator prices assets, fills orders, runs scanner backtests, and ranks the leaderboard — the honest mechanics, in plain language.",
};

// The trust page: every mechanic that affects a user's numbers, stated plainly.
// Most simulators hide this; publishing it IS the pitch — our answers are the
// conservative ones.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Poshkan
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">How the simulation works</h1>
        <p className="mt-3 text-sm text-muted">
          Every number in Poshkan comes from a rule you can read on this page. It&apos;s a paper-trading
          simulator — all money is virtual — but the mechanics are built to be conservative, so what
          you learn here transfers honestly.
        </p>

        <Section title="Where prices come from">
          <p>
            Quotes and candles come from public market-data feeds for US stocks, major crypto pairs, and
            forex. Data can be <strong className="text-foreground">delayed by up to a few minutes</strong>{" "}
            and occasionally wrong or missing — treat prices as realistic, not exchange-grade. When a live
            quote is unavailable, the app says so (or shows your cost basis, clearly labeled) rather than
            inventing a number.
          </p>
        </Section>

        <Section title="How orders fill">
          <p>
            Market orders fill immediately at the current quoted price — no simulated queue, no partial
            fills. Limit orders fill when the live price crosses your limit. Stop-loss and take-profit
            levels on leveraged positions are checked continuously against live quotes; when both could
            have been hit inside the same price bar, <strong className="text-foreground">the stop is
            assumed to hit first</strong> — the conservative reading.
          </p>
          <p>
            Real trading costs money that simulators usually ignore. Live paper fills use the quoted
            price directly, so your live results are slightly <em>optimistic</em> versus a real broker
            (no spread or commission is charged) — keep that in mind when judging tight-margin
            strategies.
          </p>
        </Section>

        <Section title="How scanner backtests work">
          <p>
            Backtests replay a scanner&apos;s exact live logic bar by bar over recent history. Three rules
            keep them honest:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">No look-ahead:</strong> at every decision point the
              replay sees only bars that had fully closed at that moment — never data from the future.
            </li>
            <li>
              <strong className="text-foreground">Costs are charged:</strong> every backtest trade pays an
              estimated round-trip spread + slippage (about 1 pip on forex majors, ~0.1% on crypto, ~0.05%
              on liquid stocks). High-frequency strategies pay it on every trade, exactly as they would in
              life.
            </li>
            <li>
              <strong className="text-foreground">Stops first:</strong> when a bar touches both the stop
              and the target, the trade is scored as a loss.
            </li>
          </ul>
          <p>
            Backtests still overstate real-world results — history is one path, and live spreads widen at
            the worst moments. Use them to compare strategies, not to predict returns.
          </p>
        </Section>

        <Section title="How returns and the leaderboard are measured">
          <p>
            Your performance chart is a <strong className="text-foreground">time-weighted return</strong>:
            adding virtual cash never counts as profit — only what your positions actually did. The
            leaderboard ranks traders by percentage return on the money put in since each account&apos;s
            last reset, valued at live prices. There is no way to buy an asset at a made-up price or
            backdate a trade.
          </p>
        </Section>

        <Section title="The AI scanner">
          <p>
            The AI scanner runs on <strong className="text-foreground">your own Anthropic API key</strong>{" "}
            — Poshkan never bills you for it and can&apos;t spend on your behalf. Every AI-proposed trade
            must pass the same validation as any other signal (real symbol, sane stop/target geometry,
            price near the live quote, minimum reward:risk) before it can execute, and it always trades
            inside the risk limits you configure.
          </p>
        </Section>

        <Section title="Privacy & what's real">
          <p>
            Your account needs an email address and a display name — nothing else. No payment details, no
            broker connection, no real money anywhere in the system. Trades, balances, and returns are
            100% virtual; nothing can be won or lost, and nothing on Poshkan is financial advice.
          </p>
        </Section>

        <p className="mt-12 text-sm text-muted">
          Questions about a mechanic that isn&apos;t covered here?{" "}
          <Link href="/help" className="text-primary hover:underline">
            See the help page
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
