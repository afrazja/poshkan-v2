"use client";

import { useEffect, useState } from "react";
import Sparkline from "@/components/Sparkline";

// 30-day equity sparkline for the account header — one glance shows the
// trajectory, not just today's position. Renders nothing until there are at
// least two nightly snapshots.
export default function EquitySpark({ accountId }: { accountId: string }) {
  const [values, setValues] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/equity-curve?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const pts = (j.points ?? []) as { value: number }[];
        setValues(pts.slice(-30).map((p) => p.value));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accountId]);

  if (values.length < 2) return null;
  return (
    <div className="flex flex-col items-end">
      <Sparkline values={values} width={132} height={38} />
      <span className="mt-0.5 text-[10px] text-muted">last {values.length} days</span>
    </div>
  );
}
