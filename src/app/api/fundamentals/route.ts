import { NextResponse } from "next/server";
import { requireUser } from "../_auth";
import { getFundamentals } from "@/lib/fundamentals";
import { computePriceContext } from "@/lib/price-context";
import { getBitcoinComparison } from "@/lib/bitcoin-comparison";
import { getOhlc, type OhlcCandle } from "@/lib/marketdata";
import { isCryptoSymbol } from "@/lib/assets";

// The Owner's View, as data: what the holder owns, where its price sits in its
// own history, and — for a coin — whether it is really a separate bet from
// Bitcoin. Gated like the other market-data proxies so it cannot be scraped
// anonymously.
export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

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

  return NextResponse.json({ fundamentals, priceContext, bitcoin });
}
