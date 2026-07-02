"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  setAiInstructionAction,
  setAutoSettingsAction,
  setAiSymbolsAction,
} from "@/app/dashboard/[accountId]/actions";
import ScannerCard from "./ScannerCard";
import ScannerIcon from "@/components/ScannerIcon";
import ScannerInfo from "./ScannerInfo";
import ScannerStatusBadges from "./ScannerStatusBadges";
import { SettingsSection, Field, PercentSlider } from "./ScannerSettingsUI";
import InfoTooltip from "./InfoTooltip";
import { useUnsavedGuard, confirmDiscardUnsaved, UnsavedBadge } from "./UnsavedChanges";
import SymbolSearch from "@/components/SymbolSearch";
import { marketUniverse, symbolLabel, assetTypeError } from "@/lib/assets";
import { FX_PAIRS } from "@/lib/forex";

export interface AutoSettings {
  enabled: boolean;
  riskPct: number; // percent shown in UI (1 = 1%)
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number; // percent
  minMinutes: number;
  leverage: number; // per-trade leverage 1/2/5/10
  maxPositionPct: number; // max % of account per trade
}

export const DEFAULT_AUTO_SETTINGS: AutoSettings = {
  enabled: false,
  riskPct: 1,
  maxOpen: 3,
  maxPerDay: 2,
  dailyLossPct: 3,
  minMinutes: 60,
  leverage: 1,
  maxPositionPct: 25,
};

// The AI (forex) scanner: autonomous-trading limits + plain-English strategy.
export default function AiScanner({
  accountId,
  accountType,
  autoSettings = DEFAULT_AUTO_SETTINGS,
  aiInstruction = null,
  aiSymbols = null,
  defaultOpen = false,
  accountSelector,
}: {
  accountId: string;
  accountType: string;
  autoSettings?: AutoSettings;
  aiInstruction?: string | null;
  aiSymbols?: string[] | null;
  defaultOpen?: boolean;
  accountSelector?: ReactNode;
}) {
  // Aggregated across the 3 independent sub-forms below, so the card as a
  // whole knows whether ANY of them has unsaved edits (for the beforeunload
  // warning and the collapse-confirm).
  const [autoDirty, setAutoDirty] = useState(false);
  const [symbolsDirty, setSymbolsDirty] = useState(false);
  const [instructionDirty, setInstructionDirty] = useState(false);
  const anyDirty = autoDirty || symbolsDirty || instructionDirty;
  useUnsavedGuard(anyDirty);

  return (
    <ScannerCard
      icon={<ScannerIcon kind="ai" size={18} />}
      name="AI Scanner"
      defaultOpen={defaultOpen}
      confirmClose={() => !anyDirty || confirmDiscardUnsaved()}
      headerExtra={
        <>
          {/* Always scanning (no independent on/off) — the toggle below only
              decides whether it's allowed to auto-trade, so that's the "mode". */}
          <ScannerStatusBadges enabled mode={autoSettings.enabled ? "auto" : "alert"} />
          {accountSelector}
        </>
      }
    >
      <ScannerInfo
        whatItIs="A discretionary scanner powered by Claude — instead of a fixed formula, it reads the market and your plain-English instructions to decide trades. The flexible one."
        bestWhen="When you want judgement and nuance, or to encode your own rules in plain words rather than rigid parameters."
        how={[
          "You write a strategy in plain English (or leave it to the built-in one).",
          "On each run, Claude analyses your chosen symbols and the recent price action.",
          "It proposes trades with an entry, stop and target and a rationale.",
          "It alerts you, or auto-trades within the risk limits you set below.",
        ]}
        reading="It needs your own Anthropic API key (set in the top-bar menu). 'Recent signals' shows what it proposed and whether it was traded."
        judge="Unlike the others it isn't backtestable (the model isn't deterministic) — judge it by its live signals and your own review."
      />
      <div className="my-4 border-t border-border" />
      <AutoSettingsCard accountId={accountId} initial={autoSettings} onDirtyChange={setAutoDirty} />
      <div className="my-4 border-t border-border" />
      <AiSymbolsCard
        accountId={accountId}
        accountType={accountType}
        initial={aiSymbols ?? []}
        onDirtyChange={setSymbolsDirty}
      />
      <div className="my-4 border-t border-border" />
      <AiInstructionCard
        accountId={accountId}
        initial={aiInstruction ?? ""}
        onDirtyChange={setInstructionDirty}
      />
    </ScannerCard>
  );
}

// ---------------------------------------------------------------------------
// Which symbols the AI scanner analyzes (validated to the account's asset class).
function AiSymbolsCard({
  accountId,
  accountType,
  initial,
  onDirtyChange,
}: {
  accountId: string;
  accountType: string;
  initial: string[];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [symbols, setSymbols] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(symbols) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  const presets = marketUniverse(accountType);

  const add = (s: string) =>
    setSymbols((p) => (p.includes(s) || assetTypeError(accountType, s) ? p : [...p, s]));
  const toggle = (s: string) =>
    setSymbols((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const remove = (s: string) => setSymbols((p) => p.filter((x) => x !== s));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await setAiSymbolsAction(accountId, symbols);
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg("✓ Saved");
      router.refresh();
    } catch (e) {
      setMsg(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Symbols to scan ({accountType})</h3>
        <div className="flex items-center gap-2">
          {dirty && !saving && <UnsavedBadge />}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-muted">
        Pick which {accountType} symbols the AI analyzes. Leave empty to use the market default.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {symbols.length === 0 ? (
          <span className="text-xs text-muted">Empty — using the market default.</span>
        ) : (
          symbols.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary"
            >
              {symbolLabel(s)}
              <button
                onClick={() => remove(s)}
                aria-label={`Remove ${s}`}
                className="text-primary/70 hover:text-negative"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      {accountType === "forex" ? (
        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-background p-2">
          {FX_PAIRS.map((p) => (
            <button
              key={p.symbol}
              onClick={() => toggle(p.symbol)}
              className={`rounded-lg border px-2 py-1 text-xs ${
                symbols.includes(p.symbol) ? "border-primary bg-primary/10 text-primary" : "border-border"
              }`}
            >
              {symbolLabel(p.symbol)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <SymbolSearch
            assetType={accountType}
            placeholder={accountType === "crypto" ? "Add a crypto…" : "Add a stock…"}
            onSelect={(r) => add(r.symbol)}
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {presets.map((s) => (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={`rounded-lg border px-2 py-1 text-[11px] ${
                  symbols.includes(s) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"
                }`}
              >
                {symbols.includes(s) ? "✓ " : "+ "}
                {symbolLabel(s)}
              </button>
            ))}
          </div>
        </>
      )}
      {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-account autonomous-trading controls (on/off, risk, caps, frequency).
function AutoSettingsCard({
  accountId,
  initial,
  onDirtyChange,
}: {
  accountId: string;
  initial: AutoSettings;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [s, setS] = useState<AutoSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await setAutoSettingsAction(accountId, s);
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg("✓ Saved");
      router.refresh();
    } catch (e) {
      setMsg(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<AutoSettings>) => setS((p) => ({ ...p, ...patch }));
  // Resets the tunable knobs below (not the on/off toggle) back to Poshkan's
  // recommended starting values.
  const resetDefaults = () => setS((p) => ({ ...DEFAULT_AUTO_SETTINGS, enabled: p.enabled }));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Auto-trade limits</h3>
        <button
          onClick={() => set({ enabled: !s.enabled })}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            s.enabled ? "bg-positive text-white" : "bg-background text-muted border border-border"
          }`}
        >
          {s.enabled ? "On" : "Off"}
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        When on, the hourly AI scanner opens trades on this account automatically — within the limits
        below. These hard limits always apply, whatever your strategy text says.
      </p>

      <div className="space-y-3">
        <SettingsSection title="Risk management">
          <PercentSlider
            label="Risk per trade"
            value={String(s.riskPct)}
            onChange={(v) => set({ riskPct: Number(v) })}
            min={0.1}
            max={10}
            step={0.1}
            tip="The % of your account you're willing to lose if this trade hits its stop-loss."
          />
          <PercentSlider
            label="Max position size"
            value={String(s.maxPositionPct)}
            onChange={(v) => set({ maxPositionPct: Number(v) })}
            min={5}
            max={100}
            step={1}
            tip="The largest slice of your account a single trade's margin can use, regardless of the risk sizing above."
          />
          <PercentSlider
            label="Daily loss limit"
            value={String(s.dailyLossPct)}
            onChange={(v) => set({ dailyLossPct: Number(v) })}
            min={0.5}
            max={50}
            step={0.5}
            tip="If today's realized losses reach this % of your account, the scanner stops trading for the rest of the day."
          />
          <div>
            <label className="mb-1 flex items-center text-xs font-medium text-muted">
              Leverage
              <InfoTooltip text="Multiplies your position size (and both gains and losses) per trade. 1× = no leverage." />
            </label>
            <select
              value={s.leverage}
              onChange={(e) => set({ leverage: Number(e.target.value) })}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {[1, 2, 5, 10].map((x) => (
                <option key={x} value={x}>
                  {x}×{x === 1 ? " (none)" : ""}
                </option>
              ))}
            </select>
          </div>
        </SettingsSection>

        <SettingsSection title="Execution limits">
          <Field
            label="Max open"
            value={String(s.maxOpen)}
            onChange={(v) => set({ maxOpen: Number(v) })}
            min={1}
            max={20}
            step={1}
            tip="The most positions this scanner can hold open at the same time."
          />
          <Field
            label="Max trades / day"
            value={String(s.maxPerDay)}
            onChange={(v) => set({ maxPerDay: Number(v) })}
            min={1}
            max={50}
            step={1}
            tip="The most NEW trades this scanner can open in a single day."
          />
          <Field
            label="Min minutes between trades"
            value={String(s.minMinutes)}
            onChange={(v) => set({ minMinutes: Number(v) })}
            min={5}
            max={1440}
            step={5}
            tip="The minimum time the scanner must wait after opening one trade before it's allowed to open another."
          />
        </SettingsSection>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={resetDefaults}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-60"
        >
          Reset to defaults
        </button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {dirty && !saving && <UnsavedBadge />}
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Frequency is set here (min minutes between trades). The external cron just needs to run at least
        that often.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable per-account AI trading instructions for the hourly scanner.
const AI_EXAMPLE = `e.g. Only trade EUR/USD and GBP/USD.
Trade with the daily trend — enter on a pullback to the 20-period SMA on the 1h.
Put the stop just beyond the recent swing; target at least 2:1 reward-to-risk.
Skip trades when RSI is already overbought/oversold, and avoid the Asian session.`;

function AiInstructionCard({
  accountId,
  initial,
  onDirtyChange,
}: {
  accountId: string;
  initial: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = value !== initial;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await setAiInstructionAction(accountId, value);
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg("✓ Saved — the AI scanner will use this on its next run.");
      router.refresh();
    } catch (e) {
      setMsg(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Strategy (plain English)</h3>
        <div className="flex items-center gap-2">
          {dirty && !saving && <UnsavedBadge />}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-muted">
        Tell the hourly AI scanner how to trade this account, in plain English. Leave blank to use
        Poshkan&apos;s built-in strategy. Risk limits (≥2:1 reward-to-risk, position caps, daily
        loss-limit) always apply on top of your instructions.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        placeholder={AI_EXAMPLE}
        className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
    </div>
  );
}
