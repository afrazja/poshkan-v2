"use client";

import { useState } from "react";
import Link from "next/link";
import AiScanner, { type AutoSettings } from "@/components/account/AiScanner";
import SmcScanner from "@/components/account/SmcScanner";
import type { SmcSettings, SmcSignal } from "@/app/dashboard/[accountId]/smc-actions";

export interface ForexAcct {
  id: string;
  name: string;
  autoSettings: AutoSettings;
  aiInstruction: string | null;
}
export interface CryptoAcct {
  id: string;
  name: string;
  smcSettings: SmcSettings | null;
  smcSignals: SmcSignal[];
}

export default function ScannersHub({
  forexAccounts,
  cryptoAccounts,
}: {
  forexAccounts: ForexAcct[];
  cryptoAccounts: CryptoAcct[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">📡 Scanners</h1>
        <p className="mt-1 text-sm text-muted">
          Automated strategy scanners that watch the market for you — alert you or trade on their own.
          Configure each strategy on the account it runs on. Free.
        </p>
      </div>

      <StrategyBlock
        icon="🤖"
        title="AI Scanner"
        market="Forex"
        emptyMarket="forex"
        accounts={forexAccounts}
        render={(a) => (
          <AiScanner accountId={a.id} autoSettings={a.autoSettings} aiInstruction={a.aiInstruction} />
        )}
      />

      <StrategyBlock
        icon="📈"
        title="SMC Scanner"
        market="Crypto"
        emptyMarket="crypto"
        accounts={cryptoAccounts}
        render={(a) => (
          <SmcScanner accountId={a.id} initialSettings={a.smcSettings} initialSignals={a.smcSignals} />
        )}
      />
    </div>
  );
}

function StrategyBlock<T extends { id: string; name: string }>({
  icon,
  title,
  market,
  emptyMarket,
  accounts,
  render,
}: {
  icon: string;
  title: string;
  market: string;
  emptyMarket: string;
  accounts: T[];
  render: (account: T) => React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id ?? "");

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            {icon} {title}
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium capitalize text-primary">
            {market}
          </span>
          <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted">
            No account
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          You don&apos;t have a {emptyMarket} account yet. Create one to run the {title}.
        </p>
        <Link href="/dashboard" className="mt-2 inline-block text-xs text-primary hover:underline">
          Go to accounts →
        </Link>
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
                {a.name}
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
