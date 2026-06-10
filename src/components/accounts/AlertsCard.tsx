"use client";

import { useRouter } from "next/navigation";
import type { Alert } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { deleteAlertAction } from "@/app/dashboard/[accountId]/actions";

// Price alerts list on the dashboard: triggered ones surface first.
export default function AlertsCard({ alerts }: { alerts: Alert[] }) {
  const router = useRouter();
  if (alerts.length === 0) return null;

  const triggered = alerts.filter((a) => a.status === "triggered");
  const active = alerts.filter((a) => a.status === "active");

  async function dismiss(id: string) {
    await deleteAlertAction(id);
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">Price alerts</h2>
      <div className="space-y-2">
        {triggered.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-positive/40 bg-positive/10 px-3 py-2 text-sm"
          >
            <span>
              🔔 <strong>{a.symbol}</strong> {a.condition === "ABOVE" ? "rose to" : "dropped to"}{" "}
              <strong>{formatCurrency(Number(a.triggered_price ?? a.target_price))}</strong>{" "}
              <span className="text-muted">(target {formatCurrency(Number(a.target_price))})</span>
            </span>
            <button onClick={() => dismiss(a.id)} className="shrink-0 text-xs text-muted hover:text-foreground">
              Dismiss
            </button>
          </div>
        ))}
        {active.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <span className="text-muted">
              Watching <strong className="text-foreground">{a.symbol}</strong> —{" "}
              {a.condition === "ABOVE" ? "rises to" : "drops to"}{" "}
              {formatCurrency(Number(a.target_price))}
            </span>
            <button onClick={() => dismiss(a.id)} className="shrink-0 text-xs text-muted hover:text-negative">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
