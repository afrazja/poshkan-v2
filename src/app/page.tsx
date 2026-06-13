import Image from "next/image";
import AuthCard from "@/components/auth/AuthCard";
import SiteFooter from "@/components/SiteFooter";
import InstallPwa from "@/components/InstallPwa";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";
import LandingThemeToggle from "@/components/auth/LandingThemeToggle";

export const metadata = {
  title: "Poshkan — Practice trading stocks, crypto & forex with virtual money",
  description:
    "A risk-free trading simulator with live prices, real order types, an AI coach that reviews your trades, and a leaderboard to compete with friends. 100% virtual money.",
};

export default function LandingPage() {
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
          <div className="flex flex-1 items-center">
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
              Practice stocks, crypto, and forex with live prices and 100% virtual money — then
              let an AI coach review your trades and tell you what to fix.
            </p>
            <ul className="mt-8 space-y-3 text-white/90">
              <li className="flex items-center gap-3">
                <Dot /> Stocks, crypto &amp; forex — one playground
              </li>
              <li className="flex items-center gap-3">
                <Dot /> An AI coach that critiques your trading
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
          Practice stocks, crypto, and forex with live prices and 100% virtual money — with an AI
          coach and a leaderboard.
        </p>
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
              icon="📈"
              title="Three real markets"
              text="US stocks & ETFs, crypto, and leveraged forex pairs — each with live prices, charts, and its own account type."
            />
            <Feature
              icon="🤖"
              title="An AI coach in your corner"
              text="Journal why you make each trade. Claude reviews your reasoning against the outcomes and tells you which habits to fix."
            />
            <Feature
              icon="🏆"
              title="Compete with friends"
              text="Every account is ranked by % return on a live leaderboard. Fair math: deposits don't buy rank, resets restart your history."
            />
            <Feature
              icon="⚡"
              title="Real order types"
              text="Market and limit orders, Day/GTC, stop-loss & take-profit, forex entry orders — filled 24/7 by background workers, even while you sleep."
            />
            <Feature
              icon="🔔"
              title="Alerts that find you"
              text="Price alerts and order fills arrive by email and push notification — on your phone's lock screen if you install the app."
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
              title="AI trading journals"
              point="AI insights on your trading psychology."
              catchLine="Cost $200–400 per year, assume you already trade real money — and don't include anywhere to practice."
            />
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-base font-medium">
            Poshkan puts all three in one place — the practice venue, the AI coach, and the
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
            <Step n="3" title="Trade, compete, improve" text="Buy your first stock in seconds. Journal your reasoning. Let the AI coach sharpen you." />
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
  const rows = ["AAPL +1.2%", "TSLA -0.8%", "NVDA +3.4%", "MSFT +0.5%", "AMZN -1.1%", "GOOGL +0.9%"];
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
