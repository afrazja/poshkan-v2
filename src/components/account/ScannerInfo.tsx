"use client";

import { useState } from "react";

export interface ScannerInfoProps {
  whatItIs: string; // one-line plain-English purpose (always shown)
  bestWhen: string; // the market conditions it's built for
  how: string[]; // ordered steps it uses to find a trade
  reading: string; // how to read the live per-symbol feed
  judge: string; // how to judge the backtest numbers
}

// A consistent, embedded explainer for each scanner — a plain-English summary
// always visible, with the details one tap away. Helps newcomers grasp the edge.
export default function ScannerInfo({ whatItIs, bestWhen, how, reading, judge }: ScannerInfoProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-border bg-background/60 p-2.5 text-xs">
      <p className="text-muted">
        <span className="font-semibold text-foreground">What it is — </span>
        {whatItIs}
      </p>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 font-medium text-primary hover:underline"
      >
        {open ? "Hide details" : "How it works ▾"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-muted">
          <p>
            <span className="font-semibold text-foreground">Best when: </span>
            {bestWhen}
          </p>
          <div>
            <span className="font-semibold text-foreground">How it finds a trade:</span>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              {how.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
          </div>
          <p>
            <span className="font-semibold text-foreground">Reading the live feed: </span>
            {reading}
          </p>
          <p>
            <span className="font-semibold text-foreground">Judge it by: </span>
            {judge}
          </p>
        </div>
      )}
    </div>
  );
}
