"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAiInstructionAction, setAutoSettingsAction } from "@/app/dashboard/[accountId]/actions";

export interface AutoSettings {
  enabled: boolean;
  riskPct: number; // percent shown in UI (1 = 1%)
  maxOpen: number;
  maxPerDay: number;
  dailyLossPct: number; // percent
  minMinutes: number;
}

export const DEFAULT_AUTO_SETTINGS: AutoSettings = {
  enabled: false,
  riskPct: 1,
  maxOpen: 3,
  maxPerDay: 2,
  dailyLossPct: 3,
  minMinutes: 60,
};

// The AI (forex) scanner: autonomous-trading limits + plain-English strategy.
export default function AiScanner({
  accountId,
  autoSettings = DEFAULT_AUTO_SETTINGS,
  aiInstruction = null,
}: {
  accountId: string;
  autoSettings?: AutoSettings;
  aiInstruction?: string | null;
}) {
  return (
    <div className="space-y-4">
      <AutoSettingsCard accountId={accountId} initial={autoSettings} />
      <AiInstructionCard accountId={accountId} initial={aiInstruction ?? ""} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-account autonomous-trading controls (on/off, risk, caps, frequency).
function AutoSettingsCard({ accountId, initial }: { accountId: string; initial: AutoSettings }) {
  const router = useRouter();
  const [s, setS] = useState<AutoSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

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

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">🤖 Autonomous trading</h2>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField label="Risk per trade %" value={s.riskPct} step="0.1" onChange={(v) => set({ riskPct: v })} />
        <NumField label="Max open" value={s.maxOpen} step="1" onChange={(v) => set({ maxOpen: v })} />
        <NumField label="Max trades / day" value={s.maxPerDay} step="1" onChange={(v) => set({ maxPerDay: v })} />
        <NumField label="Daily loss limit %" value={s.dailyLossPct} step="0.5" onChange={(v) => set({ dailyLossPct: v })} />
        <NumField label="Min minutes between trades" value={s.minMinutes} step="5" onChange={(v) => set({ minMinutes: v })} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Frequency is set here (min minutes between trades). The external cron just needs to run at least
        that often.
      </p>
    </div>
  );
}

function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted">{label}</label>
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-border bg-input px-2 py-1.5 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable per-account AI trading instructions for the hourly scanner.
const AI_EXAMPLE = `e.g. Only trade EUR/USD and GBP/USD.
Trade with the daily trend — enter on a pullback to the 20-period SMA on the 1h.
Put the stop just beyond the recent swing; target at least 2:1 reward-to-risk.
Skip trades when RSI is already overbought/oversold, and avoid the Asian session.`;

function AiInstructionCard({ accountId, initial }: { accountId: string; initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = value !== initial;

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
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">🤖 AI trading instructions</h2>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
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
