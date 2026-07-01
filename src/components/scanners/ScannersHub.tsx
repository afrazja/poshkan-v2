"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deactivateScanner } from "@/app/dashboard/scanners/actions";
import AiScanner, { type AutoSettings } from "@/components/account/AiScanner";
import SmcScanner from "@/components/account/SmcScanner";
import OteScanner from "@/components/account/OteScanner";
import TrendScanner from "@/components/account/TrendScanner";
import MeanRevScanner from "@/components/account/MeanRevScanner";
import CandleRangeScanner from "@/components/account/CandleRangeScanner";
import ScannerOnboard from "@/components/scanners/ScannerOnboard";
import CronHealth from "@/components/scanners/CronHealth";
import ScannerCompare from "@/components/scanners/ScannerCompare";
import ScannerActivity, { type ActivityItem } from "@/components/scanners/ScannerActivity";
import type { SmcSettings, SmcSignal } from "@/app/dashboard/[accountId]/smc-actions";
import type { OteSettings, OteSignal } from "@/app/dashboard/[accountId]/ote-actions";
import type { TrendSettings, TrendSignal } from "@/app/dashboard/[accountId]/trend-actions";
import type { MeanRevSettings, MeanRevSignal } from "@/app/dashboard/[accountId]/meanrev-actions";
import type { CandleRangeSettings, CandleRangeSignal } from "@/app/dashboard/[accountId]/candlerange-actions";

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
  trendSettings: TrendSettings | null;
  trendSignals: TrendSignal[];
  meanrevSettings: MeanRevSettings | null;
  meanrevSignals: MeanRevSignal[];
  candlerangeSettings: CandleRangeSettings | null;
  candlerangeSignals: CandleRangeSignal[];
}

export default function ScannersHub({
  accounts,
  onboard = false,
  lastRunAt = null,
  anyEnabled = false,
}: {
  accounts: ScanAcct[];
  onboard?: boolean;
  lastRunAt?: string | null;
  anyEnabled?: boolean;
}) {
  // One chronological activity feed, built from the signals already loaded above.
  type Sig = {
    id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    entry: number | null;
    take_profit: number | null;
    reason: string | null;
    executed: boolean;
    created_at: string;
  };
  const activity: ActivityItem[] = accounts.flatMap((a) => {
    const groups: { arr: Sig[]; icon: string; name: string }[] = [
      { arr: a.smcSignals as unknown as Sig[], icon: "📈", name: "SMC" },
      { arr: a.oteSignals as unknown as Sig[], icon: "🎯", name: "OTE" },
      { arr: a.trendSignals as unknown as Sig[], icon: "🚀", name: "Trend" },
      { arr: a.meanrevSignals as unknown as Sig[], icon: "↩️", name: "Mean Rev" },
      { arr: a.candlerangeSignals as unknown as Sig[], icon: "📦", name: "Range" },
    ];
    return groups.flatMap((g) =>
      (g.arr ?? []).map((sig) => ({
        id: `${g.name}-${sig.id}`,
        createdAt: sig.created_at,
        accountName: a.name,
        icon: g.icon,
        scanner: g.name,
        symbol: sig.symbol,
        direction: sig.direction,
        executed: sig.executed,
        entry: sig.entry,
        takeProfit: sig.take_profit,
        reason: sig.reason,
      }))
    );
  });

  return (
    <div className="space-y-6">
      {onboard && <ScannerOnboard />}
      <CronHealth lastRunAt={lastRunAt} anyEnabled={anyEnabled} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">📡 Scanners</h1>
          <p className="mt-1 text-sm text-muted">
            Automated strategy scanners that watch the market for you 24/7 — they alert you, or trade on
            their own within the risk limits you set. Each uses a different <em>edge</em> (trend-following,
            mean-reversion, smart-money structure, or AI judgement), so they shine in different market
            conditions. Open any card and tap <strong>“How it works”</strong> to learn what it does. Free.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 text-sm text-muted hover:text-foreground hover:underline"
        >
          ← Your accounts
        </Link>
      </div>

      <ScannerCompare accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))} />

      <StrategyBlock
        accounts={accounts}
        scannerKey="ai"
        isActive={(a) => a.autoSettings.enabled}
        render={(a, accountSelector) => (
          <AiScanner
            accountId={a.id}
            accountType={a.type}
            autoSettings={a.autoSettings}
            aiInstruction={a.aiInstruction}
            aiSymbols={a.aiSymbols}
            accountSelector={accountSelector}
          />
        )}
      />

      <StrategyBlock
        accounts={accounts}
        scannerKey="smc"
        isActive={(a) => !!a.smcSettings?.enabled}
        render={(a, accountSelector) => (
          <SmcScanner
            accountId={a.id}
            accountType={a.type}
            initialSettings={a.smcSettings}
            initialSignals={a.smcSignals}
            accountSelector={accountSelector}
          />
        )}
      />

      <StrategyBlock
        accounts={accounts}
        scannerKey="ote"
        isActive={(a) => !!a.oteSettings?.enabled}
        render={(a, accountSelector) => (
          <OteScanner
            accountId={a.id}
            accountType={a.type}
            initialSettings={a.oteSettings}
            initialSignals={a.oteSignals}
            accountSelector={accountSelector}
          />
        )}
      />

      <StrategyBlock
        accounts={accounts}
        scannerKey="trend"
        isActive={(a) => !!a.trendSettings?.enabled}
        render={(a, accountSelector) => (
          <TrendScanner
            accountId={a.id}
            accountType={a.type}
            initialSettings={a.trendSettings}
            initialSignals={a.trendSignals}
            accountSelector={accountSelector}
          />
        )}
      />

      <StrategyBlock
        accounts={accounts}
        scannerKey="meanrev"
        isActive={(a) => !!a.meanrevSettings?.enabled}
        render={(a, accountSelector) => (
          <MeanRevScanner
            accountId={a.id}
            accountType={a.type}
            initialSettings={a.meanrevSettings}
            initialSignals={a.meanrevSignals}
            accountSelector={accountSelector}
          />
        )}
      />

      <StrategyBlock
        accounts={accounts}
        scannerKey="candlerange"
        isActive={(a) => !!a.candlerangeSettings?.enabled}
        render={(a, accountSelector) => (
          <CandleRangeScanner
            accountId={a.id}
            accountType={a.type}
            initialSettings={a.candlerangeSettings}
            initialSignals={a.candlerangeSignals}
            accountSelector={accountSelector}
          />
        )}
      />

      <ScannerActivity items={activity} />
    </div>
  );
}

// localStorage key for the last account chosen per scanner (so the picker
// remembers your choice across reloads instead of resetting to account #1).
const scannerAccountKey = (scannerKey: string) => `poshkan-scanner-account:${scannerKey}`;

function StrategyBlock({
  accounts,
  render,
  scannerKey,
  isActive,
}: {
  accounts: ScanAcct[];
  render: (account: ScanAcct, accountSelector: ReactNode) => ReactNode;
  scannerKey: string;
  isActive: (a: ScanAcct) => boolean;
}) {
  const router = useRouter();
  const active = accounts.filter(isActive);
  // SSR-safe default: the account this scanner is already active on, else the
  // first account. A remembered per-scanner choice overrides it after mount.
  const [selectedId, setSelectedId] = useState(active[0]?.id ?? accounts[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(scannerAccountKey(scannerKey));
      if (stored && accounts.some((a) => a.id === stored)) setSelectedId(stored);
    } catch {}
    // Only read the remembered choice once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerKey]);

  function selectAccount(id: string) {
    setSelectedId(id);
    try {
      window.localStorage.setItem(scannerAccountKey(scannerKey), id);
    } catch {}
  }

  async function deactivate(id: string) {
    setBusy(id);
    await deactivateScanner(id, scannerKey);
    setBusy(null);
    router.refresh();
  }

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

  // Rendered inside each scanner card's header (right-aligned next to the
  // title) — not floated above the card — so it's unambiguous which scanner
  // it controls.
  const accountSelector: ReactNode =
    accounts.length > 1 ? (
      <select
        value={selected.id}
        onChange={(e) => selectAccount(e.target.value)}
        aria-label="Account"
        className="rounded-lg border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.type})
          </option>
        ))}
      </select>
    ) : null;

  return (
    <div className="space-y-2">
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Active on</span>
          {active.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {a.name} ({a.type})
              <button
                onClick={() => deactivate(a.id)}
                disabled={busy === a.id}
                aria-label={`Deactivate for ${a.name}`}
                title="Deactivate for this account"
                className="rounded-full leading-none hover:text-negative disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* key forces a clean remount (state + polling) when switching accounts */}
      <div key={selected.id}>{render(selected, accountSelector)}</div>
    </div>
  );
}
