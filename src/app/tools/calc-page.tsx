// Shared server-side body for every calculator page (generic and per-pair).
// Fetches the live rate (pages revalidate hourly), renders the interactive
// calculator, then SEO copy whose worked examples are computed from the same
// live numbers — so every page is unique and stays fresh.

import Link from "next/link";
import { getQuotes } from "@/lib/marketdata";
import ToolCalculator from "@/components/tools/ToolCalculator";
import {
  QUOTE_USD_SOURCE,
  TOOL_CALCS,
  TOOL_PAIRS,
  type ToolCalc,
  type ToolPair,
  fmtToolRate,
  fmtUsd,
  toolMarginUsd,
  toolPipValueUsd,
  toolPositionSize,
  toolProfit,
} from "./tools-data";

export const TOOLS_BASE = "https://www.poshkan.com/tools";

export interface ToolRates {
  rate: number;
  quoteUsd: number;
  live: boolean;
}

// Live rate for the pair plus the quote→USD conversion where the quote isn't
// USD. Falls back to typical rates so pages always render (and build offline).
export async function getToolRates(pair: ToolPair): Promise<ToolRates> {
  const src = QUOTE_USD_SOURCE[pair.quote] ?? null;
  const fallbackQuoteUsd = src ? src.fallback : 1;
  try {
    const symbols = [pair.yahoo, ...(src ? [src.yahoo] : [])];
    const quotes = await getQuotes(symbols);
    const rate = quotes[pair.yahoo.toUpperCase()]?.price;
    let quoteUsd = fallbackQuoteUsd;
    if (src) {
      const conv = quotes[src.yahoo.toUpperCase()]?.price;
      if (conv && conv > 0) quoteUsd = src.invert ? 1 / conv : conv;
    }
    if (rate && rate > 0) return { rate, quoteUsd, live: true };
  } catch {
    // fall through to the static fallback
  }
  return { rate: pair.fallbackRate, quoteUsd: fallbackQuoteUsd, live: false };
}

interface Section {
  explainTitle: string;
  explain: string[];
  faq: { q: string; a: string }[];
}

function sections(calc: ToolCalc, pair: ToolPair, r: ToolRates): Section {
  const gold = pair.base === "XAU";
  const jpy = pair.quote === "JPY";
  const rateS = fmtToolRate(r.rate, pair);
  const unitWord = gold ? "oz" : pair.base;
  const lotDesc = `${pair.contractSize.toLocaleString("en-US")} ${unitWord}`;
  const pipDesc = gold
    ? "a $0.10 move in the gold price"
    : jpy
      ? `a 0.01 move — the second decimal place of the ${pair.name} rate`
      : `a 0.0001 move — the fourth decimal place of the ${pair.name} rate`;
  const pipStd = toolPipValueUsd(pair.contractSize, pair, r.quoteUsd);
  const pipMini = toolPipValueUsd(pair.contractSize / 10, pair, r.quoteUsd);

  if (calc.slug === "pip-calculator") {
    return {
      explainTitle: `How ${pair.name} pip value is calculated`,
      explain: [
        `On ${pair.name}${pair.nickname ? ` (${pair.nickname})` : ""}, one pip is ${pipDesc}. The dollar value of that pip depends only on your position size${pair.quote === "USD" ? `, because the pair is quoted in US dollars` : `, converted to USD at the current ${pair.quote} rate`}.`,
        `The formula: pip value = position size × pip size${pair.quote === "USD" ? "" : " × (quote currency → USD)"}. For one standard lot (${lotDesc}) at today's rate of ${rateS}, that works out to about $${fmtUsd(pipStd)} per pip — $${fmtUsd(pipMini)} for a mini lot, and $${fmtUsd(pipStd / 100)} for a micro lot.`,
        `Knowing your pip value is the first step of risk management: a 30-pip stop-loss on one standard lot puts about $${fmtUsd(pipStd * 30)} at risk. If that number is bigger than you expected, size down — not the other way around.`,
      ],
      faq: [
        {
          q: `How much is 1 pip worth on ${pair.name}?`,
          a: `About $${fmtUsd(pipStd)} per standard lot (${lotDesc}), $${fmtUsd(pipMini)} per mini lot, and $${fmtUsd(pipStd / 100)} per micro lot at the current rate of ${rateS}.`,
        },
        {
          q: `What is the pip size on ${pair.name}?`,
          a: gold
            ? `For gold, 1 pip is conventionally a $0.10 move in the price, so a $1.00 move is 10 pips.`
            : `1 pip on ${pair.name} is ${pair.pipSize} — the ${jpy ? "second" : "fourth"} decimal place of the quoted rate.`,
        },
        {
          q: `Does ${pair.name} pip value change over time?`,
          a:
            pair.quote === "USD"
              ? `No — because ${pair.name} is quoted in US dollars, pip value is fixed: it depends only on your position size, not on the rate.`
              : `Yes, slightly — the pip is worth a fixed amount of ${pair.quote}, so its dollar value moves with the ${pair.quote}/USD exchange rate.`,
        },
      ],
    };
  }

  if (calc.slug === "position-size-calculator") {
    const ex = toolPositionSize(10_000, 1, 25, pair, r.quoteUsd);
    return {
      explainTitle: `How ${pair.name} position size is calculated`,
      explain: [
        `Position sizing answers the only question that keeps accounts alive: "how big can this trade be so that if my stop-loss hits, I lose only what I planned?" You pick a risk percentage (most traders use 0.5–2%), measure your stop-loss distance in pips, and the lot size follows.`,
        `The formula: position size = (balance × risk %) ÷ (stop-loss in pips × pip value per unit). Example on ${pair.name}: with a $10,000 account risking 1% ($100) and a 25-pip stop, the right size is ${ex.lots.toFixed(2)} lots (${Math.round(ex.units).toLocaleString("en-US")} ${unitWord}) at today's rates.`,
        `Note what's not in the formula: leverage. Leverage decides how much margin the position ties up — it never decides how much you should risk. Size the trade from your stop-loss first, then check the margin fits.`,
      ],
      faq: [
        {
          q: `What lot size should I trade on ${pair.name} with a $10,000 account?`,
          a: `Risking 1% with a 25-pip stop-loss: about ${ex.lots.toFixed(2)} lots. The calculator recomputes this instantly for your own balance, risk percent and stop distance.`,
        },
        {
          q: `What is a good risk percentage per trade?`,
          a: `Most risk-management guides suggest 0.5–2% of the account per trade. At 1%, a losing streak of 10 trades draws the account down roughly 10% — survivable; at 10% per trade the same streak is fatal.`,
        },
        {
          q: `Does higher leverage let me take a bigger position?`,
          a: `It lets you, but it shouldn't. Leverage only reduces the margin locked up by the trade. Your position size should come from your stop-loss and risk percent — the same answer at 30:1 or 500:1.`,
        },
      ],
    };
  }

  if (calc.slug === "margin-calculator") {
    const ex30 = toolMarginUsd(pair.contractSize, r.rate, 30, pair, r.quoteUsd);
    const ex500 = toolMarginUsd(pair.contractSize, r.rate, 500, pair, r.quoteUsd);
    return {
      explainTitle: `How ${pair.name} margin is calculated`,
      explain: [
        `Margin is the deposit your broker locks up while a leveraged position is open. It isn't a fee — you get it back when the trade closes — but it caps how much you can have open at once.`,
        `The formula: margin = position value in USD ÷ leverage. One standard lot of ${pair.name} (${lotDesc}) is worth about $${fmtUsd(ex30.notionalUsd, 0)} at today's rate of ${rateS}, so it requires roughly $${fmtUsd(ex30.marginUsd)} of margin at 30:1 — or as little as $${fmtUsd(ex500.marginUsd)} at 500:1.`,
        `The catch: less margin per trade means less buffer. If floating losses eat through your free margin, the position is force-closed (a "stop-out") at the worst possible moment. That's why high leverage blows up accounts — not the leverage itself, but the thin cushion it leaves.`,
      ],
      faq: [
        {
          q: `How much margin do I need for 1 lot of ${pair.name}?`,
          a: `At the current rate of ${rateS}: about $${fmtUsd(ex30.marginUsd)} at 30:1 leverage, $${fmtUsd(toolMarginUsd(pair.contractSize, r.rate, 100, pair, r.quoteUsd).marginUsd)} at 100:1, and $${fmtUsd(ex500.marginUsd)} at 500:1.`,
        },
        {
          q: `What leverage can retail traders actually get?`,
          a: `EU and UK regulators cap retail forex leverage at 30:1 on major pairs. Offshore brokers advertise 500:1 or more — which shrinks margin but makes stop-outs dramatically easier to hit.`,
        },
        {
          q: `What happens when I run out of margin?`,
          a: `The broker force-closes your position (a margin stop-out), locking in the loss. It's worth experiencing once with virtual money — Poshkan simulates the full margin and stop-out mechanics with zero real risk.`,
        },
      ],
    };
  }

  // profit-calculator
  const ex = toolProfit("LONG", pair.contractSize, r.rate, r.rate + 50 * pair.pipSize, pair, r.quoteUsd);
  return {
    explainTitle: `How ${pair.name} profit is calculated`,
    explain: [
      `A trade's result is just the distance between entry and exit, multiplied by the position size: profit = (exit − entry) × units${pair.quote === "USD" ? "" : `, converted from ${pair.quote} to USD`}. Long trades profit when price rises; shorts profit when it falls.`,
      `Example: buying one standard lot of ${pair.name} (${lotDesc}) at ${rateS} and closing 50 pips higher earns about $${fmtUsd(ex.profitUsd)}. The same move against you costs the same amount — the math is perfectly symmetric.`,
      `Traders usually think in pips first, dollars second: a strategy that averages "+30 pips per winner, −15 per loser" can be sized to any account. Use the pip result to judge the trade, the dollar result to judge the position size.`,
    ],
    faq: [
      {
        q: `How much is 50 pips worth on ${pair.name}?`,
        a: `About $${fmtUsd(ex.profitUsd)} on one standard lot, $${fmtUsd(ex.profitUsd / 10)} on a mini lot, and $${fmtUsd(ex.profitUsd / 100)} on a micro lot at current rates.`,
      },
      {
        q: `How do I calculate profit on a short ${pair.name} trade?`,
        a: `Same formula, flipped: profit = (entry − exit) × units. If you sell at ${rateS} and price drops 50 pips, you earn the same ~$${fmtUsd(ex.profitUsd)} per standard lot as a winning long.`,
      },
      {
        q: `Does this include spread and commission?`,
        a: `No — it computes the raw price move. In live trading the spread is paid on entry, so your realized result is a pip or two less than the chart distance. Practicing on a simulator makes that difference easy to see.`,
      },
    ],
  };
}

export function CalcPageBody({
  calc,
  pair,
  rates,
  isGeneric,
}: {
  calc: ToolCalc;
  pair: ToolPair;
  rates: ToolRates;
  isGeneric?: boolean; // the /tools/[calc] page: same body, pair-picker on top
}) {
  const s = sections(calc, pair, rates);
  const otherPairs = TOOL_PAIRS.filter((p) => p.slug !== pair.slug);
  const otherCalcs = TOOL_CALCS.filter((c) => c.slug !== calc.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: s.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Poshkan", item: "https://www.poshkan.com" },
          { "@type": "ListItem", position: 2, name: "Calculators", item: TOOLS_BASE },
          ...(isGeneric
            ? [{ "@type": "ListItem", position: 3, name: calc.name }]
            : [
                { "@type": "ListItem", position: 3, name: calc.name, item: `${TOOLS_BASE}/${calc.slug}` },
                { "@type": "ListItem", position: 4, name: pair.name },
              ]),
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-foreground hover:underline">Poshkan</Link>
        {" / "}
        <Link href="/tools" className="hover:text-foreground hover:underline">Calculators</Link>
        {!isGeneric && (
          <>
            {" / "}
            <Link href={`/tools/${calc.slug}`} className="hover:text-foreground hover:underline">
              {calc.name}
            </Link>
          </>
        )}
      </nav>

      <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">
        {calc.icon} {isGeneric ? `Forex ${calc.name}` : `${pair.name} ${calc.name}`}
      </h1>
      <p className="mb-6 text-lg text-muted">
        {isGeneric ? calc.genericDescription : calc.seoDescription(pair)}
      </p>

      {isGeneric && (
        <div className="mb-6 flex flex-wrap gap-2">
          {TOOL_PAIRS.map((p) => (
            <Link
              key={p.slug}
              href={`/tools/${calc.slug}/${p.slug}`}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                p.slug === pair.slug
                  ? "border-primary bg-primary/10 font-semibold"
                  : "border-border text-muted hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      <ToolCalculator
        calc={calc.slug}
        pairSlug={pair.slug}
        initialRate={rates.rate}
        quoteUsd={rates.quoteUsd}
        live={rates.live}
      />

      <div className="mt-10 space-y-4 text-sm leading-relaxed text-muted [&_strong]:text-foreground">
        <h2 className="text-lg font-bold text-foreground">{s.explainTitle}</h2>
        {s.explain.map((p, i) => (
          <p key={i}>{p}</p>
        ))}

        <h2 className="pt-4 text-lg font-bold text-foreground">Frequently asked questions</h2>
        <dl className="space-y-4">
          {s.faq.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold text-foreground">{f.q}</dt>
              <dd className="mt-1">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* CTA */}
      <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <h2 className="font-semibold">Put the numbers into practice — with virtual money</h2>
        <p className="mt-1 text-sm text-muted">
          Poshkan gives you a free paper-trading account with leveraged {pair.base === "XAU" ? "gold and forex" : "forex"},
          live rates, stop-losses, margin and stop-outs — the full mechanics, zero real risk. Size a{" "}
          {pair.name} trade with this calculator, then place it and watch it play out.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Create a free account
        </Link>
      </div>

      {/* Cross-links */}
      <div className="mt-10 space-y-6">
        {!isGeneric && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">More {pair.name} calculators</h2>
            <div className="flex flex-wrap gap-2">
              {otherCalcs.map((c) => (
                <Link
                  key={c.slug}
                  href={`/tools/${c.slug}/${pair.slug}`}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-primary/50 hover:text-foreground"
                >
                  {c.icon} {pair.name} {c.name}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">{calc.name} for other pairs</h2>
          <div className="flex flex-wrap gap-2">
            {otherPairs.map((p) => (
              <Link
                key={p.slug}
                href={`/tools/${calc.slug}/${p.slug}`}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-primary/50 hover:text-foreground"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-10 border-t border-border pt-4 text-xs text-muted">
        Rates refresh hourly and may be delayed — results are estimates for education, not financial
        advice. Poshkan is a paper-trading simulator: all money, trades, and returns are 100% virtual.
      </p>
    </main>
  );
}
