"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TradingViewWidget from "./TradingViewWidget";

// Map a Yahoo symbol to a TradingView symbol.
//  - Forex:  EURUSD=X → FX:EURUSD
//  - Crypto: BTC-USD  → CRYPTO:BTCUSD
//  - Stocks: AAPL     → AAPL (TradingView resolves the primary listing)
function tvSymbol(yahoo: string): string {
  const s = yahoo.toUpperCase().trim();
  if (/=X$/.test(s)) return `FX:${s.replace(/=X$/, "")}`;
  if (/-(USD|USDT|EUR|GBP|BTC|ETH)$/.test(s)) return `CRYPTO:${s.replace("-", "")}`;
  return s;
}

export default function ChartView({ symbol }: { symbol: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-semibold">
          {symbol} <span className="font-normal text-muted">· advanced chart</span>
        </span>
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground hover:underline">
          Close
        </Link>
      </div>
      <div className="flex-1">
        <TradingViewWidget tvSymbol={tvSymbol(symbol)} theme={theme} />
      </div>
    </div>
  );
}
