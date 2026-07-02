"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Briefly tints its background green/red when `value` changes — makes live
// quote updates visible instead of silently swapping text.
export default function FlashValue({ value, children }: { value: number; children: ReactNode }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prev.current !== value && Number.isFinite(value) && Number.isFinite(prev.current)) {
      setFlash(value > prev.current ? "up" : "down");
      prev.current = value;
      const t = setTimeout(() => setFlash(null), 900);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return (
    <span
      className={`-mx-1 rounded px-1 transition-colors duration-700 ${
        flash === "up" ? "bg-positive/20" : flash === "down" ? "bg-negative/20" : "bg-transparent"
      }`}
    >
      {children}
    </span>
  );
}
