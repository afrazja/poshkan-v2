"use client";

import AiScanner, { type AutoSettings } from "./AiScanner";
import SmcScanner from "./SmcScanner";
import type { SmcSettings, SmcSignal } from "@/app/dashboard/[accountId]/smc-actions";

// Unified "Scanners" section shown on every account. Each scanner is fully
// configurable on its target market and appears as a catalog teaser elsewhere.
// New strategies plug in here the same way (engine + settings + a card).
export default function ScannersSection({
  accountId,
  accountType,
  autoSettings,
  aiInstruction = null,
  smcSettings = null,
  smcSignals = [],
}: {
  accountId: string;
  accountType: string;
  autoSettings?: AutoSettings;
  aiInstruction?: string | null;
  smcSettings?: SmcSettings | null;
  smcSignals?: SmcSignal[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">📡 Scanners</h2>
        <p className="text-xs text-muted">
          Automated strategy scanners that watch the market for you — alert you or trade on their own.
          Free.
        </p>
      </div>

      {/* AI scanner — forex */}
      {accountType === "forex" ? (
        <AiScanner accountId={accountId} autoSettings={autoSettings} aiInstruction={aiInstruction} />
      ) : (
        <Teaser
          icon="🤖"
          name="AI Scanner"
          market="forex"
          desc="Hourly AI opportunity scanner for the major USD pairs — alerts, or auto-trades within your risk limits, optionally following your own plain-English strategy."
        />
      )}

      {/* SMC scanner — crypto */}
      {accountType === "crypto" ? (
        <SmcScanner accountId={accountId} initialSettings={smcSettings} initialSignals={smcSignals} />
      ) : (
        <Teaser
          icon="📈"
          name="SMC Scanner"
          market="crypto"
          desc="Smart-Money-Concepts engine: H1 trend (BOS) + M5 fair-value-gap / liquidity-sweep / confirmation. Deterministic — no AI in the decision."
        />
      )}
    </section>
  );
}

function Teaser({
  icon,
  name,
  market,
  desc,
}: {
  icon: string;
  name: string;
  market: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {icon} {name}
        </h3>
        <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted">
          {market} accounts
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{desc}</p>
      <p className="mt-2 text-[11px] text-muted">
        Available on {market} accounts — create one to turn this scanner on.
      </p>
    </div>
  );
}
