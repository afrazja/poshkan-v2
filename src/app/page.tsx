import Image from "next/image";
import Link from "next/link";
import { Inter } from "next/font/google";
import { redirect } from "next/navigation";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";
import ContactForm from "@/components/landing/ContactForm";
import HeroSlider, { type Slide } from "@/components/landing/HeroSlider";
import { BTN_PRIMARY, FADE_RULE, SHADOW_MD } from "@/components/landing/lp";

// Nocturne landing design — Inter throughout, 400 body / 500 headings.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], display: "swap" });

const TITLE = "Poshkan | Paper Trading for Stocks, Crypto & Forex";
const DESCRIPTION =
  "Practice trading US stocks, crypto and forex with virtual money. Before you buy, see where a price sits in its year and how far it has fallen before — real closes, no opinions, no AI.";

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
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Rich-result hints for Google. Organization + WebSite establish the brand
// entity and site structure; WebApplication describes the free finance app.
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

// Landing design tokens (Nocturne). The accent is the one theming decision —
// change --lp-accent (and --lp-accent-300 for link hovers) to retheme.
const LP_TOKENS = {
  "--lp-accent": "#9184d9",
  "--lp-accent-300": "#d2cefd",
  "--lp-divider": "rgba(233, 233, 237, 0.16)",
} as React.CSSProperties;

// Page gutter — used by sections and by the hero frame's negative bleed.
const GUTTER = "clamp(20px, 5vw, 72px)";
const SECTION = "mx-auto max-w-[1200px]";

// The page is deliberately four screens: hero, the one feature that is the
// reason to sign up (with its one screenshot), three text-only cards, a short
// comparison, and the form. Feature tours with a figure per section lost the
// visitor before the form — so a new feature earns a card, not a section.

// The hero's tour of the product: seven screens of the live app, one ratio, in
// the order a new account meets them.
const TOUR: Slide[] = [
  {
    src: "/landing/tour/01-accounts.webp",
    alt: "The accounts page: the whole portfolio on top, then one paper account per market with its value, today’s move and open positions",
    caption: "Your accounts: one paper account per market, the whole portfolio on top.",
  },
  {
    src: "/landing/tour/02-stock-ideas.webp",
    alt: "A stock account: holdings on the left, and on the right a shelf of ideas drawn from the whole US market",
    caption: "A stock account: your holdings, and a shelf of ideas drawn from the whole US market.",
  },
  {
    src: "/landing/tour/03-before-you-buy.webp",
    alt: "The Before-you-buy panel for Apple inside the app: what you own, is it making money, is it healthy, is it expensive",
    caption: "Before you buy, inside the app: is it making money, is it healthy, is it expensive.",
  },
  {
    src: "/landing/tour/04-chart-news.webp",
    alt: "The Chart and news tab for Apple: the price chart, open, high, low, market cap, P/E, dividend, next earnings and the latest headlines",
    caption: "One tab over: the chart, the numbers and the news.",
  },
  {
    src: "/landing/tour/05-crypto.webp",
    alt: "A crypto account opening on the market map: every coin a block sized by its share of the market and coloured by today’s move, with the account summary below",
    caption: "A crypto account opens on the market map: every coin sized by its share, coloured by the day.",
  },
  {
    src: "/landing/tour/06-forex.webp",
    alt: "A forex account: equity, free cash and margin on top, seven major currency pairs to pick from, and an empty open-positions list",
    caption: "A forex account: seven major pairs, leverage chosen per trade, margin shown as you go.",
  },
  {
    src: "/landing/tour/07-leaderboard.webp",
    alt: "The leaderboard: every account ranked by percentage return, with trades, open positions, days active, pace and worst dip beside each",
    caption: "The leaderboard: every account by percentage return, with trades, days active, pace and worst dip.",
  },
];

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-6 flex items-center gap-[14px] text-[13px] uppercase tracking-[0.06em] text-[var(--lp-accent)]">
      <span className="h-px w-11 bg-[var(--lp-accent)]" aria-hidden />
      {children}
    </p>
  );
}

function ResearchPoint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[16.5px] font-medium leading-6">{title}</h3>
      <p className="m-0 max-w-[46ch] text-[14.5px] leading-[24px] text-[#e9e9edbd]">{children}</p>
    </div>
  );
}

function Habit({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] p-6"
      style={{
        background: "color-mix(in srgb, var(--lp-accent) 7%, transparent)",
        boxShadow: "inset 0 0 0 1px var(--lp-divider)",
      }}
    >
      <p className="mb-3 text-[13px] tabular-nums text-[var(--lp-accent)]">{n}</p>
      <h3 className="mb-2.5 text-[19px] font-medium leading-[26px]">{title}</h3>
      <p className="m-0 text-[15px] leading-[25px] text-[#e9e9edbd]">{children}</p>
    </div>
  );
}

function CompareRow({ label, cells }: { label: string; cells: [string, string, string, string] }) {
  return (
    <tr
      style={{
        backgroundImage:
          "linear-gradient(to right, transparent, var(--lp-divider) 48px, var(--lp-divider) calc(100% - 48px), transparent)",
        backgroundSize: "100% 1px",
        backgroundPosition: "bottom",
        backgroundRepeat: "no-repeat",
      }}
    >
      <td className="px-2 py-3.5 align-top text-[#e9e9eda8]">{label}</td>
      <td className="bg-[color-mix(in_srgb,var(--lp-accent)_9%,transparent)] px-2 py-3.5 align-top">{cells[0]}</td>
      <td className="px-2 py-3.5 align-top text-[#e9e9edbd]">{cells[1]}</td>
      <td className="px-2 py-3.5 align-top text-[#e9e9edbd]">{cells[2]}</td>
      <td className="px-2 py-3.5 align-top text-[#e9e9edbd]">{cells[3]}</td>
    </tr>
  );
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  // The sign-up flow (and the expired-session recovery) lives on /signup now.
  if (expired) redirect("/signup?expired=1");

  return (
    <div
      className={`${inter.className} relative min-h-screen overflow-x-clip text-[16.5px] leading-[28px] text-[#e9e9ed]`}
      style={{
        ...LP_TOKENS,
        background:
          "radial-gradient(1200px 720px at 82% -160px, rgba(43,39,65,0.78), transparent 60%), radial-gradient(1100px 800px at -10% 100%, rgba(0,0,0,0.3), transparent 55%), #161826",
      }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <RecoveryRedirect />

      {/* ── Nav ── */}
      <nav
        className={`${SECTION} flex flex-wrap items-center gap-x-7 gap-y-3 py-5`}
        style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}
      >
        <span className="flex items-center gap-2.5 text-[19px] font-medium">
          <Image src="/icons/icon-192.png" alt="" width={27} height={27} className="rounded-[7px]" />
          Poshkan
        </span>
        <div className="hidden items-center gap-7 text-[14px] md:flex">
          <a href="#research" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Before you buy</a>
          <a href="#discipline" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Discipline</a>
          <a href="#compare" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Compare</a>
          <a href="#contact" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Contact</a>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <Link href="/signup?tab=login" className="text-[14px] text-[#e9e9edad] hover:text-[var(--lp-accent-300)]">
            Log in
          </Link>
          <Link href="/signup" className={`${BTN_PRIMARY} px-4 py-2 text-[14px]`}>
            Create a free account
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        className={`${SECTION} grid grid-cols-1 items-center gap-14 pb-16 pt-[68px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]`}
        style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}
      >
        <div>
          {/* Sized so "Practice trading." stays on one line in the narrower text column. */}
          <h1 className="mb-7 ml-[-0.06em] text-[clamp(37px,3.9vw,57px)] font-medium leading-[1.08] tracking-[-0.018em]">
            {/* The trailing space keeps the two lines separate words for screen readers and search. */}
            <span className="block">Practice trading. </span>
            <span className="block text-[#e9e9eda8]">Guided, not guessing.</span>
          </h1>
          <p className="mb-7 max-w-[46ch] text-[17.5px] leading-[30px] text-[#e9e9edd1]">
            A blank practice account teaches a beginner nothing, because you still don’t know what
            to do with it. Poshkan puts the guidance beside every decision: when a price deserves
            your attention, what a real basis for a trade looks like, whether the business is worth
            owning, and how to keep your head when it falls.
          </p>
          {/* One action here. The public symbol pages are linked from the section that explains them. */}
          <div className="flex flex-wrap items-center gap-3">
            <a href="/signup" className={`${BTN_PRIMARY} px-[22px] py-3 text-[15px]`}>
              Create a free account
            </a>
          </div>
          <p className="mt-5 max-w-[46ch] text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
            US stocks, crypto and forex, virtual money only. Free while Poshkan is in beta — no card,
            no broker connection, no deposits.
          </p>
        </div>

        {/* On wide screens the tour runs past the content column to 24px from the window's right
            edge: the page gutter plus whatever margin the 1200px container leaves. */}
        <figure className="relative m-0 lg:mr-[calc(min(0px,(1200px_-_100vw)/2)_-_clamp(20px,5vw,72px)_+_24px)]">
          <div
            aria-hidden
            className="pointer-events-none absolute blur-[28px]"
            style={{
              inset: "-12% -6% -18% 6%",
              background:
                "radial-gradient(60% 60% at 50% 40%, color-mix(in srgb, var(--lp-accent) 22%, transparent), transparent 70%)",
            }}
          />
          <div className="relative">
            <HeroSlider slides={TOUR} aspect="16 / 10.4" />
          </div>
        </figure>
      </section>

      {/* ── Before you buy ── */}
      <section id="research" className={`${SECTION} pt-[24px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="mb-[52px]" style={FADE_RULE} />
        <div className="grid grid-cols-1 items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <Kicker>Before you buy</Kicker>
            <h2 className="mb-5 max-w-[20ch] text-[clamp(30px,3vw,42px)] font-medium leading-[1.15] tracking-[-0.014em]">
              A price means nothing on its own
            </h2>
            <p className="mb-8 max-w-[50ch] text-[16.5px] leading-[28px] text-[#e9e9edcc]">
              Every other simulator hands you a chart and a Buy button. Click any symbol in Poshkan
              and the first thing you see is what the number in front of you is worth knowing about
              — arithmetic over years of real closes. No opinions, no recommendations, no AI.
            </p>

            <div className="grid grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-1">
              <ResearchPoint title="Where this price sits in its own year">
                Not “+8% today” but “+8% today, and higher than on 97% of days this year.”
              </ResearchPoint>
              <ResearchPoint title="How far it falls, and whether it comes back">
                Every drop of 20% or more in ten years: how deep, how long, and whether it ever
                recovered.
              </ResearchPoint>
              <ResearchPoint title="Whether a coin is a second bet at all">
                Most altcoins move with Bitcoin almost every day. Poshkan measures it.
              </ResearchPoint>
              <ResearchPoint title="What the business earns, in plain words">
                Five years of revenue and profit, cash against debt — sentences, not a wall of ratios.
              </ResearchPoint>
            </div>

            <p className="mt-8 max-w-[50ch] text-[15px] leading-[26px] text-[#e9e9edcc]">
              No account needed to read any of it. See it for{" "}
              <a href="/symbol/NVDA" className="text-[var(--lp-accent)] underline underline-offset-4">
                NVDA
              </a>
              ,{" "}
              <a href="/symbol/AAPL" className="text-[var(--lp-accent)] underline underline-offset-4">
                AAPL
              </a>{" "}
              or{" "}
              <a href="/symbol/BTC-USD" className="text-[var(--lp-accent)] underline underline-offset-4">
                Bitcoin
              </a>
              .
            </p>
          </div>

          <figure className="m-0">
            <div className="overflow-hidden rounded-[14px] bg-[#161826]" style={{ boxShadow: SHADOW_MD }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/before-you-buy.webp"
                alt="The public NVDA page: where today’s price sits in its 12-month range, and every fall of 20% or more in ten years with how long each took to recover"
                className="block w-full"
              />
            </div>
            <figcaption className="mt-4 text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
              The live public page for NVDA: where today’s price sits in its year, and every fall of
              20% or more in ten years with how long each took to come back — computed from real
              closes, not written by anyone.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── Discipline ── */}
      <section id="discipline" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="grid grid-cols-1 items-start gap-x-14 gap-y-5 pb-10 lg:grid-cols-2">
          <div>
            <Kicker>Discipline</Kicker>
            <h2 className="m-0 max-w-[20ch] text-[clamp(28px,2.8vw,38px)] font-medium leading-[1.16] tracking-[-0.013em]">
              It slows you down at the right moments
            </h2>
          </div>
          <p className="m-0 text-[16.5px] leading-[28px] text-[#e9e9edcc]">
            No coach, no tips, no AI. The pauses a careful trader takes are built into the ticket,
            the rank and the crypto account — so they are there on the day you would rather skip
            them.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Habit n="01" title="Every leveraged trade starts with a plan">
            Long or short, the ticket walks you through which way, how big, the plan, and a check.
            Four things are scored in front of you before it opens: a stop set before entry, risk
            under 1% of your cash, reward at least 1.5× the risk, and the reason written down.
            Closed trades keep the score — expectancy per trade, and how many exits were stops
            rather than a change of mind.
          </Habit>
          <Habit n="02" title="A rank that shows what it cost">
            Every account ranked by percentage return on the money put in, so a million virtual
            dollars buys nothing but a bigger denominator. Beside each rank: trades, days active,
            pace, and the worst peak-to-trough fall on the way.
          </Habit>
          <Habit n="03" title="The whole crypto market in one picture">
            A crypto account opens on a map: every coin a block sized by its share of the market,
            coloured by the day’s move. Bitcoin is about two-thirds of it and the dollar-pegged
            coins sit grey — so you can see whether the coin you are about to buy is a separate bet
            at all.
          </Habit>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section id="compare" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="mb-[52px]" style={FADE_RULE} />
        <h2 className="mb-5 max-w-[26ch] text-[clamp(28px,2.8vw,38px)] font-medium leading-[1.16] tracking-[-0.013em]">
          Why not just use a broker’s demo?
        </h2>
        <p className="mb-10 max-w-[58ch] text-[16.5px] leading-[28px] text-[#e9e9edcc]">
          Fair question. There are three usual ways to practise, and each of them stops somewhere.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-[14.5px]">
            <thead>
              <tr
                style={{
                  backgroundImage:
                    "linear-gradient(to right, transparent, var(--lp-divider) 48px, var(--lp-divider) calc(100% - 48px), transparent)",
                  backgroundSize: "100% 1px",
                  backgroundPosition: "bottom",
                  backgroundRepeat: "no-repeat",
                }}
              >
                <th className="w-[17%] px-2 pb-3 font-normal" />
                <th className="w-[23%] px-2 pb-3 text-[12px] font-medium uppercase tracking-[0.05em] text-[var(--lp-accent)]">
                  Poshkan
                </th>
                <th className="w-[20%] px-2 pb-3 text-[12px] font-medium uppercase tracking-[0.05em] text-[#e9e9edad]">
                  Broker demo
                </th>
                <th className="w-[20%] px-2 pb-3 text-[12px] font-medium uppercase tracking-[0.05em] text-[#e9e9edad]">
                  Course simulator
                </th>
                <th className="w-[20%] px-2 pb-3 text-[12px] font-medium uppercase tracking-[0.05em] text-[#e9e9edad]">
                  Signal group
                </th>
              </tr>
            </thead>
            <tbody>
              <CompareRow
                label="Markets"
                cells={[
                  "US stocks, crypto and forex — one account each",
                  "Whatever that one broker sells",
                  "Usually stocks only",
                  "Whatever gets called out",
                ]}
              />
              <CompareRow
                label="Before you buy"
                cells={[
                  "Where the price sits in its year, how far it has fallen before, what the business earns",
                  "A chart",
                  "A lesson, not the live number",
                  "Someone’s opinion",
                ]}
              />
              <CompareRow
                label="Risk limits"
                cells={[
                  "Per trade, per position and per day — enforced",
                  "Your discretion",
                  "None",
                  "None",
                ]}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="mb-[52px]" style={FADE_RULE} />
        <div className="grid grid-cols-1 items-start gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <Kicker>Talk to us</Kicker>
            <h2 className="mb-5 max-w-[16ch] text-[clamp(30px,3vw,42px)] font-medium leading-[1.15] tracking-[-0.014em]">
              Say what you think
            </h2>
            <p className="m-0 max-w-[44ch] text-[16.5px] leading-[28px] text-[#e9e9edcc]">
              Poshkan is built by one person, and your message lands in that person’s inbox, not a
              ticket queue. What confused you, what is missing, what broke: all of it is useful.
            </p>
            <p className="mb-0 mt-6 max-w-[44ch] text-[14px] leading-[24px] text-[#e9e9ed9e]">
              Rather try it first?{" "}
              <Link href="/signup" className="text-[var(--lp-accent)] underline underline-offset-4">
                Create a free account
              </Link>
              . Free while Poshkan is in beta — no card, nothing real at stake.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={`${SECTION} pb-14 pt-16`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="mb-8" style={FADE_RULE} />
        <p className="mb-5 max-w-[88ch] text-[13.5px] leading-[23px] text-[#e9e9eda8]">
          <strong className="font-medium text-[#e9e9ede0]">Poshkan is a paper-trading simulator.</strong>{" "}
          All money, trades and returns are 100% virtual — nothing is real, nothing can be won or
          lost, and nothing here is financial advice. Market data may be delayed or inaccurate.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2.5 text-[13.5px]">
          <Link href="/how-it-works" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">How it works</Link>
          <Link href="/strategies" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Strategies</Link>
          <Link href="/learn" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Learn</Link>
          <Link href="/tools" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Calculators</Link>
          <Link href="/help" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Help</Link>
          <Link href="/terms" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Terms</Link>
          <Link href="/privacy" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
