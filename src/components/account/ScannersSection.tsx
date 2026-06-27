"use client";

import AiScanner, { type AutoSettings } from "./AiScanner";
import SmcScanner from "./SmcScanner";
import type { SmcSettings, SmcSignal } from "@/app/dashboard/[accountId]/smc-actions";

// Unified "Scanners" section shown on every account. Both scanners work on every
// market now, so both are configurable here. New strategies plug in the same way.
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

      <AiScanner accountId={accountId} autoSettings={autoSettings} aiInstruction={aiInstruction} />
      <SmcScanner
        accountId={accountId}
        accountType={accountType}
        initialSettings={smcSettings}
        initialSignals={smcSignals}
      />
    </section>
  );
}
