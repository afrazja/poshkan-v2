import "server-only";
import { getFundamentals, type Fundamentals } from "./fundamentals";
import { computePriceContext, type PriceContext } from "./price-context";
import { getBitcoinComparison, type BitcoinComparison } from "./bitcoin-comparison";
import { getOhlc, type OhlcCandle } from "./marketdata";
import { isCryptoSymbol } from "./assets";

// Everything the Owner's View needs about one symbol, assembled once so the
// logged-in API route and the public symbol page cannot drift apart.
export interface SymbolReport {
  fundamentals: Fundamentals | null;
  priceContext: PriceContext | null;
  bitcoin: BitcoinComparison | null;
}

export async function getSymbolReport(symbol: string): Promise<SymbolReport> {
  // One candle fetch feeds both the price context and the Bitcoin comparison.
  const [fundamentals, candles] = await Promise.all([
    getFundamentals(symbol),
    getOhlc(symbol, "1day", 2600, 3700).catch(() => [] as OhlcCandle[]),
  ]);

  const priceContext = candles.length ? computePriceContext(symbol, candles) : null;
  const bitcoin =
    isCryptoSymbol(symbol) && candles.length
      ? await getBitcoinComparison(symbol, candles).catch(() => null)
      : null;

  return { fundamentals, priceContext, bitcoin };
}

/** True when we have enough to be worth showing a page for. */
export function reportHasContent(r: SymbolReport): boolean {
  return !!r.fundamentals || !!r.priceContext;
}

// The one sentence that says what this symbol's history actually looks like —
// used for the page description and the share card, where a generic blurb
// would waste the only line anyone reads.
export function reportSummary(symbol: string, r: SymbolReport): string {
  const name = r.fundamentals?.name ?? symbol;
  const d = r.priceContext?.drawdowns;
  const y = r.priceContext?.year;
  const bits: string[] = [];

  if (y) {
    bits.push(
      `${name} sits ${Math.round(y.aboveLowPct)}% above its 12-month low and ${Math.round(
        y.belowHighPct
      )}% below its high`
    );
  }
  if (d && d.count > 0 && d.maxDepthPct != null) {
    bits.push(
      `it has fallen ${d.thresholdPct}% or more ${d.count} time${d.count === 1 ? "" : "s"}, the deepest ${Math.round(
        d.maxDepthPct
      )}%${d.allRecovered ? ", and recovered every time" : ""}`
    );
  }
  if (bits.length === 0) return `${name}: price history, drawdowns and what the business earns.`;
  return `${bits.join(". ")}.`;
}
