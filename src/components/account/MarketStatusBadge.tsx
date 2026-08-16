"use client";

import { useEffect, useState } from "react";

// Market open/closed indicator for an account header. Probes one liquid
// symbol for the account's market (SPY for stocks, EUR/USD for forex) and
// refreshes every minute. Crypto never closes, so it gets a static badge.
const PROBE: Record<string, string> = { stocks: "SPY", forex: "EURUSD=X" };

export default function MarketStatusBadge({ market }: { market: string }) {
  const probe = PROBE[market];
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!probe) return;
    let active = true;
    const check = () =>
      fetch(`/api/quote?symbol=${encodeURIComponent(probe)}`)
        .then((r) => r.json())
        .then((j) => {
          if (active && typeof j.quote?.isMarketOpen === "boolean") setOpen(j.quote.isMarketOpen);
        })
        .catch(() => {});
    check();
    const t = setInterval(check, 60_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [probe]);

  if (market === "crypto") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2 py-0.5 text-[11px] font-medium text-positive">
        ● Market open 24/7
      </span>
    );
  }
  if (!probe || open == null) return null;

  return open ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2 py-0.5 text-[11px] font-medium text-positive">
      ● Market open
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-medium text-muted"
      title={
        market === "forex"
          ? "Forex trades 24/5 — closed for the weekend, reopens Sunday 5pm ET."
          : "US stocks trade 9:30am–4pm ET, Mon–Fri. Trading is disabled while closed; you can queue limit orders."
      }
    >
      ○ Market closed
    </span>
  );
}
