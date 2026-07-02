// Public glossary — one page per trading term, written for the beginner
// searches ("what is a pip") that match Poshkan's target user. The first
// `definition` paragraph is kept short and direct on purpose: that's the
// format Google lifts into featured snippets.

export interface Term {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  definition: string;
  body: string[];
  related: string[];
  strategies?: { slug: string; label: string }[];
}

export const TERMS: Term[] = [
  {
    slug: "what-is-a-pip",
    title: "What is a pip?",
    seoTitle: "What Is a Pip in Forex? Definition and Examples",
    seoDescription:
      "A pip is the smallest common price step in a currency pair — 0.0001 for most pairs. What a pip is worth, how to calculate it, and how to practice risk-free.",
    definition:
      "A pip is the smallest common price step in a currency pair — 0.0001 for most pairs (0.01 for yen pairs). If EUR/USD moves from 1.1000 to 1.1001, it moved one pip.",
    body: [
      "Pips exist because currency prices are quoted to four (or two) decimal places, and traders needed a standard unit for talking about moves: \"EUR/USD is up 30 pips today\" is instantly meaningful, where \"up 0.0030\" is not.",
      "What a pip is worth in money depends on your position size: pip value = units × 0.0001. Trade 10,000 units (a mini lot) of EUR/USD and each pip is $1; trade 100,000 units (a standard lot) and each pip is $10. This is why the same 20-pip move can be pocket change or a serious gain — position size, not the move itself, sets the stakes.",
    ],
    related: ["leverage-and-margin", "long-vs-short", "stop-loss-take-profit"],
    strategies: [{ slug: "smart-money-concepts", label: "Smart Money Concepts — a forex strategy that thinks in pips" }],
  },
  {
    slug: "leverage-and-margin",
    title: "What are leverage and margin?",
    seoTitle: "Leverage and Margin in Trading, Explained Simply",
    seoDescription:
      "Leverage lets you control a position larger than your cash; margin is the deposit reserved to hold it. How 30:1 leverage works, why it amplifies both ways, and how to practice safely.",
    definition:
      "Leverage lets you control a position bigger than your cash — at 30:1, $100 of margin controls a $3,000 position. Margin is the slice of your cash the broker reserves while the position is open.",
    body: [
      "The mechanics: open a 10,000-unit EUR/USD position at 30:1 leverage and roughly 1/30 of the position's value is set aside from your cash as margin. The rest of your cash stays free. Close the position and the margin comes back, plus or minus your profit or loss.",
      "The catch is symmetry. Leverage multiplies gains AND losses by the same factor: a 1% move on a 30:1 position is a 30% move on your margin. This is why leveraged trading is where most beginners blow up real accounts — and why it's exactly the thing worth practicing on virtual money first, where a stop-out teaches the same lesson for free.",
    ],
    related: ["what-is-a-stop-out", "what-is-a-pip", "stop-loss-take-profit"],
    strategies: [{ slug: "trend-breakout", label: "Trend Breakout — a strategy that uses leverage with ATR-sized stops" }],
  },
  {
    slug: "stop-loss-take-profit",
    title: "What are stop-loss and take-profit orders?",
    seoTitle: "Stop-Loss and Take-Profit Orders, Explained",
    seoDescription:
      "A stop-loss automatically closes a losing trade at your chosen level; a take-profit locks in a gain. Why every planned trade sets both before entry — and how to practice it.",
    definition:
      "A stop-loss automatically closes your position when price hits a level you chose, capping the loss. A take-profit does the opposite: it closes the position when price reaches your target, locking in the gain.",
    body: [
      "Together they turn a trade from a hope into a plan: before you enter, you know exactly where you're wrong (the stop) and where you're satisfied (the target). The distance to your stop also defines your risk — which is what position sizing should be built on.",
      "The ratio between the two distances is your reward:risk. A trade risking 10 pips to make 30 is a 1:3 — it can be wrong more often than right and still make money. Every deterministic scanner on Poshkan sets a stop and target on every trade automatically; watching where it puts them is a fast way to build the habit.",
    ],
    related: ["win-rate-vs-profit-factor", "leverage-and-margin", "what-is-atr"],
    strategies: [{ slug: "optimal-trade-entry", label: "Optimal Trade Entry — built entirely around reward:risk geometry" }],
  },
  {
    slug: "long-vs-short",
    title: "What does going long or short mean?",
    seoTitle: "Long vs Short: What Buying and Short-Selling Actually Mean",
    seoDescription:
      "Going long means profiting when price rises; going short means profiting when it falls. How shorting works, why it exists, and where to practice both without risk.",
    definition:
      "Going long means buying in the expectation that price rises — you profit on the way up. Going short means selling first to profit when price falls: you effectively borrow, sell high, and buy back lower.",
    body: [
      "Long is intuitive — buy low, sell high. Short is the same trade mirrored: sell high first, buy back low later, keep the difference. Markets fall as often as they rise, so a trader who can only go long has an edge in half the conditions at best.",
      "Shorting carries its own risks — a long position can only fall to zero, but a short position's loss is theoretically unlimited (price can keep rising). That's why shorts pair naturally with stop-losses and why practicing them on virtual money first is the sane order of operations.",
    ],
    related: ["stop-loss-take-profit", "leverage-and-margin", "what-is-a-pip"],
    strategies: [{ slug: "candle-range", label: "Candle Range — a strategy that goes long at support and short at resistance" }],
  },
  {
    slug: "market-vs-limit-order",
    title: "What's the difference between a market and a limit order?",
    seoTitle: "Market Order vs Limit Order: The Difference Explained",
    seoDescription:
      "A market order executes immediately at the current price; a limit order waits for your price. When to use each, what Day vs GTC means, and where to practice.",
    definition:
      "A market order executes immediately at the best available current price. A limit order waits: it only executes at your chosen price or better — a buy fills at or below your limit, a sell at or above it.",
    body: [
      "Market orders buy certainty of execution at the cost of price control; limit orders buy price control at the risk of never filling. Neither is 'better' — scalpers grabbing a moving market use market orders, patient traders bidding for a pullback use limits.",
      "Limit orders also carry a time-in-force: a Day order expires at the end of the trading day if unfilled, while GTC (good-til-canceled) waits indefinitely until it fills or you cancel it. On Poshkan, background workers fill your limit orders even while you're offline — the same way a real broker's servers would.",
    ],
    related: ["stop-loss-take-profit", "long-vs-short"],
  },
  {
    slug: "win-rate-vs-profit-factor",
    title: "Win rate vs profit factor: which matters?",
    seoTitle: "Win Rate vs Profit Factor: Why High Win Rates Can Still Lose Money",
    seoDescription:
      "Win rate is how often you win; profit factor is gross wins divided by gross losses. Why a 40% win rate can beat a 70% one, and how to judge a strategy honestly.",
    definition:
      "Win rate is the percentage of trades that make money. Profit factor is gross profits divided by gross losses — above 1.0 means the strategy makes money overall. A strategy can have a high win rate and still lose if its rare losses outweigh its many small wins.",
    body: [
      "The two metrics describe opposite strategy personalities. Mean-reversion and range strategies win often but small — high win rate, modest profit factor. Breakout strategies win rarely but big — a 40% win rate with 3R winners is comfortably profitable. Judging either type by the other's metric is how beginners pick exactly the wrong strategy.",
      "The honest evaluation uses both, plus max drawdown (the worst peak-to-valley losing stretch). Poshkan's backtests report all three for every deterministic scanner, over the same rules the live scanner runs — so the numbers you judge are the numbers you'd get.",
    ],
    related: ["stop-loss-take-profit", "what-is-atr"],
    strategies: [
      { slug: "trend-breakout", label: "Trend Breakout — low win rate, big winners" },
      { slug: "mean-reversion", label: "Mean Reversion — high win rate, small winners" },
    ],
  },
  {
    slug: "what-is-a-liquidity-sweep",
    title: "What is a liquidity sweep (stop-hunt)?",
    seoTitle: "Liquidity Sweeps and Stop-Hunts in Trading, Explained",
    seoDescription:
      "A liquidity sweep is a brief poke past an obvious swing point that triggers resting stop-losses before price reverses. Why it happens and how strategies trade after it.",
    definition:
      "A liquidity sweep (or stop-hunt) is a quick move just past an obvious high or low that triggers the stop-loss orders resting there, then reverses. The stops provide the liquidity that larger players use to fill their own positions.",
    body: [
      "Obvious swing points accumulate stop-losses — everyone who bought the low puts their stop just under it. That cluster of resting orders is liquidity, and fast money knows where it lives. A brief push through the level fills the big player's order against everyone's stops, and price snaps back.",
      "Rather than being victims of the sweep, some strategies wait for it: the trap springing is their signal that the level has been cleared and the real move can start. That's the core of the Optimal Trade Entry playbook — enter after the sweep, with a stop beyond it.",
    ],
    related: ["what-is-a-fair-value-gap", "stop-loss-take-profit"],
    strategies: [{ slug: "optimal-trade-entry", label: "Optimal Trade Entry — enters after the sweep, not before" }],
  },
  {
    slug: "what-is-a-fair-value-gap",
    title: "What is a fair value gap (FVG)?",
    seoTitle: "Fair Value Gaps (FVG) in Trading, Explained Simply",
    seoDescription:
      "A fair value gap is a three-candle imbalance left by a fast move — a price zone the market often revisits. How FVGs form and how SMC strategies trade the retest.",
    definition:
      "A fair value gap (FVG) is an imbalance left behind by a fast move: in a three-candle burst, the gap between the first candle's high and the third candle's low (or vice versa) that price never traded through calmly. Markets often come back to 'fill' these gaps.",
    body: [
      "When price moves violently, it skips levels — buyers and sellers never got to transact there. That untraded zone is the gap, and the market's tendency to revisit it gives structure traders a map: the gap becomes a magnet and, on the retest, a potential entry zone.",
      "Smart Money Concepts strategies treat the FVG retest as their entry: trend first (a break of structure), then the gap, then the pullback into it, then a confirmation candle. No single gap is a guarantee — the edge is in demanding all four conditions at once.",
    ],
    related: ["what-is-a-liquidity-sweep", "win-rate-vs-profit-factor"],
    strategies: [{ slug: "smart-money-concepts", label: "Smart Money Concepts — built around the FVG retest" }],
  },
  {
    slug: "what-is-atr",
    title: "What is ATR (Average True Range)?",
    seoTitle: "ATR (Average True Range) Explained: Volatility-Sized Stops",
    seoDescription:
      "ATR measures how much a market typically moves per bar. Why strategies size stop-losses in ATR multiples instead of fixed amounts, with examples.",
    definition:
      "ATR (Average True Range) measures a market's typical bar-to-bar movement — its volatility. An ATR of $2 means the market has recently moved about $2 per bar on average.",
    body: [
      "ATR's killer application is stop placement. A fixed 50-cent stop is generous on a sleepy stock and suicide on a volatile one — the same dollar distance means completely different things. A stop set at 2× ATR adapts automatically: wider when the market is wild (so normal noise doesn't stop you out), tighter when it's calm.",
      "Several Poshkan scanners size their stops in ATR multiples for exactly this reason — the '×ATR' setting you'll see in their risk sections. It's one number that makes the same strategy sane across BTC, EUR/USD, and a small-cap stock.",
    ],
    related: ["what-is-adx", "stop-loss-take-profit"],
    strategies: [
      { slug: "trend-breakout", label: "Trend Breakout — ATR-sized stops on every trade" },
      { slug: "mean-reversion", label: "Mean Reversion — stops set in ATR multiples" },
    ],
  },
  {
    slug: "what-is-adx",
    title: "What is ADX (Average Directional Index)?",
    seoTitle: "ADX Explained: Measuring Trend Strength (Not Direction)",
    seoDescription:
      "ADX measures how strongly a market is trending — not which way. Why breakout strategies use an ADX filter to skip choppy markets, with practical thresholds.",
    definition:
      "ADX (Average Directional Index) measures trend strength on a 0–100 scale — not direction. Readings below ~20 suggest a choppy, directionless market; above ~25 suggests a real trend is underway.",
    body: [
      "ADX answers the one question every breakout trader needs answered before entering: is this market actually going somewhere, or just flailing? A breakout with ADX at 12 is statistically a coin-flip fake-out; the same breakout with ADX at 30 has a trend behind it.",
      "That's why trend-following scanners use ADX as a gate: no trend strength, no trade, regardless of how clean the breakout looks. It's the filter that keeps a breakout strategy out of the sideways chop that would otherwise bleed it dry.",
    ],
    related: ["what-is-atr", "win-rate-vs-profit-factor"],
    strategies: [{ slug: "trend-breakout", label: "Trend Breakout — ADX-gated breakouts" }],
  },
  {
    slug: "unrealized-vs-realized-pnl",
    title: "Unrealized vs realized P&L: what's the difference?",
    seoTitle: "Unrealized vs Realized P&L, Explained",
    seoDescription:
      "Unrealized P&L is paper profit on positions you still hold; realized P&L is locked in by closing. Why the distinction changes how you read your account.",
    definition:
      "Unrealized P&L is the paper profit or loss on positions you still hold — it moves with the market every second. Realized P&L is profit or loss you locked in by closing a position — it never changes again.",
    body: [
      "The distinction matters because unrealized gains aren't yours yet. A position up 40% can round-trip to a loss if you never take it — 'it was up so much' is the most expensive sentence in trading. Watching the two numbers separately teaches you whether you're actually converting good entries into banked results.",
      "Every Poshkan account header shows both, plus today's P&L (how much your holdings moved since yesterday's close) — three different lenses on the same portfolio, because each answers a different question: how's it going right now, how did today go, and what have I actually banked?",
    ],
    related: ["stop-loss-take-profit", "win-rate-vs-profit-factor"],
  },
  {
    slug: "what-is-a-stop-out",
    title: "What is a stop-out in leveraged trading?",
    seoTitle: "Stop-Out in Forex and Leveraged Trading, Explained",
    seoDescription:
      "A stop-out is the forced closing of a leveraged position when its loss reaches the margin you reserved. Why brokers do it and how to avoid hitting it.",
    definition:
      "A stop-out is the automatic, forced closing of a leveraged position when its loss reaches the margin you reserved for it. It's the broker's circuit-breaker — it prevents your account from going below zero.",
    body: [
      "With leverage, losses can exceed your deposit alarmingly fast — a 30:1 position only needs a ~3.3% adverse move to consume its entire margin. The stop-out fires before that happens, closing the position at market and returning whatever margin is left.",
      "A stop-out is always worse than your own stop-loss: it happens at the worst price, by definition, after you've lost the whole margin slice. If your positions regularly get stopped out, the lesson isn't 'bad luck' — it's that the position size or leverage is too big for the stop distance. Practicing on virtual money makes that lesson free.",
    ],
    related: ["leverage-and-margin", "stop-loss-take-profit"],
  },
];

export const termBySlug = (slug: string) => TERMS.find((t) => t.slug === slug);
