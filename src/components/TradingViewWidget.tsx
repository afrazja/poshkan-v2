"use client";

import { useEffect, useRef } from "react";

// Embeds TradingView's free Advanced Chart widget (drawing tools, indicators,
// every timeframe) for a TradingView-format symbol like "FX:EURUSD".
export default function TradingViewWidget({
  tvSymbol,
  theme,
}: {
  tvSymbol: string;
  theme: "light" | "dark";
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML =
      '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: tvSymbol,
      autosize: true,
      theme,
      interval: "60",
      timezone: "Etc/UTC",
      style: "1",
      locale: "en",
      hide_side_toolbar: false,
      allow_symbol_change: true,
      withdateranges: true,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [tvSymbol, theme]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ height: "100%", width: "100%" }}
    />
  );
}
