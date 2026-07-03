// Estimated round-trip trading cost (spread + slippage) as a fraction of price.
// Backtests fill at the exact signal/stop/target price, which no live order gets:
// you cross the spread on entry and again on exit, plus some slippage. Charging
// an estimate per trade keeps replay numbers honest — it matters most for
// high-frequency strategies, where hundreds of small edges must each out-earn
// the spread. Estimates are for LIQUID instruments (majors, large caps, BTC/ETH).
import { isCryptoSymbol, isForexPairSymbol } from "./assets";

export function roundTripCostFraction(symbol: string): number {
  if (isForexPairSymbol(symbol)) return 0.0002; // ~1 pip on a major + slippage
  if (isCryptoSymbol(symbol)) return 0.001; // ~5bp spread + 5bp slippage per side
  return 0.0005; // liquid stocks/ETFs: spread + slippage round trip
}

// The same cost expressed in R (risk units) for a trade risking |entry − stop|.
export function costInR(symbol: string, entry: number, stop: number): number {
  const riskDist = Math.abs(entry - stop);
  if (riskDist <= 0 || entry <= 0) return 0;
  return (entry * roundTripCostFraction(symbol)) / riskDist;
}
