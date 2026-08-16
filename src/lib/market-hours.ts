import "server-only";
import { getQuote } from "./marketdata";
import { isCryptoSymbol, isForexPairSymbol } from "./assets";

// Real markets close, and a realistic simulator says no while they do.
// Crypto trades 24/7; US stocks trade the regular session (9:30–4 ET);
// forex trades 24/5 and closes for the weekend. The check leans on the
// quote feed's isMarketOpen (regular session) and FAILS OPEN on feed
// errors — a data hiccup should never freeze the whole simulator.
export async function marketClosedError(symbol: string): Promise<string | null> {
  if (isCryptoSymbol(symbol)) return null; // 24/7
  try {
    const q = await getQuote(symbol);
    if (q.isMarketOpen) return null;
    return isForexPairSymbol(symbol)
      ? "The forex market is closed for the weekend — trading resumes Sunday 5pm ET."
      : "The US stock market is closed — the regular session runs 9:30am–4pm ET, Mon–Fri. You can queue a limit order instead.";
  } catch {
    return null;
  }
}
