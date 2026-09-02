import Image from "next/image";
import Link from "next/link";
import { Inter } from "next/font/google";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";
import LandingVideo from "@/components/landing/LandingVideo";
import SignupCta from "@/components/landing/SignupCta";
import InstallStrip from "@/components/landing/InstallStrip";
import { BTN_PRIMARY, BTN_SECONDARY, FADE_RULE, SHADOW_MD } from "@/components/landing/lp";

// Nocturne landing design — Inter throughout, 400 body / 500 headings.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], display: "swap" });

const TITLE = "Poshkan | Paper Trading and Strategy Lab for Stocks, Crypto & Forex";
const DESCRIPTION =
  "Build, backtest, and observe your own trading strategies with virtual money across stocks, crypto, and forex. Write the rules yourself — no code, nothing real at stake.";

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

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-6 flex items-center gap-[14px] text-[13px] uppercase tracking-[0.06em] text-[var(--lp-accent)]">
      <span className="h-px w-11 bg-[var(--lp-accent)]" aria-hidden />
      {children}
    </p>
  );
}

function Stat({ figure, label }: { figure: string; label: React.ReactNode }) {
  return (
    <div>
      <p className="mb-[14px] ml-[-0.055em] text-[clamp(36px,3.4vw,50px)] font-medium leading-[1.1]">{figure}</p>
      <p className="m-0 text-[13px] uppercase leading-5 tracking-[0.06em] text-[#e9e9edad]">{label}</p>
    </div>
  );
}

function LabStep({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div>
      <p className="mb-2.5 text-[14px] tabular-nums text-[var(--lp-accent)]">{n}</p>
      <h3 className="mb-2 text-[19px] font-medium leading-[26px]">{title}</h3>
      <p className="m-0 text-[15px] leading-[25px] text-[#e9e9edbd]">{text}</p>
    </div>
  );
}

function ScanBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2.5 text-[15.5px] leading-[25px]">
      <Check size={15} className="shrink-0 translate-y-0.5 text-[var(--lp-accent)]" aria-hidden />
      {children}
    </li>
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

function Quote({ text, name }: { text: string; name: string }) {
  return (
    <figure className="m-0">
      <blockquote className="m-0 max-w-[30ch] text-[clamp(21px,2vw,26px)] font-medium leading-[1.42] tracking-[-0.01em]">
        “{text}”
      </blockquote>
      <figcaption className="mt-6 text-[15px] leading-[26px] text-[#e9e9ed9e]">— {name}</figcaption>
    </figure>
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
          <a href="#tour" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Tour</a>
          <a href="#lab" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Strategy Lab</a>
          <a href="#record" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Your record</a>
          <a href="#compare" className="text-[#e9e9ed] hover:text-[var(--lp-accent-300)]">Compare</a>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <Link href="/signup?tab=login" className="text-[14px] text-[#e9e9edad] hover:text-[var(--lp-accent-300)]">
            Log in
          </Link>
          <a href="#start" className={`${BTN_PRIMARY} px-4 py-2 text-[14px]`}>
            Create a free account
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        className={`${SECTION} grid grid-cols-1 items-center gap-14 pb-16 pt-[68px] lg:grid-cols-[minmax(0,1.14fr)_minmax(0,1fr)]`}
        style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}
      >
        <div>
          <h1 className="mb-7 ml-[-0.06em] text-[clamp(37px,4.9vw,74px)] font-medium leading-[1.08] tracking-[-0.018em]">
            <span className="block">Practice trading.</span>
            <span className="block text-[#e9e9eda8]">Lose nothing real.</span>
          </h1>
          <p className="mb-7 max-w-[46ch] text-[17.5px] leading-[30px] text-[#e9e9edd1]">
            A paper-trading platform for US stocks, crypto and forex. Live prices, broker-style order
            mechanics, virtual money — and an honest record of every decision you make.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#start" className={`${BTN_PRIMARY} px-[22px] py-3 text-[15px]`}>
              Create a free account
            </a>
            <a href="#lab" className={`${BTN_SECONDARY} px-[22px] py-3 text-[15px]`}>
              See how a strategy is built
            </a>
          </div>
          <p className="mt-5 text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
            Free while Poshkan is in beta. No card, no broker connection, no deposits.
          </p>
        </div>

        <figure className="relative m-0" style={{ marginRight: `calc(${GUTTER} * -1)` }}>
          <div
            aria-hidden
            className="pointer-events-none absolute blur-[28px]"
            style={{
              inset: "-12% -6% -18% 6%",
              background:
                "radial-gradient(60% 60% at 50% 40%, color-mix(in srgb, var(--lp-accent) 22%, transparent), transparent 70%)",
            }}
          />
          <div
            className="relative overflow-hidden rounded-[14px] bg-[#161826]"
            style={{ aspectRatio: "16 / 10.4", boxShadow: SHADOW_MD }}
          >
            {/* Intentional zoom crop: 152% wide, top-left anchored. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/accounts.png"
              alt="Poshkan dashboard: paper accounts across stocks, crypto and forex"
              className="block"
              style={{ width: "152%", maxWidth: "none" }}
            />
          </div>
        </figure>
      </section>

      {/* ── Stat band (full-bleed) ── */}
      <section
        aria-label="Poshkan at a glance"
        style={{
          background:
            "radial-gradient(900px 420px at 85% -40%, color-mix(in srgb, #353b80 70%, transparent), transparent 64%), #262a60",
        }}
      >
        <div
          className={`${SECTION} grid grid-cols-2 gap-x-7 gap-y-[42px] py-[52px] md:grid-cols-4 md:justify-between`}
          style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}
        >
          <Stat figure="3" label={<>Markets — stocks,<br />crypto, forex</>} />
          <Stat figure="4" label={<>Steps from an idea<br />to a backtest</>} />
          <Stat figure="1–10×" label={<>Simulated leverage,<br />per trade</>} />
          <Stat figure="0" label={<>Deposits, withdrawals<br />or prize pools</>} />
        </div>
      </section>

      {/* ── Tour ── */}
      <section id="tour" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="grid grid-cols-1 items-start gap-x-14 gap-y-5 pb-10 lg:grid-cols-2">
          <div>
            <Kicker>The live app</Kicker>
            <h2 className="m-0 max-w-[20ch] text-[clamp(28px,2.8vw,38px)] font-medium leading-[1.16] tracking-[-0.013em]">
              Fifteen seconds inside Poshkan
            </h2>
          </div>
          <p className="m-0 text-[16.5px] leading-[28px] text-[#e9e9edcc]">
            Paper accounts across three markets, profit and loss moving in real time, Strategy Lab
            activity and the leaderboard. No narration, no mock-ups — this is the product as it runs.
          </p>
        </div>
        <figure className="m-0 max-w-[1000px]">
          <div className="overflow-hidden rounded-[14px] bg-[#161826]" style={{ boxShadow: SHADOW_MD }}>
            <LandingVideo
              src="/landing/paper-trading-tour.mp4"
              poster="/landing/paper-trading-tour-poster.jpg"
              ariaLabel="A tour of Poshkan: paper accounts across stocks, crypto and forex, profit and loss, and the leaderboard."
            />
          </div>
          <figcaption className="mt-4 max-w-[56ch] text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
            Real footage of the live app. Every number in it is virtual money.
          </figcaption>
        </figure>
      </section>

      {/* ── Strategy Lab ── */}
      <section id="lab" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <Kicker>Strategy Lab</Kicker>
        <h2 className="mb-6 max-w-[24ch] text-[clamp(32px,3.4vw,46px)] font-medium leading-[1.14] tracking-[-0.015em]">
          Write the rule. Let the market answer.
        </h2>
        <p className="mb-14 max-w-[62ch] text-[17px] leading-[30px] text-[#e9e9edcc]">
          State an idea as explicit entry, exit and risk rules — candles, indicators, symbols and a
          timeframe, no code. Poshkan replays the rules over completed candles, then runs them
          forward on a paper account so you can see which part of the idea actually held.
        </p>

        <div className="grid grid-cols-2 gap-x-9 gap-y-7 pb-11 md:grid-cols-4">
          <LabStep n="01" title="Define rules" text="Candle patterns, indicators, symbols and timeframe. No code." />
          <LabStep n="02" title="Set risk" text="Stop, target, maximum holding time and risk per trade." />
          <LabStep n="03" title="Backtest" text="Replay the rules on history, with trading costs applied." />
          <LabStep n="04" title="Observe" text="Follow it forward on paper and see where it breaks down." />
        </div>

        <figure className="m-0 max-w-[780px]">
          <div className="overflow-hidden rounded-[14px] bg-[#161826]" style={{ boxShadow: SHADOW_MD }}>
            <LandingVideo
              src="/landing/strategy-lab-tour.mp4"
              poster="/landing/strategy-lab-tour-poster.jpg"
              ariaLabel="Building a strategy in the Strategy Lab: setup, entry rules, exit and risk, then the test."
            />
          </div>
          <figcaption className="mt-4 max-w-[60ch] text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
            Four steps, and a rule summary that restates your logic in plain English before anything runs.
          </figcaption>
        </figure>
      </section>

      {/* ── Live ── */}
      <section id="automation" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="grid grid-cols-1 items-start gap-x-14 gap-y-7 lg:grid-cols-2">
          <div>
            <Kicker>Live</Kicker>
            <h2 className="m-0 max-w-[22ch] text-[clamp(28px,2.8vw,38px)] font-medium leading-[1.16] tracking-[-0.013em]">
              Your rules watch the market while you sleep
            </h2>
          </div>
          <div>
            <p className="mb-5 text-[16.5px] leading-[28px] text-[#e9e9edcc]">
              Set a strategy live and it keeps running on every completed candle. When a rule
              matches you get a paper alert — entry, stop, target and the reward-to-risk it asked
              for — so you see how the idea behaves on new data before you ever act on it.
            </p>
            <ul className="m-0 grid list-none gap-2.5 p-0">
              <ScanBullet>Push and email the moment a rule matches</ScanBullet>
              <ScanBullet>Entry, stop and target on every alert, with the R it promised</ScanBullet>
              <ScanBullet>A plain-English summary restates your logic before it goes live</ScanBullet>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Your record ── */}
      <section id="record" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,366px)_minmax(0,1fr)]">
          <figure className="m-0">
            <div className="overflow-hidden rounded-[14px] bg-[#161826]" style={{ boxShadow: SHADOW_MD }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/trade.png"
                alt="A closed EUR/USD trade replayed on its chart with entry, stop-loss, take-profit and reward-to-risk"
                className="block w-full"
              />
            </div>
            <figcaption className="mt-4 text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
              Every closed trade replays on its own chart — entry, stop, target, and the
              reward-to-risk the plan asked for.
            </figcaption>
          </figure>
          <div>
            <Kicker>Your record</Kicker>
            <h2 className="mb-6 max-w-[20ch] text-[clamp(30px,3vw,42px)] font-medium leading-[1.15] tracking-[-0.014em]">
              Every trade gets graded
            </h2>
            <p className="mb-10 max-w-[52ch] text-[16.5px] leading-[28px] text-[#e9e9edcc]">
              Poshkan keeps the score a demo account never shows you: win rate, profit factor,
              expectancy per trade, how many exits were stops and how many were you changing your
              mind.
            </p>
            <div className="flex flex-wrap items-start gap-7">
              <figure className="m-0 max-w-[375px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/stats.png"
                  alt="Performance panel: average win, average loss, expectancy per trade, outcomes and best and worst trade"
                  className="block w-full rounded-[10px]"
                />
                <figcaption className="mt-3 text-[13px] leading-[21px] text-[#e9e9ed9e]">
                  Expectancy and outcome mix, per account.
                </figcaption>
              </figure>
              <figure className="m-0 max-w-[375px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/coach.png"
                  alt="Coach panel reading the last twenty closed trades: stops used, typical risk, average win to loss"
                  className="block w-full rounded-[10px]"
                />
                <figcaption className="mt-3 text-[13px] leading-[21px] text-[#e9e9ed9e]">
                  Coach reads your last twenty closed trades for habits, not opinions.
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* ── Leaderboard ── */}
      <section id="leaderboard" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="grid grid-cols-1 items-start gap-x-14 gap-y-7 pb-12 lg:grid-cols-2">
          <div>
            <Kicker>Leaderboard</Kicker>
            <h2 className="m-0 max-w-[22ch] text-[clamp(28px,2.8vw,38px)] font-medium leading-[1.16] tracking-[-0.013em]">
              Ranked by percentage return, not by deposits
            </h2>
          </div>
          <p className="m-0 text-[16.5px] leading-[28px] text-[#e9e9edcc]">
            Every account is scored on percentage return on the money put into it, at live prices.
            Seeding an account with a million virtual dollars buys nothing but a bigger denominator.
            Reset your history whenever you like — the rank resets with it.
          </p>
        </div>
        <figure className="m-0 max-w-[720px]">
          <div className="overflow-hidden rounded-[14px] bg-[#161826]" style={{ boxShadow: SHADOW_MD }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/leaderboard.png"
              alt="Leaderboard: traders ranked by their best account's percentage return at live prices"
              className="block w-full"
            />
          </div>
          <figcaption className="mt-4 max-w-[56ch] text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
            Top per trader, or every account — a $13,600 crypto account outranks a $92,000 one on
            percentage return.
          </figcaption>
        </figure>

        <div className="grid grid-cols-1 gap-14 pt-14 sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <Quote
            text="The most complete and easy-to-use platform I've found for practicing trading and honestly evaluating my skills."
            name="Vahid Alizadeh, forex trader on the leaderboard"
          />
        </div>
      </section>

      {/* ── Comparison ── */}
      <section id="compare" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="mb-[52px]" style={FADE_RULE} />
        <h2 className="mb-5 max-w-[26ch] text-[clamp(28px,2.8vw,38px)] font-medium leading-[1.16] tracking-[-0.013em]">
          Why not just use a broker&apos;s demo?
        </h2>
        <p className="mb-12 max-w-[58ch] text-[16.5px] leading-[28px] text-[#e9e9edcc]">
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
                  "US stocks, crypto and forex in one account",
                  "Whatever that one broker sells",
                  "Usually stocks only",
                  "Whatever gets called out",
                ]}
              />
              <CompareRow
                label="Your own rules"
                cells={[
                  "Built from candles and indicators, no code",
                  "Not supported",
                  "Not supported",
                  "Someone else's, unexplained",
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
              <CompareRow
                label="What it's built for"
                cells={[
                  "Practice, and finding out what your idea does",
                  "Turning you into a funded customer",
                  "Coursework",
                  "Following someone else",
                ]}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Close ── */}
      <section id="start" className={`${SECTION} pt-[68px]`} style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}>
        <div className="mb-[52px]" style={FADE_RULE} />
        <h2 className="mb-5 max-w-[22ch] text-[clamp(30px,3vw,42px)] font-medium leading-[1.15] tracking-[-0.014em]">
          Start practising
        </h2>
        <p className="mb-10 max-w-[54ch] text-[16.5px] leading-[28px] text-[#e9e9edcc]">
          An email and a password is the whole sign-up. Open a paper account for stocks, crypto or
          forex, and place your first order or start a strategy in the Lab.
        </p>
        <SignupCta />
        <p className="mt-[18px] text-[13.5px] leading-[22px] text-[#e9e9ed9e]">
          Takes about a minute. Free while Poshkan is in beta — no card, nothing real at stake.
        </p>
        <InstallStrip />
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
          <Link href="/scans" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Daily scans</Link>
          <Link href="/help" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Help</Link>
          <Link href="/terms" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Terms</Link>
          <Link href="/privacy" className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-300)]">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
