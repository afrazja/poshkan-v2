import Image from "next/image";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import {
  ArrowRight,
  BellRing,
  ChartNoAxesCombined,
  FlaskConical,
  ListChecks,
  Plus,
  ShieldCheck,
} from "lucide-react";
import AuthCard from "@/components/auth/AuthCard";
import SiteFooter from "@/components/SiteFooter";
import InstallPwa from "@/components/InstallPwa";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";
import LandingThemeToggle from "@/components/auth/LandingThemeToggle";
import ScannerIcon, { type ScannerKind } from "@/components/ScannerIcon";
import { createAdminClient } from "@/lib/supabase/admin";
import { symbolLabel } from "@/lib/assets";

const TITLE = "Poshkan | Paper Trading and Strategy Lab for Stocks, Crypto & Forex";
const DESCRIPTION =
  "Build, backtest, and observe trading strategies with virtual money across stocks, crypto, and forex. Start with six built-in templates or create your own rules.";

const LAB_WORKFLOW = [
  {
    label: "Define rules",
    description: "Turn an idea into exact candle and indicator conditions.",
    Icon: ListChecks,
  },
  {
    label: "Set risk",
    description: "Choose the stop, target, and maximum holding time.",
    Icon: ShieldCheck,
  },
  {
    label: "Backtest",
    description: "Replay the rules on historical candles with trading costs.",
    Icon: ChartNoAxesCombined,
  },
  {
    label: "Observe",
    description: "Follow paper alerts and learn where the idea breaks down.",
    Icon: BellRing,
  },
] as const;

const BUILT_IN_STRATEGIES: {
  href: string;
  kind: ScannerKind;
  name: string;
  summary: string;
  market: string;
}[] = [
  {
    href: "/strategies/smart-money-concepts",
    kind: "smc",
    name: "Smart Money Concepts",
    summary: "Tests structure breaks, fair value gaps, and confirmed retests.",
    market: "Crypto + forex",
  },
  {
    href: "/strategies/optimal-trade-entry",
    kind: "ote",
    name: "Optimal Trade Entry",
    summary: "Looks for confirmed pullbacks into the 62-79% Fibonacci zone.",
    market: "Crypto + forex",
  },
  {
    href: "/strategies/trend-breakout",
    kind: "trend",
    name: "Trend Breakout",
    summary: "Tests breakouts with trend strength and room for the move to continue.",
    market: "Stocks + crypto + forex",
  },
  {
    href: "/strategies/mean-reversion",
    kind: "meanrev",
    name: "Mean Reversion",
    summary: "Tests whether stretched prices return toward their recent average.",
    market: "Stocks + crypto + forex",
  },
  {
    href: "/strategies/candle-range",
    kind: "candlerange",
    name: "Candle Range",
    summary: "Looks for confirmed entries near support and resistance inside a range.",
    market: "Stocks + crypto + forex",
  },
  {
    href: "/strategies/ai-scanner",
    kind: "ai",
    name: "AI Scanner",
    summary: "Evaluates plain-English instructions as an optional paper-trading experiment.",
    market: "Stocks + crypto + forex",
  },
];

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

// Rich-result hints for Google. Organization + WebSite establish the brand
// entity and site structure (prerequisites for sitelinks under brand
// searches); WebApplication describes the free finance app itself.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.poshkan.com/#org",
      name: "Poshkan",
      url: "https://www.poshkan.com",
      logo: "https://www.poshkan.com/icons/icon-512.png",
    },
    {
      "@type": "WebSite",
      "@id": "https://www.poshkan.com/#website",
      name: "Poshkan",
      url: "https://www.poshkan.com",
      publisher: { "@id": "https://www.poshkan.com/#org" },
    },
    {
      "@type": "WebApplication",
      name: "Poshkan",
      url: "https://www.poshkan.com",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": "https://www.poshkan.com/#org" },
    },
  ],
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
  searchParams: Promise<{ expired?: string; error?: string }>;
}) {
  const { expired, error } = await searchParams;
  const live = await getLiveStats();
  const authError =
    error === "confirm"
      ? "That confirmation link is invalid or expired. Please request a new one."
      : error === "oauth"
        ? "Google sign-in wasn’t completed. Please try again."
        : null;
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
                Practice trading. Lose nothing real.
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Build and backtest trading rules, start from six built-in strategies, and practice
                across stocks, crypto, and forex with 100% virtual money.
              </p>
            </div>
            {expired && (
              <div className="w-full max-w-md rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
                Your session expired — please log in again.
              </div>
            )}
            {authError && (
              <div className="w-full max-w-md rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
                {authError}
              </div>
            )}
            <AuthCard defaultTab={expired ? "login" : "signup"} />
          </div>
        </div>

        {/* Right: hero */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b0e14] via-[#101726] to-indigo-950 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:text-white">
          <div className="pointer-events-none absolute inset-0">
            <CandleBackdrop />
          </div>
          <div className="relative z-10 max-w-lg">
            <h1 className="text-5xl font-extrabold leading-tight tracking-tight">
              Practice trading.
              <br />
              Lose nothing real.
            </h1>
            <p className="mt-6 text-lg text-white/80">
              Turn market ideas into explicit rules, test them on historical candles, and observe
              the results with 100% virtual money across stocks, crypto, and forex.
            </p>
            <ul className="mt-8 space-y-3 text-white/90">
              <li className="flex items-center gap-3">
                <Dot /> Build your own rules or start with six built-in strategy templates
              </li>
              <li className="flex items-center gap-3">
                <Dot /> Backtest completed candles before observing paper signals
              </li>
              <li className="flex items-center gap-3">
                <Dot /> Practice long or short across stocks, crypto, and forex
              </li>
              <li className="flex items-center gap-3">
                <Dot /> A leaderboard based on percentage returns, not deposits
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* Product proof: a real walkthrough of the guided Strategy Lab flow. */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            See Strategy Lab in action
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
            Go from a guided first strategy to readable rules, explicit risk, and evidence you can question.
          </p>

          <div className="relative mt-10">
            {/* App window: a short tour of the live Strategy Lab experience. */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e14] text-[#e6e8eb] shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs text-white/40">poshkan.com/dashboard</span>
              </div>
              <video
                src="/landing/strategy-lab-tour.mp4"
                poster="/landing/strategy-lab-tour-poster.jpg"
                autoPlay
                muted
                loop
                playsInline
                className="block w-full"
                aria-label="A short Strategy Lab walkthrough showing the Lab overview, guided strategy setup, entry rules, risk settings, and backtest interpretation."
              />
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            Demo data, 100% virtual money. No result shown here is a promise of future performance.
          </p>
        </div>
      </section>

      {/* Trust basics: answer the credibility questions before the feature tour gets too exciting. */}
      <section className="border-t border-border bg-card px-6 py-10 sm:px-12">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          <TrustPoint
            title="Virtual money only"
            text="No deposits, withdrawals, broker connection, or real-money prize pool. Every balance and trade is simulated."
          />
          <TrustPoint
            title="Transparent simulation"
            text="Market data can be delayed or missing, and fills are broker-style estimates. The mechanics are published in plain English."
            href="/how-it-works"
            cta="How it works"
          />
          <TrustPoint
            title="Experiments, not promises"
            text="Built-in and user-created strategies are tools for testing ideas. Results can be negative, and every trade remains virtual."
          />
        </div>
      </section>

      {/* Activity proof: honest live numbers + the platform's real recent signals. */}
      {live && (
        <section className="border-t border-border bg-card px-6 py-12 sm:px-12">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
              <Counter value={live.trades} label="virtual trades executed" />
              <Counter value={live.signals} label="scanner signals fired" />
              <Counter value="6" label="built-in strategy templates" />
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

      {/* Real words from real traders on the leaderboard */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            What early traders say
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Quote
              text="The most complete and easy-to-use platform I've found for practicing trading and honestly evaluating my skills."
              name="Vahid Alizadeh"
              role="forex trader on the leaderboard"
            />
            <Quote
              text="The scanners are the best part — set one loose on your watchlist and experimenting with strategies becomes the whole game."
              name="Masoud Nikkhah"
              role="early Poshkan trader"
            />
          </div>
        </div>
      </section>

      {/* Strategy Lab: the core product promise, with scanners as starting templates. */}
      <section className="border-t border-border bg-card px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <FlaskConical size={17} aria-hidden /> Strategy Lab
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Build the rule. Test the evidence. Watch it live.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                Start from a built-in scanner or create your own candle-based strategy. Poshkan keeps
                the rules, risk limits, backtest, and paper results together so you can learn what
                works, what fails, and under which market conditions.
              </p>
            </div>
            <Link
              href="#signup"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Open Strategy Lab <ArrowRight size={16} aria-hidden />
            </Link>
          </div>

          <ol className="mt-8 grid grid-cols-2 border-y border-border md:grid-cols-4" aria-label="Strategy Lab workflow">
            {LAB_WORKFLOW.map(({ label, description, Icon }, index) => (
              <li
                key={label}
                className={`min-w-0 py-4 pr-3 ${
                  index % 2 === 1 ? "border-l border-border pl-4" : ""
                } ${index >= 2 ? "border-t border-border md:border-t-0" : ""} ${
                  index > 0 ? "md:border-l md:border-border md:pl-4" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon size={15} aria-hidden />
                  </span>
                  <span className="text-xs font-semibold text-muted">{index + 1}</span>
                  <h3 className="text-sm font-semibold">{label}</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">{description}</p>
              </li>
            ))}
          </ol>

          <div className="mt-9 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Six built-in starting points</h3>
              <p className="mt-1 text-sm text-muted">
                Inspect the logic, test the history, then compare it with your own strategy.
              </p>
            </div>
            <Link href="/strategies" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Read the strategy guides <ArrowRight size={14} aria-hidden />
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BUILT_IN_STRATEGIES.map((strategy) => (
              <Link
                key={strategy.href}
                href={strategy.href}
                className="group rounded-lg border border-border bg-background p-4 transition hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card">
                    <ScannerIcon kind={strategy.kind} size={18} />
                  </span>
                  <span className="text-[11px] font-semibold uppercase text-muted">Built-in</span>
                </div>
                <h4 className="mt-3 font-semibold group-hover:text-primary">{strategy.name}</h4>
                <p className="mt-1 min-h-10 text-sm leading-5 text-muted">{strategy.summary}</p>
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted">{strategy.market}</p>
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-col justify-between gap-4 border-y border-border py-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Plus size={18} aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold">Your strategy belongs here too</h3>
                <p className="mt-1 text-sm text-muted">
                  Combine candle patterns, indicators, symbols, exits, and risk limits without writing code.
                </p>
              </div>
            </div>
            <Link href="#signup" className="shrink-0 text-sm font-semibold text-primary hover:underline">
              Create a free account
            </Link>
          </div>
        </div>
      </section>

      {/* Practice any market, your way */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Practice any market, your way
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
            Test a rule by hand, run a built-in template, or create a strategy of your own.
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
              text="Market and limit orders, Day/GTC, forex entry orders — simulated 24/7 by background workers, even while you sleep."
            />
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t border-border px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Broker-style tools, without real money at stake
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted">
            Poshkan is built for practice: realistic mechanics, explicit limits, and mistakes that
            cost virtual money instead of rent money.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon="🧩"
              title="Rules you can inspect"
              text="Build entry and exit conditions from candles and indicators instead of trusting an unexplained signal."
            />
            <Feature
              icon="🏆"
              title="Compete with friends"
              text="Every account is ranked by % return on a live leaderboard. Fair math: deposits don't buy rank, resets restart your history."
            />
            <Feature
              icon="🔔"
              title="Alerts that find you"
              text="Strategy matches, order fills, and price alerts arrive by push and email and remain in the notification center."
            />
            <Feature
              icon="🛡️"
              title="Risk guardrails built in"
              text="Every automated strategy is capped by your risk %, max open trades, max per day, and a daily loss limit."
            />
            <Feature
              icon="🧪"
              title="Backtest before you trust it"
              text="Replay rule-based strategies on recent history and inspect win rate, net R, drawdown, and the equity curve."
            />
            <Feature
              icon="📊"
              title="Honest performance tracking"
              text="Daily snapshots build your performance history — including a 'you vs. the S&P 500' chart that keeps you honest."
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
            Poshkan puts all three in one place — the practice venue, the Strategy Lab, and the
            competition — <span className="text-primary">free</span>.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-card px-6 py-14 sm:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Practicing in three minutes
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 text-center sm:grid-cols-3">
            <Step n="1" title="Create a free account" text="Email, username, password. No card, no broker forms, nothing real at stake." />
            <Step n="2" title="Fund it with virtual cash" text="Open stock, crypto, or forex accounts and seed them with as much play money as you like." />
            <Step n="3" title="Build or choose a strategy" text="Start with a built-in template or create your own rules, then follow every result with virtual money." />
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

function TrustPoint({
  title,
  text,
  href,
  cta,
}: {
  title: string;
  text: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
      {href && cta && (
        <a href={href} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          {cta}
        </a>
      )}
    </div>
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

function Quote({ text, name, role }: { text: string; name: string; role: string }) {
  return (
    <figure className="rounded-2xl border border-border bg-card p-6">
      <div aria-hidden className="text-3xl leading-none text-primary/40">“</div>
      <blockquote className="mt-1 text-sm leading-relaxed">{text}</blockquote>
      <figcaption className="mt-4 text-xs text-muted">
        <span className="font-semibold text-foreground">{name}</span> · {role}
      </figcaption>
    </figure>
  );
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
