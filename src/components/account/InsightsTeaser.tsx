"use client";

import { useEffect, useState } from "react";
import { formatPercent, changeColor } from "@/lib/format";

// Compact "You vs S&P 500" chip for the account header — surfaces the buried
// Insights chart's headline number and clicks through to the full tab.
// Renders nothing until there's enough snapshot history to say anything.
export default function InsightsTeaser({
  accountId,
  onOpen,
}: {
  accountId: string;
  onOpen: () => void;
}) {
  const [you, setYou] = useState<number | null>(null);
  const [spy, setSpy] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/performance?accountId=${encodeURIComponent(accountId)}&range=3M`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const pts = (j.points ?? []) as { portfolio: number; spy: number | null }[];
        const last = pts[pts.length - 1];
        if (last) {
          setYou(last.portfolio);
          setSpy(last.spy);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accountId]);

  if (you == null) return null;
  return (
    <button
      onClick={onOpen}
      title="Open the full performance chart"
      className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs transition hover:border-primary/50"
    >
      📊 3M:
      <span className={`font-medium ${changeColor(you)}`}>You {formatPercent(you)}</span>
      {spy != null && <span className="text-muted">· S&P {formatPercent(spy)}</span>}
      <span className="text-muted">→</span>
    </button>
  );
}
