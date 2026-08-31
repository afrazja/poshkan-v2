"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { useRouter } from "next/navigation";
import { deactivateScanner } from "@/app/dashboard/scanners/actions";
import AiScanner, { type AutoSettings } from "@/components/account/AiScanner";
import ScannerOnboard from "@/components/scanners/ScannerOnboard";
import CronHealth from "@/components/scanners/CronHealth";
import { type ScannerKind } from "@/components/ScannerIcon";
import {
  BarChart3,
  BellRing,
  BookOpen,
  ChartNoAxesCombined,
  FlaskConical,
  ListChecks,
  Plus,
  Radio,
  ShieldCheck,
} from "lucide-react";
import CustomStrategiesPanel, { type CustomStrategySignalSummary } from "@/components/scanners/CustomStrategiesPanel";
import type { CustomStrategyRow } from "@/lib/custom-strategy-types";
import ScannerFilterBar, {
  type ScannerStatusFilter,
  type ScannerAssetFilter,
  type ScannerSort,
} from "@/components/scanners/ScannerFilterBar";

export interface ScanAcct {
  id: string;
  name: string;
  type: string;
  autoSettings: AutoSettings;
  aiInstruction: string | null;
  aiSymbols: string[] | null;
}

// One entry per scanner CARD (not per account) — drives the filter bar, search,
// and sort. Each def can answer "is this on for account X?" and "when did it
// last run, across all the user's accounts?" from data already loaded above.
interface ScannerDef {
  key: string;
  name: string;
  isEnabledFor: (a: ScanAcct) => boolean;
  lastRunAt: (accounts: ScanAcct[]) => string | null;
}

function freshest(accounts: ScanAcct[], pick: (a: ScanAcct) => string | null | undefined): string | null {
  const times = accounts.map(pick).filter(Boolean) as string[];
  return times.length ? times.sort().slice(-1)[0] : null;
}

const SCANNER_DEFS: ScannerDef[] = [
  {
    key: "ai",
    name: "AI Scanner",
    isEnabledFor: (a) => !!a.autoSettings?.enabled,
    lastRunAt: () => null,
  },
];

const LAB_WORKFLOW = [
  {
    label: "Define rules",
    description: "Choose symbols, a timeframe, and exact entry conditions.",
    Icon: ListChecks,
  },
  {
    label: "Set risk",
    description: "Decide the stop, target, and maximum holding time.",
    Icon: ShieldCheck,
  },
  {
    label: "Backtest",
    description: "Replay completed candles with estimated trading costs.",
    Icon: ChartNoAxesCombined,
  },
  {
    label: "Observe",
    description: "Watch paper alerts and learn where the idea breaks down.",
    Icon: BellRing,
  },
] as const;

// A scanner passes the filter if its name matches the search AND at least one
// of the user's accounts satisfies BOTH the asset-class and status filters
// together (not independently) — e.g. "Enabled + Crypto" means enabled on the
// SAME crypto account, not "enabled somewhere" plus "has a crypto account".
function matchesFilters(
  def: ScannerDef,
  accounts: ScanAcct[],
  search: string,
  status: ScannerStatusFilter,
  assetClass: ScannerAssetFilter
): boolean {
  if (search.trim() && !def.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
  if (status === "all" && assetClass === "all") return true;
  return accounts.some((a) => {
    if (assetClass !== "all" && a.type !== assetClass) return false;
    if (status === "enabled" && !def.isEnabledFor(a)) return false;
    if (status === "off" && def.isEnabledFor(a)) return false;
    return true;
  });
}

export default function ScannersHub({
  accounts,
  onboard = false,
  lastRunAt = null,
  anyEnabled = false,
  customStrategies,
  customSignals,
}: {
  accounts: ScanAcct[];
  onboard?: boolean;
  lastRunAt?: string | null;
  anyEnabled?: boolean;
  customStrategies: CustomStrategyRow[];
  customSignals: CustomStrategySignalSummary[];
}) {
  // Search / filter / sort over the scanner CARDS (not the accounts) — updates
  // live as the user types/clicks, no submit step.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ScannerStatusFilter>("all");
  const [assetClass, setAssetClass] = useState<ScannerAssetFilter>("all");
  const [sort, setSort] = useState<ScannerSort>("default");
  const [labTab, setLabTab] = useState<"templates" | "mine" | "live" | "results">("templates");

  const visible: Record<string, boolean> = {};
  for (const def of SCANNER_DEFS) visible[def.key] = matchesFilters(def, accounts, search, status, assetClass);

  const ranked = SCANNER_DEFS.map((def, i) => ({
    key: def.key,
    i,
    enabledAny: accounts.some((a) => def.isEnabledFor(a)),
    lastRun: def.lastRunAt(accounts),
  }));
  if (sort === "enabled") {
    ranked.sort((a, b) => Number(b.enabledAny) - Number(a.enabledAny) || a.i - b.i);
  } else if (sort === "recent") {
    ranked.sort((a, b) => {
      const at = a.lastRun ? new Date(a.lastRun).getTime() : -Infinity;
      const bt = b.lastRun ? new Date(b.lastRun).getTime() : -Infinity;
      return bt - at || a.i - b.i;
    });
  }
  const order: Record<string, number> = {};
  ranked.forEach((r, pos) => (order[r.key] = pos));

  const anyVisible = Object.values(visible).some(Boolean);
  const runningTemplates = SCANNER_DEFS.map((definition) => ({
    name: definition.name,
    accounts: accounts.filter((account) => definition.isEnabledFor(account)),
  })).filter((item) => item.accounts.length > 0);

  return (
    <div className="space-y-6">
      {onboard && <ScannerOnboard />}
      <section className="border-y border-border py-5" aria-labelledby="strategy-lab-title">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 id="strategy-lab-title" className="flex items-center gap-2 text-xl font-semibold">
              <FlaskConical size={20} className="text-primary" aria-hidden /> Strategy Lab
            </h1>
            <p className="mt-2 text-sm leading-6 text-foreground sm:text-base">
              Turn a market idea into explicit rules, test it on historical candles, then observe new
              matches with virtual money.
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              A strategy combines entry rules, risk limits, and exit rules. It is an experiment to
              measure, not a promise of profit.
            </p>
          </div>
          <Link
            href="/dashboard/scanners/new"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus size={16} aria-hidden /> <span className="hidden sm:inline">Create strategy</span>
            <span className="sr-only sm:hidden">Create strategy</span>
          </Link>
        </div>

        <ol className="mt-5 grid grid-cols-2 border-t border-border md:grid-cols-4" aria-label="Strategy workflow">
          {LAB_WORKFLOW.map(({ label, description, Icon }, index) => (
            <li
              key={label}
              className={`min-w-0 py-4 pr-3 ${
                index % 2 === 1 ? "border-l border-border pl-4" : ""
              } ${index >= 2 ? "border-t border-border md:border-t-0" : ""} ${
                index > 0 ? "md:border-l md:border-border md:pl-4" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon size={15} aria-hidden />
                </span>
                <span className="text-xs font-semibold text-muted">{index + 1}</span>
                <h2 className="text-sm font-semibold">{label}</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-4 border-b border-border" role="tablist" aria-label="Strategy Lab views">
        {([
          ["templates", "Templates", BookOpen],
          ["mine", "My strategies", FlaskConical],
          ["live", "Live", Radio],
          ["results", "Results", BarChart3],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={labTab === key}
            onClick={() => setLabTab(key)}
            className={`flex items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-medium sm:text-sm ${
              labTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Icon size={15} aria-hidden />
            <span className={key === "mine" ? "hidden min-[420px]:inline" : ""}>{label}</span>
          </button>
        ))}
      </div>

      {labTab === "templates" && (
        <>
          <div className="border-l-2 border-primary pl-3 text-sm text-muted">
            Start from a researched rule set, inspect how it works, then use what you learn to build your own experiment.
          </div>


      <ScannerFilterBar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        assetClass={assetClass}
        onAssetClassChange={setAssetClass}
        sort={sort}
        onSortChange={setSort}
      />

      <div className="flex flex-col gap-6">





        {visible.ai && (
          <div style={{ order: order.ai }}>
            <StrategyBlock
              accounts={accounts}
              scannerKey="ai"
              isActive={(a) => !!a.autoSettings?.enabled}
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
          </div>
        )}

        {!anyVisible && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted">
            No scanners match your filters.
          </div>
        )}
      </div>

        </>
      )}

      {labTab === "mine" && (
        <CustomStrategiesPanel strategies={customStrategies} signals={customSignals} accounts={accounts} />
      )}

      {labTab === "live" && (
        <div className="space-y-5">
          <CronHealth lastRunAt={lastRunAt} anyEnabled={anyEnabled} />
          {runningTemplates.length > 0 && (
            <section className="border-y border-border py-4">
              <h2 className="text-sm font-semibold">Template scanners running</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {runningTemplates.flatMap((item) =>
                  item.accounts.map((account) => (
                    <span
                      key={`${item.name}-${account.id}`}
                      className="rounded-full bg-positive/10 px-2.5 py-1 text-xs text-positive"
                    >
                      {item.name} / {account.name}
                    </span>
                  ))
                )}
              </div>
            </section>
          )}
          <CustomStrategiesPanel
            mode="live"
            strategies={customStrategies}
            signals={customSignals}
            accounts={accounts}
          />
        </div>
      )}

      {labTab === "results" && (
        <div className="space-y-6">
          <CustomStrategiesPanel
            mode="results"
            strategies={customStrategies}
            signals={customSignals}
            accounts={accounts}
          />
        </div>
      )}
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
    let cancelled = false;
    try {
      const stored = window.localStorage.getItem(scannerAccountKey(scannerKey));
      if (stored && accounts.some((a) => a.id === stored)) {
        queueMicrotask(() => {
          if (!cancelled) setSelectedId(stored);
        });
      }
    } catch {}
    return () => {
      cancelled = true;
    };
    // Only read the remembered choice once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerKey]);

  function selectAccount(id: string) {
    setSelectedId(id);
    try {
      window.localStorage.setItem(scannerAccountKey(scannerKey), id);
    } catch {}
  }

  const scannerName = SCANNER_DEFS.find((d) => d.key === scannerKey)?.name ?? "this scanner";

  // Deactivating stops a (possibly auto-trading) strategy — never on a stray
  // tap, so the × opens a styled confirm dialog first.
  const [confirmFor, setConfirmFor] = useState<{ id: string; name: string } | null>(null);

  async function deactivate(id: string) {
    setConfirmFor(null);
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
    <div className="space-y-1.5">
      {/* Named after its scanner and indented toward the card below — an
          unlabeled chip row floating between two cards reads as belonging to
          either, especially when accounts are named after scanners. */}
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-3">
          <span className="text-xs text-muted">{scannerName} · active on account{active.length === 1 ? "" : "s"}</span>
          {active.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 py-0.5 pl-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {a.name} ({a.type})
              <button
                onClick={() => setConfirmFor({ id: a.id, name: a.name })}
                disabled={busy === a.id}
                aria-label={`Deactivate for ${a.name}`}
                title="Deactivate for this account"
                className="-my-1.5 flex h-8 w-8 items-center justify-center rounded-full text-sm leading-none hover:text-negative disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* key forces a clean remount (state + polling) when switching accounts */}
      <div key={selected.id}>{render(selected, accountSelector)}</div>

      {confirmFor && (
        <Modal title={`Turn off ${scannerName}?`} onClose={() => setConfirmFor(null)}>
          <p className="text-sm text-muted">
            {scannerName} will stop scanning and trading on{" "}
            <span className="font-medium text-foreground">{confirmFor.name}</span>. Open positions
            stay open — only new signals stop. You can re-enable it anytime.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setConfirmFor(null)}
              className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-background"
            >
              Cancel
            </button>
            <button
              onClick={() => deactivate(confirmFor.id)}
              className="flex-1 rounded-lg bg-negative py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Turn off
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
