// Account-type ↔ asset-class rules (shared by client and server).

// Yahoo crypto symbols are pair-style: BTC-USD, ETH-USD, SOL-EUR, …
export function isCryptoSymbol(symbol: string): boolean {
  return /-(USD|USDT|EUR|GBP|BTC|ETH)$/i.test(symbol.trim());
}

// Yahoo forex symbols end in =X (EURUSD=X).
export function isForexPairSymbol(symbol: string): boolean {
  return /=X$/i.test(symbol.trim());
}

// Returns an error message when the symbol doesn't belong in the account, else null.
// Only enforced when ADDING exposure (buys, watchlist) — selling is always allowed.
export function assetTypeError(
  accountType: string | null | undefined,
  symbol: string
): string | null {
  if (accountType === "forex" && !isForexPairSymbol(symbol)) {
    return "This is a forex account — only currency pairs can be traded here.";
  }
  if (accountType === "crypto" && !isCryptoSymbol(symbol)) {
    return "This is a crypto account — only cryptocurrencies can be traded here.";
  }
  if (accountType === "stocks" && (isCryptoSymbol(symbol) || isForexPairSymbol(symbol))) {
    return "This is a stocks account — only stocks and ETFs can be traded here.";
  }
  return null;
}
