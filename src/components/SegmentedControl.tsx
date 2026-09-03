"use client";

import type { ReactNode } from "react";

// One switch for every either/or in the app: the symbol panel's two tabs,
// market vs limit, dollars vs shares, good-til-canceled vs day. They were four
// near-copies that had already drifted apart; sharing one keeps the live option
// always filled rather than a tint you have to hunt for.
//
// `as="tabs"` announces a tablist for switching views; the default announces a
// radio group, which is what an order-type or unit choice actually is.
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  fill = true,
  as = "radio",
  label,
  className = "",
}: {
  options: { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  size?: "sm" | "md";
  /** Split the width equally. Off makes each option only as wide as its label. */
  fill?: boolean;
  as?: "radio" | "tabs";
  label?: string;
  className?: string;
}) {
  const tabs = as === "tabs";
  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      className={`flex gap-1 rounded-lg border border-border bg-background ${
        size === "sm" ? "p-0.5" : "p-1"
      } ${className}`}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role={tabs ? "tab" : "radio"}
            {...(tabs ? { "aria-selected": on } : { "aria-checked": on })}
            onClick={() => onChange(o.key)}
            className={`rounded-md font-medium transition ${
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"
            } ${fill ? "flex-1" : ""} ${
              on
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted hover:bg-card hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
