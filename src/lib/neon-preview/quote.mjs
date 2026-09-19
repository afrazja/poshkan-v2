/** @typedef {{symbol?: string, regularMarketPrice?: number, regularMarketTime?: Date, marketState?: string, currency?: string, quoteType?: string}} ServerQuote */
/** @param {string} symbol @param {ServerQuote} quote @param {boolean} forexOperation @param {number} [now] */
export function checkedQuote(symbol, quote, forexOperation, now = Date.now()) {
  const rate = quote.regularMarketPrice;
  const age = now - (quote.regularMarketTime?.getTime() ?? 0);
  if (quote.symbol?.toUpperCase() !== symbol || !Number.isFinite(rate) || !rate || rate <= 0 || !Number.isFinite(age) || age < -60_000 || age > 300_000) throw new Error("A fresh market price is unavailable. No test trade was placed.");
  const crypto = /-USD$/.test(symbol);
  const forex = /=X$/.test(symbol);
  if (!crypto && quote.marketState !== "REGULAR") throw new Error("The market is closed. No test trade was placed.");
  if (!forex && quote.currency !== "USD") throw new Error("This test supports USD-priced assets only.");
  if (forex && quote.currency !== symbol.slice(3,6)) throw new Error("Unsupported asset type.");
  if ((!forex && !crypto && !["EQUITY","ETF"].includes(quote.quoteType ?? "")) || (crypto && quote.quoteType !== "CRYPTOCURRENCY") || (forex && quote.quoteType !== "CURRENCY")) throw new Error("Unsupported asset type.");
  const normalized = rate.toFixed(forexOperation ? 6 : 8);
  if (Number(normalized) <= 0) throw new Error("The quoted price is too small for this trading engine.");
  return normalized;
}
