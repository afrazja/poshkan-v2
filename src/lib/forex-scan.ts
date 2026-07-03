import "server-only";
import { getOhlc, getQuote } from "./marketdata";

// The major USD pairs the scanner watches.
export const MAJORS = [
  "EURUSD=X",
  "GBPUSD=X",
  "USDJPY=X",
  "AUDUSD=X",
  "USDCAD=X",
  "USDCHF=X",
  "NZDUSD=X",
];

// Symbols the AI scanner analyzes per account market.
export const AI_UNIVERSE: Record<string, string[]> = {
  forex: MAJORS,
  stocks: ["AAPL", "MSFT", "NVDA", "AMZN", "SPY", "GOOGL", "META"],
  crypto: ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD"],
};

export function aiUniverse(type: string | null | undefined): string[] {
  return AI_UNIVERSE[(type ?? "").toLowerCase()] ?? [];
}

export interface PairSummary {
  pair: string;
  price: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  support20: number;
  resistance20: number;
  trend: "up" | "down" | "side";
  recentDaily: number[]; // last ~12 daily closes (oldest → newest)
  recentHourly: number[]; // last ~12 hourly closes (oldest → newest)
}

export interface Setup {
  pair: string; // e.g. "USDJPY=X"
  direction: "LONG" | "SHORT";
  entryType: "market" | "limit";
  entry: number;
  stop: number;
  takeProfit: number;
  rr: number;
  rationale: string;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const s = values.slice(-period);
  return s.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function round(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100000) / 100000;
}

export async function buildSummary(pair: string): Promise<PairSummary | null> {
  const [daily, hourly, quote] = await Promise.all([
    getOhlc(pair, "1day", 60),
    getOhlc(pair, "1h", 72),
    getQuote(pair),
  ]);
  if (daily.length < 50 || !quote?.price) return null;

  const closes = daily.map((c) => c.close);
  const last20 = daily.slice(-20);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const price = quote.price;

  let trend: "up" | "down" | "side" = "side";
  if (sma20 && sma50) {
    if (price > sma20 && sma20 > sma50) trend = "up";
    else if (price < sma20 && sma20 < sma50) trend = "down";
  }

  return {
    pair,
    price,
    sma20: round(sma20),
    sma50: round(sma50),
    rsi14: rsi(closes),
    support20: round(Math.min(...last20.map((c) => c.low)))!,
    resistance20: round(Math.max(...last20.map((c) => c.high)))!,
    trend,
    recentDaily: closes.slice(-12).map((c) => round(c)!),
    recentHourly: hourly.map((c) => c.close).slice(-12).map((c) => round(c)!),
  };
}

const OUTPUT_FORMAT = `Respond with ONLY a JSON object, no prose, no markdown fences:
{"setup": null}  when nothing qualifies, or
{"setup": {"pair": "<one symbol exactly as it appears in the data>", "direction": "LONG"|"SHORT", "entryType": "market"|"limit", "entry": number, "stop": number, "takeProfit": number, "rr": number, "rationale": "1-2 sentences"}}
Use "limit" with an entry price for pullback/breakout entries; "market" to take it now. Prices use the symbol's natural precision. Only the symbols present in the data are tradeable.`;

function baseSystem(assetClass: string): string {
  return `You are a disciplined professional ${assetClass} trader. You analyze the available ${assetClass} symbols and pick AT MOST ONE high-conviction trade idea, or none. You are conservative: most of the time there is no great setup, and "no trade" is the correct, expected answer. Never force a trade.

A setup qualifies ONLY if ALL hold:
- It is trend-aligned (trade with the higher-timeframe trend) OR a clean reversal at a well-defined 20-bar support/resistance level.
- The stop sits behind real structure (a level/swing), not an arbitrary distance.
- Reward:risk is at least 2:1 measured from entry to stop vs entry to take-profit.
- RSI does not contradict the idea (e.g. don't buy something already overbought into resistance).

${OUTPUT_FORMAT}`;
}

// When the account owner has written their own strategy, follow it — but still
// enforce the core risk rule so a vague instruction can't produce a reckless trade.
function customSystem(instruction: string, assetClass: string): string {
  return `You are a ${assetClass} trading assistant for a paper-trading account. Follow the USER'S STRATEGY below to pick AT MOST ONE setup from the available ${assetClass} symbols, or none if nothing fits it right now. No matter what the strategy says, ALWAYS require a stop behind real structure and a reward:risk of at least 2:1 — reject anything that doesn't meet that.

USER'S STRATEGY:
${instruction}

${OUTPUT_FORMAT}`;
}

/** Ask Claude for the single best setup across the provided symbol summaries. */
export async function analyzeMarket(
  summaries: PairSummary[],
  instruction?: string | null,
  apiKey?: string,
  market: string = "forex"
): Promise<{ setup: Setup | null; error?: string }> {
  // Strictly bring-your-own-key. Never construct the SDK without an explicit
  // key: `new Anthropic({})` silently falls back to the operator's
  // ANTHROPIC_API_KEY env var, billing us for the user's scans.
  if (!apiKey) return { setup: null, error: "No Anthropic API key on file" };
  const assetClass = market === "stocks" ? "stock" : market === "crypto" ? "crypto" : "forex";
  const system = instruction?.trim() ? customSystem(instruction, assetClass) : baseSystem(assetClass);
  let text: string;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      system,
      messages: [
        {
          role: "user",
          content: `Here are the current daily/hourly readings for the majors. Pick the single best setup or none.\n\n${JSON.stringify(summaries)}`,
        },
      ],
    });
    text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (e) {
    // Anthropic auth/API failure → no setup, but surface WHY (don't crash the cron).
    return { setup: null, error: String((e as { message?: string })?.message ?? e) };
  }

  try {
    const json = text.startsWith("{") ? text : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { setup: Setup | null };
    const s = parsed.setup;
    if (!s || !s.pair || !s.direction || !s.entry || !s.stop || !s.takeProfit) return { setup: null };

    // ── Validate the model's proposal before it can become a trade ──
    // 1. The pair must be one we actually sent — a hallucinated symbol would
    //    otherwise trade at the model's own invented price downstream.
    const summary = summaries.find((x) => x.pair.toUpperCase() === String(s.pair).toUpperCase());
    if (!summary?.price) return { setup: null };
    // 2. Direction must be the exact enum — "Long"/"buy" would silently invert
    //    the SL/TP geometry in the execution path.
    if (s.direction !== "LONG" && s.direction !== "SHORT") return { setup: null };
    // 3. Stop and target must sit on the correct sides of entry.
    const isLong = s.direction === "LONG";
    const sane = isLong
      ? s.stop < s.entry && s.takeProfit > s.entry
      : s.stop > s.entry && s.takeProfit < s.entry;
    if (!sane) return { setup: null };
    // 4. All levels must be within a sane band of the live price (±10%) —
    //    rejects fat-fingered magnitudes before any sizing math sees them.
    const live = summary.price;
    const inBand = (p: number) => Math.abs(p - live) / live <= 0.1;
    if (!inBand(s.entry) || !inBand(s.stop) || !inBand(s.takeProfit)) return { setup: null };
    // 5. Enforce the 2:1 floor server-side too.
    const risk = Math.abs(s.entry - s.stop);
    const reward = Math.abs(s.takeProfit - s.entry);
    if (risk <= 0 || reward / risk < 2) return { setup: null };

    return { setup: s };
  } catch {
    return { setup: null };
  }
}

// Deterministic fallback used by the scanner's force/test mode: fade the most
// RSI-extreme pair (overbought → short, oversold → long) with a ~2:1 plan.
// Guarantees a placeable setup so the autonomous path can be verified on demand.
export function fallbackSetup(summaries: PairSummary[]): Setup | null {
  let best: PairSummary | null = null;
  for (const s of summaries) {
    if (s.rsi14 == null) continue;
    if (!best || Math.abs(s.rsi14 - 50) > Math.abs((best.rsi14 ?? 50) - 50)) best = s;
  }
  if (!best || best.rsi14 == null || !best.price) return null;
  const overbought = best.rsi14 >= 50;
  const dist = best.price * 0.007; // ~0.7% stop distance
  return {
    pair: best.pair,
    direction: overbought ? "SHORT" : "LONG",
    entryType: "market",
    entry: best.price,
    stop: overbought ? best.price + dist : best.price - dist,
    takeProfit: overbought ? best.price - dist * 2 : best.price + dist * 2,
    rr: 2,
    rationale: `Test trade: ${best.pair.replace(/=X$/i, "")} is the most RSI-extreme pair (RSI ${best.rsi14}); fading the extreme.`,
  };
}

export interface PositionContext {
  pair: string; // "USDJPY=X"
  direction: "LONG" | "SHORT";
  units: number;
  entry: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  status: string; // "open" | "closed" | "sl" | "tp" | "stopped"
  closeRate?: number | null;
}

/** Ask Claude to explain the strategy behind one specific position, on demand. */
export async function explainPosition(ctx: PositionContext, apiKey?: string): Promise<string> {
  // BYOK only — see analyzeMarket: an SDK constructed without a key silently
  // falls back to the operator's env key.
  if (!apiKey) {
    throw new Error("Add your Anthropic API key (⚙️ menu → Your Claude API key) to use AI explanations.");
  }
  const summary = await buildSummary(ctx.pair);
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const isOpen = ctx.status === "open";
  const system = `You are a professional forex analyst explaining the strategy behind ONE specific ${isOpen ? "open" : "closed"} position to the trader who holds it. Write 3-5 short sentences in plain language. Cover: the technical read (trend via SMA20/SMA50, RSI14, the 20-bar support/resistance), why the stop-loss and take-profit sit where they do (structure + reward:risk), and what price action would confirm or invalidate the idea. Reference the actual numbers. No preamble, no markdown headers or bullet lists — just the explanation as a short paragraph.`;

  const lines = [
    `Position: ${ctx.direction} ${ctx.units.toLocaleString("en-US")} units of ${ctx.pair}`,
    `Entry: ${ctx.entry}`,
    ctx.stopLoss != null ? `Stop-loss: ${ctx.stopLoss}` : `Stop-loss: none set`,
    ctx.takeProfit != null ? `Take-profit: ${ctx.takeProfit}` : `Take-profit: none set`,
    !isOpen && ctx.closeRate != null ? `Already closed at: ${ctx.closeRate} (outcome: ${ctx.status})` : "",
    "",
    `Current market readings: ${summary ? JSON.stringify(summary) : "unavailable"}`,
  ].filter(Boolean);

  const response = await client.messages.create({
    // Sonnet here (explanatory read only) — the trade DECISION in analyzeMarket
    // stays on Opus. Cuts cost on this on-demand call without affecting trades.
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: lines.join("\n") }],
  });

  return response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}
