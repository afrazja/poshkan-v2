"use client";

import { useState } from "react";
import Link from "next/link";
import AiScanner, { type AutoSettings } from "@/components/account/AiScanner";
import SmcScanner from "@/components/account/SmcScanner";
import OteScanner from "@/components/account/OteScanner";
import ScannerOnboard from "@/components/scanners/ScannerOnboard";
import type { SmcSettings, SmcSignal } from "@/app/dashboard/[accountId]/smc-actions";
import type { OteSettings, OteSignal } from "@/app/dashboard/[accountId]/ote-actions";

export interface ScanAcct {
  id: string;
  name: string;
  type: string;
  autoSettings: AutoSettings;
  aiInstruction: string | null;
  aiSymbols: string[] | null;
  smcSettings: SmcSettings | null;
  smcSignals: SmcSignal[];
  oteSettings: OteSettings | null;
  oteSignals: OteSignal[];
}

export default function ScannersHub({
  accounts,
  onboard = false,
}: {
  accounts: ScanAcct[];
  onboard?: boolean;
}) {
  return (
    <div className="space-y-6">
      {onboard && <ScannerOnboard />}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">📡 Scanners</h1>
          <p className="mt-1 text-sm text-muted">
            Automated strategy scanners that watch the market for you — alert you or trade on their own.
            Both run on any account; pick which account to configure each on. Free.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 text-sm text-muted hover:text-foreground hover:underline"
        >
          ← Your accounts
        </Link>
      </div>

      <StrategyBlock
        accounts={accounts}
        render={(a) => (
          <AiScanner
            accountId={a.id}
            accountType={a.type}
            autoSettings={a.autoSettings}
            aiInstruction={a.aiInstruction}
            aiSymbols={a.aiSymbols}
          />
        )}
      />

      <StrategyBlock
        accounts={accounts}
        render={(a) => (
          <SmcScanner
            accountId={a.id}
            accountType={a.type}
            initialSettings={a.smcSettings}
            initialSignals={a.smcSignals}
          />
        )}
      />

      <StrategyBlock
        accounts={accounts}
        render={(a) => (
          <OteScanner
            accountId={a.id}
            accountType={a.type}
            initialSettings={a.oteSettings}
            initialSignals={a.oteSignals}
          />
        )}
      />
    </div>
  );
}

function StrategyBlock({
  accounts,
  render,
}: {
  accounts: ScanAcct[];
  render: (account: ScanAcct) => React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id ?? "");

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4">
        <p className="text-sm text-muted">
          You don&apos;t have any accounts yet.{" "}
          <Link href="/dashboard" className="text-primary hover:underline">
            Create one
          </Link>{" "}
          to run a scanner.
        </p>
      </div>
    );
  }

  const selected = accounts.find((a) => a.id === selectedId) ?? accounts[0];

  return (
    <div className="space-y-2">
      {accounts.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Account</span>
          <select
            value={selected.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-border bg-input px-2 py-1.5 text-sm outline-none focus:border-primary"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </select>
        </div>
      )}
      {/* key forces a clean remount (state + polling) when switching accounts */}
      <div key={selected.id}>{render(selected)}</div>
    </div>
  );
}
