"use client";

import { useEffect, useRef, useState } from "react";

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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setLoaded(false);
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

    // The widget injects an <iframe> once it's ready — drop the loader then.
    const obs = new MutationObserver(() => {
      if (container.querySelector("iframe")) {
        setLoaded(true);
        obs.disconnect();
      }
    });
    obs.observe(container, { childList: true, subtree: true });
    const fallback = setTimeout(() => setLoaded(true), 10_000); // safety net

    return () => {
      obs.disconnect();
      clearTimeout(fallback);
      container.innerHTML = "";
    };
  }, [tvSymbol, theme]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: "100%", width: "100%" }}
      />
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-xs text-muted">Loading advanced chart…</p>
        </div>
      )}
    </div>
  );
}
