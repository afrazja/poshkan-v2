// Public daily market scans — definitions, universe, and page copy.
// Client-safe (no server imports); the compute engine lives in
// src/lib/public-scans.ts and the cron writes results to public.market_scans.

export interface ScanRow {
  symbol: string;
  name: string;
  close: number;
  changePct: number; // last close vs previous close
  value: number; // scan-specific metric (RSI, % from high, % above MA, …)
}

export interface ScanDef {
  slug: string;
  name: string;
  icon: string;
  short: string; // card blurb on the index page
  valueLabel: string; // table header for the metric column
  valueFmt: (v: number) => string;
  metaTitle: string;
  metaDescription: string;
  intro: string[]; // paragraphs under the H1
  how: string[]; // "how this scan works" bullet points
  faq: { q: string; a: string }[];
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const num = (v: number) => v.toFixed(1);

export const SCANS: ScanDef[] = [
  {
    slug: "golden-cross",
    name: "Golden cross stocks",
    icon: "✨",
    short: "Stocks whose 50-day moving average just crossed above the 200-day.",
    valueLabel: "50d vs 200d MA",
    valueFmt: pct,
    metaTitle: "Golden Cross Stocks Today — Daily 50/200 MA Cross Scan",
    metaDescription:
      "Which stocks formed a golden cross this week? Daily scan of 100 US large caps for 50-day moving averages crossing above the 200-day. Free, updated after each close.",
    intro: [
      "A golden cross forms when a stock's 50-day moving average crosses above its 200-day moving average — a classic signal that medium-term momentum has turned up relative to the long-term trend. This page scans 100 of the largest US stocks after every market close and lists the ones whose golden cross happened within the last five trading sessions.",
    ],
    how: [
      "Universe: 100 large-cap US stocks (S&P 100–style list).",
      "Signal: the 50-day simple moving average closed above the 200-day SMA, having been at or below it the session before, within the last 5 trading days.",
      "Metric shown: how far the 50-day MA sits above the 200-day MA now.",
    ],
    faq: [
      {
        q: "Is a golden cross a buy signal?",
        a: "It's a trend-confirmation signal, not a guarantee. Because moving averages lag price, the cross often appears well after a rally has started — many traders use it to confirm a new uptrend rather than to time an entry. Test it risk-free with virtual money before trading it with real capital.",
      },
      {
        q: "How often is this list updated?",
        a: "Once per trading day, after the US market close.",
      },
      {
        q: "What is the opposite of a golden cross?",
        a: "A death cross — the 50-day moving average crossing below the 200-day. We scan for those too on the death cross page.",
      },
    ],
  },
  {
    slug: "death-cross",
    name: "Death cross stocks",
    icon: "☠️",
    short: "Stocks whose 50-day moving average just crossed below the 200-day.",
    valueLabel: "50d vs 200d MA",
    valueFmt: pct,
    metaTitle: "Death Cross Stocks Today — Daily 50/200 MA Cross Scan",
    metaDescription:
      "Which stocks formed a death cross this week? Daily scan of 100 US large caps for 50-day moving averages crossing below the 200-day. Free, updated after each close.",
    intro: [
      "A death cross forms when a stock's 50-day moving average crosses below its 200-day moving average — the bearish mirror of the golden cross, signalling that medium-term momentum has rolled over relative to the long-term trend. This page scans 100 of the largest US stocks after every close and lists crosses from the last five trading sessions.",
    ],
    how: [
      "Universe: 100 large-cap US stocks (S&P 100–style list).",
      "Signal: the 50-day simple moving average closed below the 200-day SMA, having been at or above it the session before, within the last 5 trading days.",
      "Metric shown: how far the 50-day MA sits below the 200-day MA now.",
    ],
    faq: [
      {
        q: "Should I sell when a death cross appears?",
        a: "Not automatically. Like the golden cross, it's a lagging trend signal — it describes what already happened to the averages. Some traders use it to cut exposure or look for short setups; others treat deep death-cross territory as a contrarian watch-list. Paper trade the signal first.",
      },
      {
        q: "How often is this list updated?",
        a: "Once per trading day, after the US market close.",
      },
    ],
  },
  {
    slug: "crossing-200-day-moving-average",
    name: "Crossing the 200-day MA",
    icon: "📈",
    short: "Stocks whose price just reclaimed the 200-day moving average.",
    valueLabel: "Price vs 200d MA",
    valueFmt: pct,
    metaTitle: "Stocks Crossing Above the 200-Day Moving Average Today",
    metaDescription:
      "Daily list of US large-cap stocks whose price crossed back above the 200-day moving average this week. Free scan, updated after each market close.",
    intro: [
      "The 200-day moving average is the most-watched line in technical analysis — price above it is broadly read as a long-term uptrend, below it as a downtrend. This scan catches the moment of transition: stocks whose closing price crossed from below to above their 200-day average within the last five sessions.",
    ],
    how: [
      "Universe: 100 large-cap US stocks (S&P 100–style list).",
      "Signal: the closing price moved above the 200-day SMA, having closed at or below it the session before, within the last 5 trading days.",
      "Metric shown: how far price sits above the 200-day MA now.",
    ],
    faq: [
      {
        q: "Why does the 200-day moving average matter?",
        a: "Mostly because everyone watches it — funds, media, and systematic strategies all reference it, which makes reactions around it partly self-fulfilling. It's a simple, robust way to define the long-term trend.",
      },
      {
        q: "Price crossed above the 200-day MA — now what?",
        a: "Traders typically look for confirmation: does price hold above on a retest, is volume supportive, is the 200-day itself flattening or turning up? A single close above the line can easily whipsaw. Practice the follow-through on a paper account.",
      },
    ],
  },
  {
    slug: "rsi-oversold",
    name: "Oversold stocks (RSI < 30)",
    icon: "🧲",
    short: "Stocks with a 14-day RSI under 30 — stretched to the downside.",
    valueLabel: "RSI (14)",
    valueFmt: num,
    metaTitle: "Oversold Stocks Today — RSI Below 30 Scan",
    metaDescription:
      "Which US large caps are oversold right now? Daily RSI(14) < 30 scan across 100 major stocks. Free, updated after each market close.",
    intro: [
      "The Relative Strength Index (RSI) measures the speed of recent price moves on a 0–100 scale. Readings under 30 are conventionally called oversold: the stock has fallen hard and fast enough that mean-reversion traders start watching for a bounce. This page lists every stock in our 100-stock universe closing with a 14-day RSI below 30, sorted from most to least oversold.",
    ],
    how: [
      "Universe: 100 large-cap US stocks (S&P 100–style list).",
      "Signal: 14-period RSI on daily closes is below 30 as of the last close.",
      "Metric shown: the RSI value (lower = more oversold).",
    ],
    faq: [
      {
        q: "Does oversold mean the stock will bounce?",
        a: "No — oversold measures speed of decline, not a floor. In strong downtrends RSI can pin below 30 for weeks (\"oversold can stay oversold\"). Mean-reversion traders usually pair the signal with support levels or wait for RSI to turn back up.",
      },
      {
        q: "Why RSI 14 and the 30 level?",
        a: "Fourteen periods and the 30/70 bands are the defaults from Welles Wilder's original 1978 formulation, and remain what most platforms and traders quote.",
      },
    ],
  },
  {
    slug: "rsi-overbought",
    name: "Overbought stocks (RSI > 70)",
    icon: "🔥",
    short: "Stocks with a 14-day RSI above 70 — stretched to the upside.",
    valueLabel: "RSI (14)",
    valueFmt: num,
    metaTitle: "Overbought Stocks Today — RSI Above 70 Scan",
    metaDescription:
      "Which US large caps are overbought right now? Daily RSI(14) > 70 scan across 100 major stocks. Free, updated after each market close.",
    intro: [
      "An RSI reading above 70 marks a stock as overbought — it has risen unusually fast over the last 14 sessions. Momentum traders read it as strength; mean-reversion traders read it as stretched. This page lists every stock in our 100-stock universe closing with a 14-day RSI above 70, sorted from most to least overbought.",
    ],
    how: [
      "Universe: 100 large-cap US stocks (S&P 100–style list).",
      "Signal: 14-period RSI on daily closes is above 70 as of the last close.",
      "Metric shown: the RSI value (higher = more overbought).",
    ],
    faq: [
      {
        q: "Is overbought bearish?",
        a: "Not by itself. The strongest uptrends spend long stretches above RSI 70 — momentum strategies actually buy that strength. It becomes a warning mostly when momentum diverges (price makes new highs while RSI doesn't).",
      },
      {
        q: "How often is this list updated?",
        a: "Once per trading day, after the US market close.",
      },
    ],
  },
  {
    slug: "52-week-high",
    name: "Near 52-week highs",
    icon: "🏔️",
    short: "Stocks closing within 2% of their highest price of the past year.",
    valueLabel: "From 52w high",
    valueFmt: pct,
    metaTitle: "Stocks Near 52-Week Highs Today — Daily Breakout Scan",
    metaDescription:
      "Daily list of US large caps closing within 2% of their 52-week high — momentum and breakout candidates. Free, updated after each market close.",
    intro: [
      "Stocks trading at or near their 52-week high are, by definition, the market's current leaders — and a large body of momentum research finds that strength near the highs tends to persist. Breakout traders watch this list for names pushing into open air with no overhead resistance. This page lists every stock in our universe that closed within 2% of its highest price of the past 252 trading days.",
    ],
    how: [
      "Universe: 100 large-cap US stocks (S&P 100–style list).",
      "Signal: last close is within 2% of the highest daily high of the past 252 sessions.",
      "Metric shown: distance below the 52-week high (0% = new high).",
    ],
    faq: [
      {
        q: "Isn't buying at the high the worst time to buy?",
        a: "It feels that way, which is exactly why momentum persists — most people can't bring themselves to do it. Historically, stocks near 52-week highs have tended to keep outperforming over the following months, though with sharp drawdowns when momentum turns. Try the approach with virtual money first.",
      },
      {
        q: "Why within 2% instead of exact new highs?",
        a: "Exact-high lists flicker day to day. A small band catches the same leadership group while being stable enough to act on.",
      },
    ],
  },
];

export function scanBySlug(slug: string): ScanDef | undefined {
  return SCANS.find((s) => s.slug === slug);
}

// 100 large-cap, liquid US stocks (S&P 100–style). Names are shown in the
// results tables so the pages read like a report, not a ticker dump.
export const SCAN_UNIVERSE: { t: string; n: string }[] = [
  { t: "AAPL", n: "Apple" },
  { t: "MSFT", n: "Microsoft" },
  { t: "NVDA", n: "Nvidia" },
  { t: "AMZN", n: "Amazon" },
  { t: "GOOGL", n: "Alphabet" },
  { t: "META", n: "Meta Platforms" },
  { t: "TSLA", n: "Tesla" },
  { t: "BRK-B", n: "Berkshire Hathaway" },
  { t: "AVGO", n: "Broadcom" },
  { t: "JPM", n: "JPMorgan Chase" },
  { t: "LLY", n: "Eli Lilly" },
  { t: "V", n: "Visa" },
  { t: "UNH", n: "UnitedHealth" },
  { t: "XOM", n: "Exxon Mobil" },
  { t: "MA", n: "Mastercard" },
  { t: "JNJ", n: "Johnson & Johnson" },
  { t: "PG", n: "Procter & Gamble" },
  { t: "HD", n: "Home Depot" },
  { t: "COST", n: "Costco" },
  { t: "ORCL", n: "Oracle" },
  { t: "ABBV", n: "AbbVie" },
  { t: "KO", n: "Coca-Cola" },
  { t: "BAC", n: "Bank of America" },
  { t: "MRK", n: "Merck" },
  { t: "CVX", n: "Chevron" },
  { t: "WMT", n: "Walmart" },
  { t: "CRM", n: "Salesforce" },
  { t: "AMD", n: "AMD" },
  { t: "NFLX", n: "Netflix" },
  { t: "PEP", n: "PepsiCo" },
  { t: "TMO", n: "Thermo Fisher" },
  { t: "ADBE", n: "Adobe" },
  { t: "LIN", n: "Linde" },
  { t: "DIS", n: "Walt Disney" },
  { t: "ABT", n: "Abbott" },
  { t: "CSCO", n: "Cisco" },
  { t: "WFC", n: "Wells Fargo" },
  { t: "INTU", n: "Intuit" },
  { t: "QCOM", n: "Qualcomm" },
  { t: "IBM", n: "IBM" },
  { t: "GE", n: "GE Aerospace" },
  { t: "CAT", n: "Caterpillar" },
  { t: "TXN", n: "Texas Instruments" },
  { t: "AMGN", n: "Amgen" },
  { t: "VZ", n: "Verizon" },
  { t: "PFE", n: "Pfizer" },
  { t: "MS", n: "Morgan Stanley" },
  { t: "GS", n: "Goldman Sachs" },
  { t: "ISRG", n: "Intuitive Surgical" },
  { t: "RTX", n: "RTX" },
  { t: "NOW", n: "ServiceNow" },
  { t: "SPGI", n: "S&P Global" },
  { t: "T", n: "AT&T" },
  { t: "UBER", n: "Uber" },
  { t: "HON", n: "Honeywell" },
  { t: "LOW", n: "Lowe's" },
  { t: "BKNG", n: "Booking Holdings" },
  { t: "NEE", n: "NextEra Energy" },
  { t: "UNP", n: "Union Pacific" },
  { t: "C", n: "Citigroup" },
  { t: "BLK", n: "BlackRock" },
  { t: "BA", n: "Boeing" },
  { t: "SBUX", n: "Starbucks" },
  { t: "PLTR", n: "Palantir" },
  { t: "MDT", n: "Medtronic" },
  { t: "TMUS", n: "T-Mobile US" },
  { t: "SCHW", n: "Charles Schwab" },
  { t: "DE", n: "Deere" },
  { t: "LMT", n: "Lockheed Martin" },
  { t: "BMY", n: "Bristol-Myers Squibb" },
  { t: "GILD", n: "Gilead Sciences" },
  { t: "ADP", n: "ADP" },
  { t: "CVS", n: "CVS Health" },
  { t: "MDLZ", n: "Mondelez" },
  { t: "MO", n: "Altria" },
  { t: "SO", n: "Southern Company" },
  { t: "DUK", n: "Duke Energy" },
  { t: "CL", n: "Colgate-Palmolive" },
  { t: "ICE", n: "Intercontinental Exchange" },
  { t: "SHW", n: "Sherwin-Williams" },
  { t: "EMR", n: "Emerson Electric" },
  { t: "FDX", n: "FedEx" },
  { t: "NKE", n: "Nike" },
  { t: "MCD", n: "McDonald's" },
  { t: "TGT", n: "Target" },
  { t: "PYPL", n: "PayPal" },
  { t: "ABNB", n: "Airbnb" },
  { t: "KHC", n: "Kraft Heinz" },
  { t: "GM", n: "General Motors" },
  { t: "F", n: "Ford" },
  { t: "DAL", n: "Delta Air Lines" },
  { t: "AXP", n: "American Express" },
  { t: "COP", n: "ConocoPhillips" },
  { t: "SLB", n: "Schlumberger" },
  { t: "USB", n: "U.S. Bancorp" },
  { t: "PM", n: "Philip Morris" },
  { t: "COIN", n: "Coinbase" },
  { t: "MU", n: "Micron Technology" },
  { t: "INTC", n: "Intel" },
  { t: "PANW", n: "Palo Alto Networks" },
];
