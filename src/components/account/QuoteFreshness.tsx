"use client";

import { useEffect, useState } from "react";

/**
 * Tells the user how old the prices on screen are, and says so loudly when
 * they are being served from a stale cache because the provider failed.
 *
 * In a simulator, an unmarked number is worse than a wrong one — this is the
 * mark. Three states:
 *   ● Prices 12s ago        healthy, ticking
 *   ◐ Prices 3m ago         nothing has refreshed for a while (polling stopped?)
 *   ◐ Prices delayed        the provider is unreachable; these are the last known
 */
export default function QuoteFreshness({
  asOf,
  stale,
  className = "",
}: {
  asOf: string | null;
  stale: boolean;
  className?: string;
}) {
  // Start the clock AT the quote's own timestamp so the server and the first
  // client render agree ("0s ago"); only after mount does real time take over.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!asOf) return null;
  const at = Date.parse(asOf);
  if (!Number.isFinite(at)) return null;
  const age = Math.max(0, Math.round(((now ?? at) - at) / 1000));
  const label = age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`;
  const when = new Date(at).toLocaleTimeString();

  if (stale) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium normal-case text-amber-600 dark:text-amber-400 ${className}`}
        title={`The market-data provider could not be reached. These are the last prices we have, from ${when}.`}
      >
        ◐ Prices delayed · last known {label}
      </span>
    );
  }

  // Quiet while fresh; amber once nothing has refreshed for two minutes, which
  // usually means polling stopped (tab in the background) or the API is failing.
  const old = age > 120;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] normal-case ${old ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted"} ${className}`}
      title={`Last refreshed ${when}`}
    >
      {old ? "◐" : "●"} Prices {label}
    </span>
  );
}
