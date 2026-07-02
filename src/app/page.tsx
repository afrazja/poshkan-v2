import Image from "next/image";
import AuthCard from "@/components/auth/AuthCard";
import SiteFooter from "@/components/SiteFooter";
import InstallPwa from "@/components/InstallPwa";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";
import LandingThemeToggle from "@/components/auth/LandingThemeToggle";

export const metadata = {
  title: "Poshkan — Automated strategy scanners for stocks, crypto & forex (virtual money)",
  description:
    "A library of strategy scanners that find & auto-trade setups, go long or short with 1–10× leverage, and a live leaderboard — across US stocks, crypto, and forex. 100% virtual money, risk-free.",
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  return (
    <div className="relative flex min-h-screen flex-col">
      <RecoveryRedirect />
      <LandingThemeToggle />
      {/* Above the fold: signup + hero */}
      <main className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: auth */}
        <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="mb-8 flex items-center gap-2">
            <Image src="/icons/icon-192.png" alt="Poshkan" width={36} height={36} className="rounded-lg" />
            <span className="text-xl font-bold tracking-tight">Poshkan</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {expired && (
              <div className="w-full max-w-md rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
                Your session expired — please log in again.
              </div>
            )}
            <AuthCard />
          </div>
        </div>

        {/* Right: hero */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-blue-600 to-indigo-800 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:text-white">
          <div className="pointer-events-none absolute inset-0 opacity-20">
            <TickerBackdrop />
          </div>
          <div className="relative z-10 max-w-lg">
            <h1 className="text-5xl font-extrabold leading-tight tracking-tight">
              Trade fearlessly.
              <br />
              Lose nothing.
            </h1>
            <p className="mt-6 text-lg text-white/80">
              Practice stocks, crypto, and forex with live prices and 100% virtual money — and let
              a library of strategy scanners find and trade setups for you, around the clock.
            </p>
            <ul className="mt-8 space-y-3 text-white/90">
              <li className="flex items-center gap-3">
                <Dot /> Six strategy scanners that hunt &amp; trade setups for you
              </li>
              <li className="flex items-center gap-3">
                <Dot /> Go long or short — stocks, crypto &amp; forex, 1–10× leverage
              </li>
              <li className="flex items-center gap-3">
                <Dot /> An AI scanner that trades your plain-English rules
              </li>
              <li className="flex items-center gap-3">
                <Dot /> A leaderboard to beat your friends on
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* Mobile hero strip (the gradient panel is hidden below lg) */}
      <section className="border-t border-border px-6 py-8 text-center lg:hidden">
        <h1 className="text-2xl font-extrabold tracking-tight">Trade fearlessly. Lose nothing.</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          A library of strategy scanners across stocks, crypto, and forex — long or short, with
          backtests and a leaderboard. 100% virtual money.
        </p>
      </section>

      {/* Scanners — the hero feature: a library across all markets */}
      <section className="border-t border-border bg-card px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            ✦ Strategy scanner library
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Six scanners. Three markets. One playground.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted">
            Flip a scanner on and it hunts setups around the clock — on US stocks, crypto, or forex —
            pinging your phone, or trading on its own within the risk limits you set. Pick your symbols,
            set your strategy, walk away.
          </p>

          {/* Markets the scanners run on */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <MarketChip label="US stocks" />
            <MarketChip label="Crypto" />
            <MarketChip label="Forex" />
          </div>

          {/* The library */}
          <div className="mt-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
            <ScannerTile icon="🤖" title="AI Scanner" text="Claude reads the market and your plain-English rules to decide trades." />
            <ScannerTile icon="📈" title="Smart Money Concepts" text="Order-block and fair-value-gap retests, confirmed before entry." />
            <ScannerTile icon="🎯" title="Optimal Trade Entry" text="Fibonacci pullbacks into the OTE zone of an established trend." />
            <ScannerTile icon="🚀" title="Trend Breakout" text="Confirmed breakouts with ADX strength and room left to run." />
            <ScannerTile icon="↩️" title="Mean Reversion" text="Fades stretched moves back toward the middle of the band." />
            <ScannerTile icon="📦" title="Candle Range" text="Buys support and sells resistance inside a price box." />
          </div>

          {/* Backtest → alert → auto-trade */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            <span>🧪 Backtest it first</span>
            <span>🔔 Alert your phone</span>
            <span>⚡ Auto-trade, 1–10× leverage</span>
          </div>
          <p className="mt-6 text-xs text-muted">
            New strategies land regularly — and they&apos;re free while we grow the library.
          </p>
        </div>
      </section>

      {/* Trade any market, your way */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Trade any market, your way
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
            Not just buy-and-hold. Trade however the setup demands — by hand, or by scanner.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Feature
              icon="💵"
              title="Spot — own it"
              text="Buy and hold US stocks, ETFs, and crypto with virtual cash. Realized and unrealized P&amp;L tracked on every position."
            />
            <Feature
              icon="🔀"
              title="Long or short, with leverage"
              text="Go long or short on stocks, crypto, and forex — pick 1–10× leverage per trade, with stop-loss, take-profit, stop-out, and timed auto-close."
            />
            <Feature
              icon="⚡"
              title="Real order types"
              text="Market and limit orders, Day/GTC, forex entry orders — filled 24/7 by background workers, even while you sleep."
            />
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Everything a real broker has — except the risk
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
            Poshkan isn&apos;t a toy. It&apos;s a full trading environment where your mistakes are
            free — and your instincts are real.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon="🤖"
              title="An AI scanner on watch"
              text="Claude reads price action on your watchlist around the clock and flags setups — alert-only, or auto-trading within the risk limits you set."
            />
            <Feature
              icon="🏆"
              title="Compete with friends"
              text="Every account is ranked by % return on a live leaderboard. Fair math: deposits don't buy rank, resets restart your history."
            />
            <Feature
              icon="🔔"
              title="Alerts that find you"
              text="Scanner signals, order fills, and price alerts arrive by push and email — and live in the app's notification center so nothing slips by."
            />
            <Feature
              icon="🛡️"
              title="Risk guardrails built in"
              text="Every scanner is capped by your risk %, max open trades, max per day, and a daily loss limit — and never fights itself with opposing trades."
            />
            <Feature
              icon="🧪"
              title="Backtest before you trust it"
              text="See how a deterministic scanner would've performed on recent history — win rate, net R, and an equity curve — before you risk a cent."
            />
            <Feature
              icon="📊"
              title="Honest performance tracking"
              text="Daily snapshots build your true performance history — including a 'you vs. the S&P 500' chart that never lies to you."
            />
          </div>
        </div>
      </section>

      {/* Positioning: why not the alternatives */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Why not just use a broker&apos;s demo?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
            Fair question. Here&apos;s the honest comparison.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Alternative
              title="Broker demo accounts"
              point="High-fidelity simulations of real platforms."
              catchLine="Built to convert you into a paying customer — cockpit UIs that intimidate beginners, and zero feedback on why you lose."
            />
            <Alternative
              title="Classroom simulators"
              point="Simple stock-picking games with leaderboards."
              catchLine="Usually stocks-only, dated interfaces, delayed data, shallow order types — and no coaching of any kind."
            />
            <Alternative
              title="Signal services"
              point="Trade calls delivered to your inbox or Discord."
              catchLine="Cost $50–100 a month, explain nothing, and give you no safe place to test whether the calls are any good."
            />
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-base font-medium">
            Poshkan puts all three in one place — the practice venue, the scanners, and the
            competition — <span className="text-primary">free</span>.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-card px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Trading in three minutes
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 text-center sm:grid-cols-3">
            <Step n="1" title="Create a free account" text="Email, username, password. No card, no broker forms, nothing real at stake." />
            <Step n="2" title="Fund it with virtual cash" text="Open stock, crypto, or forex accounts and seed them with as much play money as you like." />
            <Step n="3" title="Trade — or let a scanner do it" text="Buy in seconds, or flip on a strategy scanner and let it find and trade setups while you watch and learn." />
          </div>
          <p className="mt-10 text-center text-sm text-muted">
            Ready? Scroll up and create your account — it takes a minute. ↑
          </p>
        </div>
      </section>

      <InstallPwa />

      <SiteFooter />
    </div>
  );
}

function Alternative({ title, point, catchLine }: { title: string; point: string; catchLine: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{point}</p>
      <p className="mt-2 text-sm leading-relaxed">
        <span className="font-medium text-negative">The catch:</span>{" "}
        <span className="text-muted">{catchLine}</span>
      </p>
    </div>
  );
}

function ScannerTile({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function MarketChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium">
      {label}
    </span>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div>
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
        {n}
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function Dot() {
  return <span className="h-2 w-2 rounded-full bg-white/80" />;
}

function TickerBackdrop() {
  const rows = ["AAPL +1.2%", "BTC +2.1%", "NVDA +3.4%", "ETH -0.7%", "EURUSD +0.3%", "SOL +4.4%", "TSLA -0.8%", "MSFT +0.5%"];
  return (
    <div className="flex h-full flex-col justify-around font-mono text-2xl">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="whitespace-nowrap">
          {rows.concat(rows).join("    ")}
        </div>
      ))}
    </div>
  );
}
