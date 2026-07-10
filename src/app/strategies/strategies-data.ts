// Public, indexable explainers for each scanner strategy — the SEO content
// surface. Copy is adapted and expanded from the in-app "How it works"
// explainers, so the marketing pages and the product never drift apart.

export interface Strategy {
  slug: string;
  icon: string;
  name: string;
  shortName: string;
  seoTitle: string;
  seoDescription: string;
  hook: string;
  lead: string[];
  how: string[];
  shines: string[];
  terms: { term: string; def: string }[];
  judging: string[];
  markets: string;
}

export const STRATEGIES: Strategy[] = [
  {
    slug: "smart-money-concepts",
    icon: "📈",
    name: "Smart Money Concepts (SMC)",
    shortName: "SMC",
    seoTitle: "What Is Smart Money Concepts (SMC) Trading? Strategy Explained",
    seoDescription:
      "Smart Money Concepts explained in plain English: break of structure, fair value gaps, retests, confirmation entries, and how to practice SMC with virtual money.",
    hook: "Trade the footprints institutions leave behind — structure breaks, fair value gaps, and confirmed retests.",
    lead: [
      "Smart Money Concepts (SMC) is a price-action methodology built on a simple idea: large institutional orders can't hide. When a big player moves a market quickly, they leave footprints — a break in the market's structure and a price 'gap' the market tends to revisit. SMC traders wait for those footprints, then join in the same direction when price comes back to fill them.",
      "Instead of indicators, SMC reads the raw structure of the chart: where the swing highs and lows are, which ones broke, and where price moved so fast that it left an imbalance behind.",
    ],
    how: [
      "Establish the trend on the 1-hour chart by finding a break of market structure (BOS) — price taking out a meaningful swing high or low.",
      "Locate a fair value gap (FVG): a three-candle pattern where price moved so fast it left an unfilled imbalance.",
      "Wait for price to pull back and retest that gap — patience is most of the edge.",
      "Enter only when a confirmation candle closes back inside the gap in the trend's direction.",
      "Place the stop-loss beyond the swing (or beyond the gap), and target a fixed reward-to-risk multiple, typically 1:2 to 1:4.",
    ],
    shines: [
      "SMC works best in trending intraday markets with clean structure — crypto majors and the big FX pairs are the classic hunting grounds. In choppy, directionless conditions, structure breaks stop meaning anything and the strategy correctly goes quiet.",
      "It's a selective strategy by design: few trades, but each one demands trend, gap, retest, and confirmation to line up at once. Expect days with no signals — that's the filter working, not the strategy failing.",
    ],
    terms: [
      { term: "Break of structure (BOS)", def: "Price taking out a prior swing high or low, signalling the trend's direction." },
      { term: "Fair value gap (FVG)", def: "An imbalance left by a fast move — a gap between candle 1's high and candle 3's low (or vice versa) that price tends to revisit." },
      { term: "Retest", def: "Price returning to a level (here, the FVG) before continuing — the entry zone." },
      { term: "R (reward:risk)", def: "Profit measured in multiples of what you risked. A 1:3 trade wins 3R or loses 1R." },
    ],
    judging: [
      "Because SMC fires rarely, raw signal count tells you nothing. Judge it on net R (total profit in risk multiples) and profit factor (gross wins ÷ gross losses) over a meaningful sample — Poshkan's built-in backtest replays the exact rules over ~8 weeks of 5-minute data so you can see both before enabling it.",
    ],
    markets: "crypto and forex majors, intraday (1-hour trend, 5-minute entries)",
  },
  {
    slug: "optimal-trade-entry",
    icon: "🎯",
    name: "Optimal Trade Entry (OTE)",
    shortName: "OTE",
    seoTitle: "Optimal Trade Entry (OTE): The ICT Fibonacci Pullback Strategy Explained",
    seoDescription:
      "The ICT-style Optimal Trade Entry strategy in plain English: the 62–79% Fibonacci zone, liquidity sweeps, and confirmation entries — practice it free with virtual money.",
    hook: "Enter the pullback's sweet spot — after the stop-hunt, not before it.",
    lead: [
      "Optimal Trade Entry (OTE) is an ICT-style pullback strategy. The premise: strong moves rarely continue in a straight line — they retrace first. And the highest-quality entries cluster in a specific slice of that retracement: the 62–79% Fibonacci zone, the 'optimal trade entry' that gives a tight stop and a large target.",
      "What separates OTE from a plain Fibonacci strategy is the liquidity sweep. Before continuing, price often dips just past an obvious swing point — taking out the stop-losses resting there — and then reverses. OTE deliberately waits for that stop-hunt to happen first, so you enter after the trap springs rather than inside it.",
    ],
    how: [
      "Read the trend on the 15-minute chart and draw a Fibonacci retracement over the last impulse leg.",
      "Wait for price to retrace into the 62–79% OTE zone.",
      "On the 5-minute chart, watch for a swing low (or high) inside the zone to get swept — the stop-hunt.",
      "Enter on a confirmation close back past the trigger candle, in the trend's direction.",
      "Stop goes beyond the sweep; the target is the prior swing — and the trade is only taken if it clears your minimum reward:risk.",
    ],
    shines: [
      "OTE shines in trending markets that breathe — impulse, pullback, continuation. It struggles when there's no impulse leg to retrace (flat markets) or when trends run away without pulling back at all (it simply won't get filled, which costs nothing).",
      "The minimum reward:risk filter is the quiet hero: it automatically skips technically-valid setups whose geometry isn't worth the risk.",
    ],
    terms: [
      { term: "OTE zone", def: "The 62–79% band of a Fibonacci retracement — the 'optimal trade entry' region of a pullback." },
      { term: "Liquidity sweep / stop-hunt", def: "A brief poke past an obvious swing point that triggers resting stop-losses before the real move." },
      { term: "Impulse leg", def: "The strong directional move that the Fibonacci retracement is drawn over." },
      { term: "Confirmation close", def: "A candle closing past the trigger level — evidence the reversal is real, not another wick." },
    ],
    judging: [
      "OTE is selective by design — judge it on net R and profit factor, not trade frequency. Poshkan's backtest replays the exact rule set over recent history so you can see the trade-by-trade R distribution before turning it on.",
    ],
    markets: "crypto and forex majors (15-minute trend, 5-minute entries)",
  },
  {
    slug: "trend-breakout",
    icon: "🚀",
    name: "Trend Breakout",
    shortName: "Trend",
    seoTitle: "Trend Breakout Trading: The Donchian Channel ('Turtle') Strategy Explained",
    seoDescription:
      "The classic Donchian breakout strategy in plain English: buying new highs with ADX and moving-average confirmation, ATR stops, and why win rate is the wrong metric. Practice it free.",
    hook: "Buy new highs, sell new lows — but only when the trend is real.",
    lead: [
      "Trend breakout is the oldest edge in systematic trading — it's the engine behind the famous 'Turtle Traders' experiment of the 1980s. The idea is almost embarrassingly simple: markets that make fresh highs tend to keep making them. So instead of predicting, you react: buy the breakout above the recent range, sell the breakdown below it, and ride whatever trend develops.",
      "The catch is false breakouts — chop that pokes above the range and immediately collapses. A naked breakout rule loses to those constantly, which is why this strategy layers two confirmations on top: trend strength (ADX) and trend direction (a sloping moving average).",
    ],
    how: [
      "On 1-hour bars, track the highest high and lowest low of the last N bars — the Donchian channel.",
      "When a bar closes through that boundary, that's the breakout — and only the bar that crosses out counts, so the signal can't re-fire endlessly.",
      "Confirm the trend is real: ADX above your threshold (strength) and the trend moving average sloping the same way (direction).",
      "Skip breakouts that have already run too far past the level — no chasing tops.",
      "Stop-loss is a multiple of ATR (so it scales with volatility); target is a fixed reward:risk such as 3R.",
    ],
    shines: [
      "Breakouts shine in strong, persistent trends — crypto bull runs, momentum stocks, trending FX. They bleed in sideways chop, which is exactly what the ADX filter is there to avoid: when the market is directionless, the scanner just says 'no-setup' and waits.",
    ],
    terms: [
      { term: "Donchian channel", def: "The band between the highest high and lowest low of the last N bars." },
      { term: "ADX", def: "Average Directional Index — measures trend strength (not direction). Higher = stronger trend." },
      { term: "ATR", def: "Average True Range — the market's typical bar-to-bar movement; used to size stops to volatility." },
      { term: "False breakout", def: "A poke through the range boundary that reverses instead of trending — the failure mode this strategy filters against." },
    ],
    judging: [
      "This is the strategy where win rate misleads most. Breakout systems often win only 35–45% of the time and still make money, because winners run for multiples of what losers cost. Judge it by net R and profit factor over the backtest, and expect losing streaks as the cost of catching the big trends.",
    ],
    markets: "stocks, crypto, and forex (1-hour bars)",
  },
  {
    slug: "mean-reversion",
    icon: "↩️",
    name: "Mean Reversion",
    shortName: "Mean Rev",
    seoTitle: "Mean Reversion Trading with Bollinger Bands, Explained",
    seoDescription:
      "The Bollinger Band mean-reversion strategy in plain English: fading over-stretched moves back to the average, with a trend filter and ATR stops. Practice it with virtual money.",
    hook: "When price stretches too far, too fast — bet on the snap-back.",
    lead: [
      "Mean reversion is the counterpunch to trend-following. Markets overreact: a burst of buying or selling stretches price far from its recent average, and more often than not it snaps back. This strategy quantifies 'too far' with Bollinger Bands — a moving average with bands drawn a set number of standard deviations away — and fades the stretch, targeting the return to the middle.",
      "It's the natural opposite of the Trend Breakout scanner: one buys strength, the other sells it. Running both is a classic way to hold edges for different market regimes.",
    ],
    how: [
      "On 1-hour bars, draw Bollinger Bands: a moving average ± a multiple of standard deviation.",
      "When price closes beyond a band, it's statistically over-stretched.",
      "Enter in the opposite direction, targeting the middle band — the mean.",
      "The stop is a multiple of ATR beyond the entry.",
      "By default a trend filter only allows fades in the direction of the bigger trend — fighting a strong trend is how mean reversion dies. (It can be disabled to fade both ways.)",
    ],
    shines: [
      "Mean reversion thrives in range-bound, choppy markets — exactly where breakout strategies bleed. Its weakness is the strong trend: what looks 'over-stretched' in a real bull run keeps stretching, which is why the trend filter matters more than any other setting.",
    ],
    terms: [
      { term: "Bollinger Bands", def: "A moving average with bands drawn ± k standard deviations around it — a live map of 'normal' vs 'stretched'." },
      { term: "The mean", def: "The middle band (the moving average) — the magnet this strategy trades back toward." },
      { term: "Fading", def: "Trading against the recent move — selling a spike up, buying a spike down." },
      { term: "σ (standard deviation)", def: "The statistical unit of 'how unusual is this move' that sets the band width." },
    ],
    judging: [
      "Mean reversion wins often but small — the opposite profile to breakouts. A high win rate alone can hide an account-killer, so judge win rate and profit factor together, and watch max drawdown in the backtest: the losses cluster when a range breaks into a trend.",
    ],
    markets: "stocks, crypto, and forex (1-hour bars)",
  },
  {
    slug: "candle-range",
    icon: "📦",
    name: "Candle Range",
    shortName: "Range",
    seoTitle: "Range Trading Explained: Buying Support, Selling Resistance",
    seoDescription:
      "The range (box) trading strategy in plain English: identifying real ranges, buying the floor with candle confirmation, selling the ceiling, and surviving breakouts. Practice free.",
    hook: "When the market moves sideways, trade the box: buy the floor, sell the ceiling.",
    lead: [
      "Markets trend far less often than people think — much of the time price just oscillates between a floor (support) and a ceiling (resistance). Range trading accepts that and works the box: buy near the floor, sell near the ceiling, repeat until the box breaks.",
      "The two failure modes are trading a 'range' that's actually a trend, and staying in the trade when the box finally breaks. This strategy addresses both: it demands proof the range is real before trading it, and a candle confirmation before every entry.",
    ],
    how: [
      "On 15-minute bars, mark the recent range high (resistance) and range low (support).",
      "Confirm it's a real range: price must have touched both edges several times — one bounce isn't a range.",
      "Near the lower edge with a bullish confirmation candle → go long. Near the upper edge with a bearish candle → go short.",
      "Target the opposite edge of the box; the stop sits just beyond the edge you entered at.",
      "If price breaks out of the box, the scanner stands aside — no trading a range that no longer exists.",
    ],
    shines: [
      "Range trading is the specialist for sideways, directionless markets — the conditions that starve every trend strategy. Its enemy is the breakout: a range pays you in small, frequent wins, and then the box breaks and takes a chunk back. The edge-confirmation and breakout-detection rules exist to keep that chunk small.",
    ],
    terms: [
      { term: "Support / resistance", def: "The floor and ceiling prices where buying/selling has repeatedly stepped in." },
      { term: "Confirmation candle", def: "A candle closing in your direction at the edge — evidence the bounce is starting, not hoped for." },
      { term: "Breakout", def: "Price escaping the box — the signal to stop range-trading it." },
    ],
    judging: [
      "Expect a high win rate with modest wins — and judge it with profit factor and max drawdown alongside, because the losses arrive clustered when ranges break. If the backtest shows a great win rate but a profit factor near 1, the breakouts are eating the bounces.",
    ],
    markets: "stocks, crypto, and forex (15-minute bars)",
  },
  {
    slug: "ai-scanner",
    icon: "🤖",
    name: "AI Scanner",
    shortName: "AI",
    seoTitle: "AI Trading in Plain English: How Poshkan's Claude-Powered Scanner Works",
    seoDescription:
      "Write trading rules in plain English and let Claude scan the market, propose entries, stops and rationale — alert-only or virtual auto-trading.",
    hook: "Describe your strategy in plain English. The AI does the scanning.",
    lead: [
      "The other five scanners are deterministic — fixed formulas that fire when their exact conditions are met. The AI Scanner is the flexible one: instead of parameters, you give it instructions in plain English ('only trade pullbacks in uptrends, skip anything before major news, prefer 1:3 or better'), and Claude — the AI model by Anthropic — evaluates recent price action against your rules.",
      "Every proposal comes with an entry, stop-loss, target, and a written rationale, so you can review why it likes the setup — and it either alerts you or places virtual trades inside the same risk limits every Poshkan scanner obeys.",
    ],
    how: [
      "Write your strategy in plain English — or start with the built-in one and edit from there.",
      "On each run, Claude analyses your chosen symbols and their recent price action against your instructions.",
      "It proposes virtual trades with an entry, stop, target, and a written rationale.",
      "In alert mode it notifies you and does nothing else; in auto-trade mode it opens simulated positions within your risk %, max-open, max-per-day, and daily-loss limits.",
    ],
    shines: [
      "It shines when your edge is judgement rather than a formula — nuanced rules, context, exceptions — or when you want to prototype a strategy idea in an afternoon by literally writing it down. It's also the honest one about its limits: because the model isn't deterministic, it can't be backtested the way the formula scanners can.",
    ],
    terms: [
      { term: "Deterministic vs discretionary", def: "Fixed-formula strategies always fire identically on the same data; discretionary ones apply judgement — the AI Scanner is judgement, encoded in your words." },
      { term: "Rationale", def: "The written 'why' attached to each AI proposal — the part a signal service never gives you." },
      { term: "Risk limits", def: "Hard caps (risk %, max open trades, daily loss limit) that bound the AI regardless of what it wants to do." },
    ],
    judging: [
      "Since backtesting doesn't apply, judge it live: let it run in alert mode on virtual money, read its rationales, and track how its proposals play out before enabling virtual auto-trade. That workflow — try, watch, then trust — is exactly what a paper-trading platform is for.",
    ],
    markets: "stocks, crypto, and forex — any symbols you watch",
  },
];

export const strategyBySlug = (slug: string) => STRATEGIES.find((s) => s.slug === slug);
