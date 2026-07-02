import Image from "next/image";
import { unstable_cache } from "next/cache";
import AuthCard from "@/components/auth/AuthCard";
import SiteFooter from "@/components/SiteFooter";
import InstallPwa from "@/components/InstallPwa";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";
import LandingThemeToggle from "@/components/auth/LandingThemeToggle";
import { createAdminClient } from "@/lib/supabase/admin";
import { symbolLabel } from "@/lib/assets";

const TITLE = "Poshkan — Automated strategy scanners for stocks, crypto & forex (virtual money)";
const DESCRIPTION =
  "A library of strategy scanners that find & auto-trade setups, go long or short with 1–10× leverage, and a live leaderboard — across US stocks, crypto, and forex. 100% virtual money, risk-free.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://www.poshkan.com" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://www.poshkan.com",
    siteName: "Poshkan",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Rich-result hint for Google: a free finance web app.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Poshkan",
  url: "https://www.poshkan.com",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

// Live "activity proof" for the landing page — honest numbers the platform
// actually generates, not popularity claims. Cached 5 minutes; returns null
// (section hidden) if the admin key is missing or there's nothing to show.
interface LiveEvent {
  icon: string;
  scanner: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  executed: boolean;
  createdAt: string;
}

const SIGNAL_TABLES = [
  { table: "smc_signals", icon: "📈", name: "SMC" },
  { table: "ote_signals", icon: "🎯", name: "OTE" },
  { table: "trend_signals", icon: "🚀", name: "Trend" },
  { table: "meanrev_signals", icon: "↩️", name: "Mean Rev" },
  { table: "candlerange_signals", icon: "📦", name: "Range" },
];

const getLiveStats = unstable_cache(
  async (): Promise<{ trades: number; signals: number; events: LiveEvent[] } | null> => {
    try {
      const admin = createAdminClient();
      const [txRes, fxRes, recents, counts] = await Promise.all([
        admin.from("transactions").select("id", { count: "exact", head: true }).in("side", ["BUY", "SELL"]),
        admin.from("fx_positions").select("id", { count: "exact", head: true }),
        Promise.all(
          SIGNAL_TABLES.map((t) =>
            admin
              .from(t.table)
              .select("symbol, direction, executed, created_at")
              .order("created_at", { ascending: false })
              .limit(3)
          )
        ),
        Promise.all(
          SIGNAL_TABLES.map((t) => admin.from(t.table).select("id", { count: "exact", head: true }))
        ),
      ]);
      const trades = (txRes.count ?? 0) + (fxRes.count ?? 0);
      const signals = counts.reduce((s, c) => s + (c.count ?? 0), 0);
      const events: LiveEvent[] = recents
        .flatMap((r, i) =>
          ((r.data ?? []) as { symbol: string; direction: string; executed: boolean; created_at: string }[]).map(
            (row) => ({
              icon: SIGNAL_TABLES[i].icon,
              scanner: SIGNAL_TABLES[i].name,
              symbol: row.symbol,
              direction: row.direction as "LONG" | "SHORT",
              executed: !!row.executed,
              createdAt: row.created_at,
            })
          )
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6);
      if (!trades && !signals) return null;
      return { trades, signals, events };
    } catch {
      return null;
    }
  },
  ["landing-live-stats"],
  { revalidate: 300 }
);

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  const live = await getLiveStats();
  return (
    <div className="relative flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
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
          <div id="signup" className="flex flex-1 scroll-mt-8 flex-col items-center justify-center gap-4">
            {/* Mobile: pitch BEFORE the form — a cold visitor needs the why before the ask.
                (On lg+ the gradient hero panel on the right carries this instead.) */}
            <div className="mb-2 text-center lg:hidden">
              <h1 className="text-2xl font-extrabold tracking-tight">
                Trade fearlessly. Lose nothing.
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                A library of strategy scanners across stocks, crypto, and forex — long or short,
                with backtests and a leaderboard. 100% virtual money.
              </p>
            </div>
            {expired && (
              <div className="w-full max-w-md rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
                Your session expired — please log in again.
              </div>
            )}
            <AuthCard />
          </div>
        </div>

        {/* Right: hero */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b0e14] via-[#101726] to-indigo-950 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:text-white">
          <div className="pointer-events-none absolute inset-0">
            <CandleBackdrop />
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

      {/* Product proof: a faithful in-CSS mock of the live scanners page */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            This is what it looks like
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
            Scanners running around the clock, signals landing, trades opening — all on virtual money.
          </p>

          <div className="relative mt-10">
            {/* App window */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e14] text-[#e6e8eb] shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs text-white/40">poshkan.com/dashboard/scanners</span>
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Scanners healthy · last ran 1m ago
                </div>

                {/* Recent activity */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold">📋 Recent activity</span>
                    <span className="text-blue-400">View full log ↓</span>
                  </div>
                  <MockActivityRow dir="LONG" sym="EUR/USD" scanner="🎯 OTE" tag="traded" ago="2m ago" />
                  <MockActivityRow dir="SHORT" sym="BTC" scanner="📈 SMC" tag="alert" ago="18m ago" />
                  <MockActivityRow dir="LONG" sym="NVDA" scanner="🚀 Trend" tag="traded" ago="1h ago" />
                </div>

                {/* Scanner cards */}
                <MockScannerCard icon="🎯" name="OTE Scanner" mode="Auto-trade" last="LONG SOL (traded) 2h ago" />
                <MockScannerCard icon="🚀" name="Trend Breakout" mode="Alert" last="LONG BTC (alert) 4h ago" />
              </div>
            </div>

            {/* Floating account stat card */}
            <div className="absolute -bottom-6 right-3 hidden rounded-xl border border-white/10 bg-[#12161f] px-5 py-4 text-white shadow-2xl sm:block">
              <div className="text-[11px] uppercase tracking-wide text-white/40">Total value</div>
              <div className="mt-0.5 text-2xl font-bold">$24,618.90</div>
              <div className="mt-0.5 text-sm font-medium text-emerald-400">+$312.40 (+1.3%) today</div>
            </div>
          </div>
        </div>
      </section>

      {/* Activity proof: honest live numbers + the platform's real recent signals.
          Testimonials from real users go here later (quotes pending) — render
          nothing until we have the actual words. */}
      {live && (
        <section className="border-t border-border bg-card px-6 py-12 sm:px-12">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
              <Counter value={live.trades} label="virtual trades executed" />
              <Counter value={live.signals} label="scanner signals fired" />
              <Counter value="24/7" label="watching 3 markets, 6 strategies" />
            </div>

            {live.events.length > 0 && (
              <>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {live.events.map((e, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs"
                    >
                      {e.icon} {e.scanner} ·{" "}
                      <span className={e.direction === "LONG" ? "font-medium text-positive" : "font-medium text-negative"}>
                        {e.direction}
                      </span>{" "}
                      {symbolLabel(e.symbol)}
                      {e.executed ? (
                        <span className="rounded bg-positive/15 px-1.5 py-0.5 text-positive">traded</span>
                      ) : (
                        <span className="rounded bg-muted/20 px-1.5 py-0.5 text-muted">alert</span>
                      )}
                      <span className="text-muted">{ago(e.createdAt)}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-muted">
                  Live from the platform — real scanner activity, 100% virtual money.
                </p>
              </>
            )}
          </div>
        </section>
      )}

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

          {/* The library — each tile links to its public strategy explainer */}
          <div className="mt-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
            <ScannerTile href="/strategies/ai-scanner" icon="🤖" title="AI Scanner" text="Claude reads the market and your plain-English rules to decide trades." />
            <ScannerTile href="/strategies/smart-money-concepts" icon="📈" title="Smart Money Concepts" text="Order-block and fair-value-gap retests, confirmed before entry." />
            <ScannerTile href="/strategies/optimal-trade-entry" icon="🎯" title="Optimal Trade Entry" text="Fibonacci pullbacks into the OTE zone of an established trend." />
            <ScannerTile href="/strategies/trend-breakout" icon="🚀" title="Trend Breakout" text="Confirmed breakouts with ADX strength and room left to run." />
            <ScannerTile href="/strategies/mean-reversion" icon="↩️" title="Mean Reversion" text="Fades stretched moves back toward the middle of the band." />
            <ScannerTile href="/strategies/candle-range" icon="📦" title="Candle Range" text="Buys support and sells resistance inside a price box." />
          </div>
          <p className="mt-4 text-xs text-muted">
            Tap any strategy to read how it works in plain English.
          </p>

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
          <div className="mt-10 text-center">
            <a
              href="#signup"
              className="inline-block rounded-xl bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Create your free account
            </a>
            <p className="mt-2 text-xs text-muted">Takes a minute — no card, nothing real at stake.</p>
          </div>
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

function ScannerTile({ href, icon, title, text }: { href: string; icon: string; title: string; text: string }) {
  return (
    <a href={href} className="rounded-2xl border border-border bg-background p-5 transition hover:border-primary/50">
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
    </a>
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

function Counter({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="text-3xl font-extrabold tracking-tight">
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

function MockActivityRow({
  dir,
  sym,
  scanner,
  tag,
  ago,
}: {
  dir: "LONG" | "SHORT";
  sym: string;
  scanner: string;
  tag: "traded" | "alert";
  ago: string;
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs first:mt-0">
      <span className="min-w-0 truncate">
        {scanner} ·{" "}
        <span className={dir === "LONG" ? "text-emerald-400" : "text-rose-400"}>{dir}</span> {sym}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {tag === "traded" ? (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">traded</span>
        ) : (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/50">alert</span>
        )}
        <span className="text-white/40">{ago}</span>
      </span>
    </div>
  );
}

function MockScannerCard({
  icon,
  name,
  mode,
  last,
}: {
  icon: string;
  name: string;
  mode: string;
  last: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <span className="text-sm font-semibold">
        {icon} {name}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400">Enabled</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400">{mode}</span>
        <span className="text-white/40">ran 1m ago · last: {last}</span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/40">›</span>
      </span>
    </div>
  );
}

// Neon candlestick backdrop for the hero — pure CSS, echoing a dark trading
// aesthetic without shipping any image assets.
const CANDLES: { left: number; top: number; h: number; up: boolean }[] = [
  { left: 4, top: 58, h: 90, up: true },
  { left: 12, top: 44, h: 130, up: false },
  { left: 20, top: 52, h: 100, up: true },
  { left: 28, top: 30, h: 150, up: true },
  { left: 36, top: 42, h: 110, up: false },
  { left: 44, top: 22, h: 170, up: true },
  { left: 52, top: 36, h: 120, up: false },
  { left: 60, top: 18, h: 180, up: true },
  { left: 68, top: 30, h: 140, up: true },
  { left: 76, top: 14, h: 160, up: false },
  { left: 84, top: 24, h: 190, up: true },
  { left: 92, top: 10, h: 150, up: true },
];

function CandleBackdrop() {
  return (
    <div className="relative h-full w-full opacity-50">
      {CANDLES.map((c, i) => {
        const color = c.up ? "rgba(34,197,94," : "rgba(239,68,68,";
        return (
          <div key={i} className="absolute" style={{ left: `${c.left}%`, top: `${c.top}%` }}>
            {/* wick */}
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                width: 2,
                height: c.h * 1.6,
                top: -(c.h * 0.3),
                background: `${color}0.35)`,
              }}
            />
            {/* body with glow */}
            <div
              className="relative rounded-[3px]"
              style={{
                width: 14,
                height: c.h,
                background: `${color}0.28)`,
                border: `1px solid ${color}0.55)`,
                boxShadow: `0 0 22px ${color}0.45), 0 0 60px ${color}0.18)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
