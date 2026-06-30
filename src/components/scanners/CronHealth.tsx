"use client";

import { useEffect, useState } from "react";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

// "Is my cron alive?" banner. All scanners share one /api/cron/scanners ping, so
// the freshest enabled-scanner run time tells us whether the cron is firing.
export default function CronHealth({
  lastRunAt,
  anyEnabled = false,
}: {
  lastRunAt: string | null;
  anyEnabled?: boolean;
}) {
  // Re-render periodically so the staleness reading stays current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!anyEnabled) return null; // nothing to monitor until a scanner is on

  const amber =
    "rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300";

  if (!lastRunAt) {
    return (
      <div className={amber}>
        ⚠️ Your scanners are enabled but haven&apos;t run yet. Make sure a cron job is pinging{" "}
        <code className="rounded bg-amber-500/15 px-1">/api/cron/scanners</code> every 1–5 minutes.
      </div>
    );
  }

  const mins = Math.round((Date.now() - new Date(lastRunAt).getTime()) / 60000);
  if (mins > 12) {
    return (
      <div className={amber}>
        ⚠️ Scanners haven&apos;t run in <strong>{ago(lastRunAt)}</strong> — your cron may have stopped.
        Check the job hitting <code className="rounded bg-amber-500/15 px-1">/api/cron/scanners</code>.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
      Scanners healthy · last ran {ago(lastRunAt)}
    </div>
  );
}
