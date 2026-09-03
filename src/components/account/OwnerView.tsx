"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Fundamentals } from "@/lib/fundamentals";
import type { Drawdown, PriceContext } from "@/lib/price-context";
import type { BitcoinComparison } from "@/lib/bitcoin-comparison";
import { formatCompactUSD, formatCurrency } from "@/lib/format";

// The Owner's View: what a long-term holder wants to know about the thing they
// own, in plain sentences computed from free data. No AI, no recommendations —
// evidence, laid out so a beginner can judge whether today's price is a good
// one and what owning this has felt like before.

interface Payload {
  fundamentals: Fundamentals | null;
  priceContext: PriceContext | null;
  bitcoin: BitcoinComparison | null;
}

// This view lives behind a tab, so it is mounted and unmounted every time the
// user switches back and forth. Keep what we already fetched for the life of
// the page so the second visit is instant.
const seen = new Map<string, Payload | null>();

export default function OwnerView({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Payload | null | "loading">(() =>
    seen.has(symbol) ? (seen.get(symbol) as Payload | null) : "loading"
  );

  useEffect(() => {
    if (seen.has(symbol)) {
      setData(seen.get(symbol) as Payload | null);
      return;
    }
    let active = true;
    setData("loading");
    fetch(`/api/fundamentals?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Payload>) : null))
      .then((j) => {
        seen.set(symbol, j);
        if (active) setData(j);
      })
      .catch(() => active && setData(null));
    return () => {
      active = false;
    };
  }, [symbol]);

  // This tab opens first, so its loading state is the first thing anyone sees
  // on a symbol. Show the shape of what is coming rather than a line of text.
  if (data === "loading") {
    return (
      <section className="mt-4 grid animate-pulse gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`rounded-lg border border-border bg-background px-3 py-2.5 ${i < 2 ? "sm:col-span-2" : ""}`}
          >
            <div className="h-3 w-40 rounded bg-border" />
            <div className="mt-3 h-1.5 w-full rounded-full bg-border" />
            <div className="mt-3 h-2.5 w-full rounded bg-border" />
            <div className="mt-1.5 h-2.5 w-4/5 rounded bg-border" />
          </div>
        ))}
      </section>
    );
  }
  if (!data || (!data.fundamentals && !data.priceContext)) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted">
        No background information is available for {symbol}. The Chart &amp; news tab still has its price and
        chart.
      </div>
    );
  }
  const f = data.fundamentals;
  const p = data.priceContext;
  const showMoney = !!f?.money?.years.length;
  const showHealth = !!f?.health && (f.health.cash != null || f.health.debt != null || f.health.freeCashflow != null);
  const showValue = !!f?.valuation && (f.valuation.pe != null || f.valuation.forwardPe != null || !!f.valuation.dividendYield);
  const showOthers = !!(f?.analysts || f?.insiders);

  return (
    <section className="mt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {p && <PriceCard p={p} />}
        {p && <DrawdownCard p={p} />}
        {data.bitcoin && <BitcoinCard b={data.bitcoin} symbol={symbol} />}
        {f && <WhatCard f={f} />}
        {f && showMoney && <MoneyCard f={f} />}
        {f && showHealth && <HealthCard f={f} />}
        {f && showValue && <ValueCard f={f} />}
        {f && showOthers && <OthersCard f={f} />}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Free data from Yahoo Finance, refreshed daily. This is evidence about{" "}
        {f?.kind === "crypto" ? "this coin" : "the business"} and its price history, not a recommendation.
      </p>
    </section>
  );
}

/* ---------- cards ---------- */

function PriceCard({ p }: { p: PriceContext }) {
  const y = p.year;
  const a = p.all;
  const pos = y && y.high > y.low ? ((p.price - y.low) / (y.high - y.low)) * 100 : null;
  const window = y && y.days < 240 ? `the ${y.days} trading days we have` : "the past year";
  return (
    <Card title="Where the price sits" accent="blue" className="sm:col-span-2">
      {y && (
        <>
          <div className="mt-1">
            <div className="relative h-1.5 rounded-full bg-border">
              {pos != null && (
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
                  style={{ left: `${clamp(pos, 0, 100)}%` }}
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>
                Low {px(y.low)} · {monthYear(y.lowDate)}
              </span>
              <span>
                High {px(y.high)} · {monthYear(y.highDate)}
              </span>
            </div>
          </div>
          <p>
            Today’s price is <B>{pct(y.aboveLowPct)} above</B> the lowest point of {window} and{" "}
            <B>{pct(y.belowHighPct)} below</B> the highest.
          </p>
          <p>
            Over {window} it was cheaper than today on <B>{share(y.percentile)}</B> of days and more expensive on{" "}
            <B>{share(100 - y.percentile)}</B>.
            {a && p.years >= 2 && (
              <>
                {" "}
                Over the last {yearsText(p.years)}: cheaper on <B>{share(a.percentile)}</B> of days.
              </>
            )}
          </p>
        </>
      )}
      {p.vs200dPct != null && (
        <p className="text-muted">
          {Math.abs(p.vs200dPct) < 0.5
            ? "Right at"
            : `${pct(Math.abs(p.vs200dPct))} ${p.vs200dPct > 0 ? "above" : "below"}`}{" "}
          its average price of the last 200 trading days.
        </p>
      )}
    </Card>
  );
}

function DrawdownCard({ p }: { p: PriceContext }) {
  const d = p.drawdowns;
  const yrs = yearsText(p.years);
  const cur = d.current;
  const inOne = !!cur && cur.depthPct >= d.thresholdPct;
  const recovered = d.episodes.filter((e) => e.recoveredDate != null).length;
  return (
    <Card title="How bad does it get" accent="amber" className="sm:col-span-2">
      {d.count === 0 ? (
        <p>
          Has not fallen {d.thresholdPct}% from a peak in the {yrs} of history we have.
        </p>
      ) : (
        <p>
          Fell{" "}
          <B>
            {d.thresholdPct}% or more {times(d.count)}
          </B>{" "}
          in {yrs}. The deepest fall was <B>{pct(d.maxDepthPct ?? 0)}</B>
          {d.longestMonthsToRecover != null && (
            <>
              ; the longest took <B>{months(d.longestMonthsToRecover)}</B> to get back to its peak
            </>
          )}
          .{" "}
          {d.allRecovered ? (
            <B>Every one recovered.</B>
          ) : recovered === 0 ? (
            "None has recovered yet."
          ) : (
            `${recovered} of ${d.count} have recovered so far.`
          )}
        </p>
      )}
      {cur && (
        <p className="text-muted">
          {inOne ? (
            <>
              It is in one now: <B>{pct(cur.depthPct)} below</B> the {monthYear(cur.peakDate)} peak.
            </>
          ) : (
            <>
              Now {pct(cur.depthPct)} below the {monthYear(cur.peakDate)} peak.
            </>
          )}
        </p>
      )}
      {d.episodes.length > 0 && <EpisodeList episodes={d.episodes} maxDepth={d.maxDepthPct ?? 100} />}
    </Card>
  );
}

function EpisodeList({ episodes, maxDepth }: { episodes: Drawdown[]; maxDepth: number }) {
  const shown = [...episodes].reverse().slice(0, 6);
  const earlier = episodes.length - shown.length;
  return (
    <div className="mt-1 space-y-1">
      {shown.map((e) => (
        <div key={e.peakDate} className="grid grid-cols-[4.5rem_1fr_3rem_auto] items-center gap-2 text-xs">
          <span className="text-muted">{monthYear(e.peakDate)}</span>
          <div className="h-1.5 rounded-full bg-border">
            <div
              className="h-full rounded-full bg-foreground/50"
              style={{ width: `${Math.max(4, (e.depthPct / maxDepth) * 100)}%` }}
            />
          </div>
          <span className="text-right tabular-nums">−{Math.round(e.depthPct)}%</span>
          <span className="text-muted">
            {e.monthsToRecover != null ? `back in ${months(e.monthsToRecover)}` : "not back yet"}
          </span>
        </div>
      ))}
      {earlier > 0 && <div className="text-[11px] text-muted">and {earlier} earlier</div>}
    </div>
  );
}

function BitcoinCard({ b, symbol }: { b: BitcoinComparison; symbol: string }) {
  const ticker = symbol.split("-")[0];
  const same = b.sameDirectionPct;
  // A stablecoin correlates with nothing because it barely moves; say that
  // instead of reporting a meaningless correlation.
  const pegged = b.dailyMovePct < 0.5 && Math.abs(b.beta) < 0.15;

  let verdict: ReactNode;
  if (pegged) {
    verdict = (
      <>
        It barely moves at all. This one tracks the dollar rather than the crypto market.
      </>
    );
  } else if (b.correlation >= 0.75) {
    verdict = (
      <>
        Holding {ticker} next to Bitcoin is close to <B>holding more Bitcoin</B>. It is one bet, not two.
      </>
    );
  } else if (b.correlation >= 0.45) {
    verdict = <>It follows Bitcoin most of the time, though not always.</>;
  } else {
    verdict = <>It goes its own way more often than most coins do.</>;
  }

  return (
    <Card title="Is this a separate bet from Bitcoin?" accent="orange" className="sm:col-span-2">
      <div className="mt-1">
        <div className="relative h-1.5 rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${clamp(same, 0, 100)}%` }}
          />
          <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/40" style={{ left: "50%" }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>Moves with Bitcoin {Math.round(same)}% of days</span>
          <span>50% would be a coin flip</span>
        </div>
      </div>
      <p>
        Over the last {b.days} trading days, {ticker} closed the same direction as Bitcoin on{" "}
        <B>{Math.round(same)}% of days</B>.
        {!pegged && (
          <>
            {" "}
            When Bitcoin moves 1%, {ticker} moves about <B>{b.beta.toFixed(1)}%</B>.
          </>
        )}
      </p>
      {b.worstDays && !pegged && (
        <p>
          On Bitcoin’s <B>{b.worstDays.count} worst days</B> of that year, Bitcoin fell{" "}
          {Math.abs(b.worstDays.bitcoinAvgPct).toFixed(1)}% on average and {ticker}{" "}
          {b.worstDays.coinAvgPct < 0 ? "fell" : "rose"}{" "}
          <B>{Math.abs(b.worstDays.coinAvgPct).toFixed(1)}%</B>.
        </p>
      )}
      <p className="text-muted">{verdict}</p>
    </Card>
  );
}

function WhatCard({ f }: { f: Fundamentals }) {
  const [more, setMore] = useState(false);
  if (f.kind === "crypto") {
    const c = f.crypto;
    const minted = c?.circulatingSupply && c?.maxSupply ? (c.circulatingSupply / c.maxSupply) * 100 : null;
    return (
      <Card title="What you own">
        <p>
          <B>{f.name ?? f.symbol}</B>
          {f.marketCap ? <> · {formatCompactUSD(f.marketCap)} in total</> : null}
        </p>
        {c?.circulatingSupply ? (
          <p>
            {compact(c.circulatingSupply)} coins exist
            {c.maxSupply && minted != null ? (
              <>
                {" "}
                of a maximum {compact(c.maxSupply)} ({pct(minted)} already issued)
              </>
            ) : (
              " and there is no fixed maximum"
            )}
            .
          </p>
        ) : null}
        {c?.volume24h ? <p className="text-muted">{formatCompactUSD(c.volume24h)} traded in the last 24 hours.</p> : null}
      </Card>
    );
  }

  const bits = [f.profile?.sector, f.profile?.industry].filter(Boolean).join(" · ");
  const summary = f.profile?.summary;
  if (!f.name && !bits && !summary) return null;
  const cut = 220;
  const short = summary && summary.length > cut ? summary.slice(0, cut).replace(/\s+\S*$/, "") + "…" : summary;
  return (
    <Card title="What you own">
      <p>
        <B>{f.name ?? f.symbol}</B>
        {bits ? <> · {bits}</> : null}
        {f.marketCap ? (
          <>
            {" "}
            · {sizeWord(f.marketCap)} worth {formatCompactUSD(f.marketCap)}
          </>
        ) : null}
      </p>
      {summary && (
        <p className="text-muted">
          {more ? summary : short}
          {summary.length > cut && (
            <button type="button" onClick={() => setMore(!more)} className="ml-1 text-primary hover:underline">
              {more ? "less" : "more"}
            </button>
          )}
        </p>
      )}
    </Card>
  );
}

function MoneyCard({ f }: { f: Fundamentals }) {
  const money = f.money!;
  const years = money.years;
  const last = years[years.length - 1];
  const revs = years.map((y) => y.revenue);
  let ups = 0;
  let pairs = 0;
  for (let i = 1; i < revs.length; i++) {
    const a = revs[i - 1];
    const b = revs[i];
    if (a == null || b == null) continue;
    pairs++;
    if (b > a) ups++;
  }
  const max = Math.max(1, ...years.flatMap((y) => [y.revenue ?? 0, Math.abs(y.netIncome ?? 0)]));
  const h = (v: number | null) => (v == null ? 0 : (Math.abs(v) / max) * 100);
  const margin = money.profitMargin;
  return (
    <Card title="Is it making money?" accent="emerald">
      <div className="flex items-end gap-2">
        {years.map((y) => (
          <div key={y.year} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex h-16 w-full items-end justify-center gap-0.5">
              <div
                title={`Revenue ${formatCompactUSD(y.revenue)}`}
                className="w-2/5 rounded-t bg-muted/40"
                style={{ height: `${h(y.revenue)}%` }}
              />
              <div
                title={`Profit ${formatCompactUSD(y.netIncome)}`}
                className={`w-2/5 rounded-t ${y.netIncome != null && y.netIncome < 0 ? "bg-negative/60" : "bg-primary"}`}
                style={{ height: `${h(y.netIncome)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted">{y.year}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-muted/40 align-middle" /> revenue
        <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-sm bg-primary align-middle" /> profit
      </p>
      <p>
        {last.revenue != null && (
          <>
            Sales of <B>{formatCompactUSD(last.revenue)}</B> in {last.year}
          </>
        )}
        {last.netIncome != null && (
          <>
            {last.revenue != null ? ", " : `In ${last.year}, `}
            {last.netIncome >= 0 ? (
              <>
                {last.revenue != null ? "with " : "made "}
                <B>{formatCompactUSD(last.netIncome)}</B> of profit
              </>
            ) : (
              <>
                {last.revenue != null ? "and " : ""}
                <B>a loss of {formatCompactUSD(Math.abs(last.netIncome))}</B>
              </>
            )}
          </>
        )}
        {(last.revenue != null || last.netIncome != null) && "."}
        {pairs > 0 && (
          <>
            {" "}
            Sales grew in{" "}
            <B>
              {ups} of the last {pairs} {pairs === 1 ? "year" : "years"}
            </B>
            .
          </>
        )}
      </p>
      {margin != null && margin > 0 && (
        <p className="text-muted">Keeps about {Math.round(margin * 100)} cents of every dollar of sales as profit.</p>
      )}
      {margin != null && margin <= 0 && <p className="text-muted">Loses money on its sales at the moment.</p>}
    </Card>
  );
}

function HealthCard({ f }: { f: Fundamentals }) {
  const { cash, debt, freeCashflow: fcf } = f.health!;
  const rows: [string, number][] = [];
  if (cash != null) rows.push(["Cash", cash]);
  if (debt != null) rows.push(["Debt", debt]);
  if (fcf != null) rows.push(["Free cash flow / yr", fcf]);
  const max = Math.max(1, ...rows.map(([, v]) => Math.abs(v)));

  let verdict: ReactNode = null;
  if (fcf != null && debt != null) {
    if (fcf <= 0) {
      verdict = (
        <>
          Free cash flow is <B>negative</B>: the business spends more cash than it brings in
          {cash != null ? <>, with {formatCompactUSD(cash)} in the bank</> : null}.
        </>
      );
    } else if (debt <= 0) {
      verdict = (
        <>
          <B>No debt</B>, and {formatCompactUSD(fcf)} of free cash a year.
        </>
      );
    } else if (fcf >= debt) {
      verdict = (
        <>
          Generates more free cash in a year (<B>{formatCompactUSD(fcf)}</B>) than it owes in total (
          <B>{formatCompactUSD(debt)}</B>).
        </>
      );
    } else {
      verdict = (
        <>
          Would need about <B>{yearsOf(debt / fcf)}</B> of free cash flow to repay all its debt.
        </>
      );
    }
  } else if (cash != null && debt != null) {
    verdict =
      cash >= debt ? (
        <>
          Holds more cash ({formatCompactUSD(cash)}) than debt ({formatCompactUSD(debt)}).
        </>
      ) : (
        <>
          Holds {formatCompactUSD(cash)} of cash against {formatCompactUSD(debt)} of debt.
        </>
      );
  }

  return (
    <Card title="Is it healthy?" accent="teal">
      <div className="space-y-1">
        {rows.map(([label, v]) => (
          <div key={label} className="grid grid-cols-[7.5rem_1fr_4rem] items-center gap-2 text-xs">
            <span className="text-muted">{label}</span>
            <div className="h-1.5 rounded-full bg-border">
              <div
                className={`h-full rounded-full ${v < 0 ? "bg-negative/60" : label === "Debt" ? "bg-foreground/40" : "bg-primary"}`}
                style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%` }}
              />
            </div>
            <span className="text-right tabular-nums">{formatCompactUSD(v)}</span>
          </div>
        ))}
      </div>
      {verdict && <p>{verdict}</p>}
    </Card>
  );
}

function ValueCard({ f }: { f: Fundamentals }) {
  const v = f.valuation!;
  const pe = v.pe != null && v.pe > 0 ? v.pe : null;
  const fpe = v.forwardPe != null && v.forwardPe > 0 ? v.forwardPe : null;
  const yieldPct = v.dividendYield ? (v.dividendYield > 1 ? v.dividendYield : v.dividendYield * 100) : 0;
  return (
    <Card title="Is it expensive?" accent="fuchsia">
      {pe ? (
        <p>
          You pay <B>${pe.toFixed(0)}</B> for every $1 of last year’s profit
          {fpe ? (
            <>
              , and <B>${fpe.toFixed(0)}</B> for every $1 of profit expected next year
            </>
          ) : null}
          .
        </p>
      ) : fpe ? (
        <p>
          Not profitable over the last year. You pay <B>${fpe.toFixed(0)}</B> for every $1 of profit expected next year.
        </p>
      ) : (
        <p>No price-to-earnings figure: the business has no profit to measure against.</p>
      )}
      <p className="text-muted">
        A high number means buyers expect growth; a low one means they expect little, or fear trouble. Large US
        companies have averaged roughly 15–20 over the decades.
      </p>
      {yieldPct > 0 ? (
        <p>
          Pays <B>{yieldPct.toFixed(2)}%</B> a year in dividends at today’s price
          {f.events?.exDividend ? <> · next ex-dividend {shortDate(f.events.exDividend)}</> : null}.
        </p>
      ) : (
        <p>Pays no dividend.</p>
      )}
    </Card>
  );
}

function OthersCard({ f }: { f: Fundamentals }) {
  const a = f.analysts;
  const i = f.insiders;
  const total = a ? a.strongBuy + a.buy + a.hold + a.sell + a.strongSell : 0;
  const segments: [number, string][] = a
    ? [
        [a.strongBuy, "bg-primary"],
        [a.buy, "bg-primary/60"],
        [a.hold, "bg-muted/40"],
        [a.sell, "bg-foreground/25"],
        [a.strongSell, "bg-foreground/50"],
      ]
    : [];
  return (
    <Card title="What others are doing" accent="violet">
      {a && total > 0 && (
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-border">
            {segments.map(([n, cls], k) =>
              n > 0 ? <div key={k} className={cls} style={{ width: `${(n / total) * 100}%` }} /> : null
            )}
          </div>
          <p>
            {total} analysts: <B>{a.strongBuy + a.buy} say buy</B>, {a.hold} hold, {a.sell + a.strongSell} sell.
            {a.targetMean != null && (
              <>
                {" "}
                Their average 12-month target is <B>{px(a.targetMean)}</B>
                {a.targetLow != null && a.targetHigh != null ? (
                  <>
                    {" "}
                    (range {px(a.targetLow)}–{px(a.targetHigh)})
                  </>
                ) : null}
                .
              </>
            )}
          </p>
        </>
      )}
      {i && (
        <p>
          Insiders made{" "}
          <B>
            {i.buys6m} {plural(i.buys6m, "purchase")}
          </B>{" "}
          and{" "}
          <B>
            {i.sells6m} {plural(i.sells6m, "sale")}
          </B>{" "}
          in the last 6 months.
          {i.sells6m > 0 && i.buys6m === 0 && (
            <span className="text-muted">
              {" "}
              Executives routinely sell shares they were paid in; buying with their own money is the rarer signal.
            </span>
          )}
        </p>
      )}
    </Card>
  );
}

/* ---------- bits ---------- */

// Eight cards of grey-on-black read as one wall of text. Each question gets its
// own tint and heading colour so the eye can find its way back to a card, and
// so the section looks worth reading rather than like a terms-of-service page.
type Accent = "blue" | "amber" | "orange" | "neutral" | "emerald" | "teal" | "violet" | "fuchsia";

const SURFACE: Record<Accent, string> = {
  blue: "border-blue-500/30 bg-blue-500/10",
  amber: "border-amber-500/30 bg-amber-500/10",
  orange: "border-orange-500/30 bg-orange-500/10",
  neutral: "border-border bg-background",
  emerald: "border-emerald-500/30 bg-emerald-500/10",
  teal: "border-teal-500/30 bg-teal-500/10",
  violet: "border-violet-500/30 bg-violet-500/10",
  fuchsia: "border-fuchsia-500/30 bg-fuchsia-500/10",
};

const HEADING: Record<Accent, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  amber: "text-amber-600 dark:text-amber-400",
  orange: "text-orange-600 dark:text-orange-400",
  neutral: "text-muted",
  emerald: "text-emerald-600 dark:text-emerald-400",
  teal: "text-teal-600 dark:text-teal-400",
  violet: "text-violet-600 dark:text-violet-400",
  fuchsia: "text-fuchsia-600 dark:text-fuchsia-400",
};

function Card({
  title,
  accent = "neutral",
  children,
  className = "",
}: {
  title: string;
  accent?: Accent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border px-3.5 py-3 ${SURFACE[accent]} ${className}`}>
      <div className={`text-[13px] font-semibold ${HEADING[accent]}`}>{title}</div>
      <div className="mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function B({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Math.round(v)}%`;
const share = (v: number) => (v >= 99.5 ? "more than 99%" : v < 0.5 ? "less than 1%" : `${Math.round(v)}%`);
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}
function months(m: number): string {
  if (m < 1) return "under a month";
  if (m >= 24) return `${(m / 12).toFixed(1)} years`;
  const r = Math.round(m);
  return `${r} ${plural(r, "month")}`;
}
function yearsOf(y: number): string {
  if (y < 1) return "under a year";
  const r = y < 10 ? Math.round(y * 10) / 10 : Math.round(y);
  return `${r} ${r === 1 ? "year" : "years"}`;
}
function yearsText(y: number): string {
  if (y < 1.5) return "the past year";
  const n = Math.round(y);
  return `${n} years`;
}
function monthYear(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function px(v: number): string {
  return v >= 1 ? formatCurrency(v) : `$${v.toFixed(4)}`;
}
function compact(v: number): string {
  return formatCompactUSD(v).replace(/^\$/, "");
}
function sizeWord(cap: number): string {
  if (cap >= 200e9) return "a mega-cap";
  if (cap >= 10e9) return "a large company";
  if (cap >= 2e9) return "a mid-sized company";
  if (cap >= 300e6) return "a small company";
  return "a micro-cap";
}
