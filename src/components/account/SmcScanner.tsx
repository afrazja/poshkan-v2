"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getSmcData,
  saveSmcSettings,
  type SmcSettings,
  type SmcSignal,
  type SmcStatusItem,
} from "@/app/dashboard/[accountId]/smc-actions";

const UNIVERSE = ["BTC-USD", "ETH-USD", "SOL-USD"];

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5);

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export default function SmcScanner({
  accountId,
  initialSettings,
  initialSignals,
}: {
  accountId: string;
  initialSettings: SmcSettings | null;
  initialSignals: SmcSignal[];
}) {
  const [settings, setSettings] = useState<SmcSettings | null>(initialSettings);
  const [signals, setSignals] = useState<SmcSignal[]>(initialSignals);
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);

  // Editable form state (defaults mirror the spec).
  const [enabled, setEnabled] = useState(initialSettings?.enabled ?? false);
  const [mode, setMode] = useState<"alert" | "auto">(initialSettings?.mode ?? "alert");
  const [symbols, setSymbols] = useState<string[]>(initialSettings?.symbols ?? [...UNIVERSE]);
  const [riskPct, setRiskPct] = useState(((initialSettings?.risk_pct ?? 0.02) * 100).toString());
  const [tpRR, setTpRR] = useState((initialSettings?.tp_rr ?? 2).toString());
  const [slMode, setSlMode] = useState<"swing" | "fvg">(initialSettings?.sl_mode ?? "swing");
  const [maxOpen, setMaxOpen] = useState((initialSettings?.max_open ?? 2).toString());
  const [maxPerDay, setMaxPerDay] = useState((initialSettings?.max_per_day ?? 5).toString());
  const [dailyLoss, setDailyLoss] = useState(((initialSettings?.daily_loss_pct ?? 0.04) * 100).toString());

  // Light polling so the live feed updates without a manual refresh.
  useEffect(() => {
    const id = setInterval(async () => {
      const data = await getSmcData(accountId);
      if (data) {
        setSettings(data.settings);
        setSignals(data.signals);
      }
    }, 45_000);
    return () => clearInterval(id);
  }, [accountId]);

  const toggleSymbol = (s: string) =>
    setSymbols((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const save = () =>
    startSave(async () => {
      const res = await saveSmcSettings({
        accountId,
        enabled,
        mode,
        symbols,
        riskPct: Number(riskPct) / 100,
        tpRR: Number(tpRR),
        slMode,
        maxOpen: Number(maxOpen),
        maxPerDay: Number(maxPerDay),
        dailyLossPct: Number(dailyLoss) / 100,
      });
      if (!res.error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        const data = await getSmcData(accountId);
        if (data) {
          setSettings(data.settings);
          setSignals(data.signals);
        }
      } else {
        alert(res.error);
      }
    });

  const status = settings?.last_status ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">📡 SMC Scanner</h3>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Strategy
          </span>
          {enabled ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              {mode === "auto" ? "Auto-trading" : "Alerts on"}
            </span>
          ) : (
            <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted">Off</span>
          )}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-primary hover:underline">
          {open ? "Hide settings" : "Settings"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Deterministic H1-trend + M5 FVG/sweep/confirmation engine. Last run: {ago(settings?.last_run_at ?? null)}.
      </p>

      {/* Settings */}
      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enable scanner
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Mode</span>
            <div className="flex gap-2">
              {(["alert", "auto"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    mode === m ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {m === "alert" ? "Alert only" : "Auto-trade"}
                </button>
              ))}
            </div>
            {mode === "auto" && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Auto-trade opens real (paper) positions on its own within the risk limits below.
              </p>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Watch symbols</span>
            <div className="flex gap-2">
              {UNIVERSE.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSymbol(s)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${
                    symbols.includes(s) ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {s.replace("-USD", "")}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Risk per trade (%)" value={riskPct} onChange={setRiskPct} />
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Take-profit</span>
              <select
                value={tpRR}
                onChange={(e) => setTpRR(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm"
              >
                <option value="2">1:2</option>
                <option value="3">1:3</option>
                <option value="4">1:4</option>
              </select>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Stop-loss</span>
              <select
                value={slMode}
                onChange={(e) => setSlMode(e.target.value as "swing" | "fvg")}
                className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm"
              >
                <option value="swing">Behind swing</option>
                <option value="fvg">Behind FVG</option>
              </select>
            </div>
            <Field label="Max open" value={maxOpen} onChange={setMaxOpen} />
            <Field label="Max trades/day" value={maxPerDay} onChange={setMaxPerDay} />
            <Field label="Daily loss limit (%)" value={dailyLoss} onChange={setDailyLoss} />
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
          </button>
        </div>
      )}

      {/* Live per-symbol read */}
      {status.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {status.map((s: SmcStatusItem) => (
            <div key={s.symbol} className="rounded-lg border border-border bg-background p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.symbol.replace("-USD", "")}</span>
                <span className="flex items-center gap-2">
                  <TrendBadge trend={s.trend} />
                  <StatusBadge status={s.status} />
                </span>
              </div>
              <p className="mt-1 text-muted">{s.reason}</p>
              {(s.status === "waiting" || s.status === "signal") && (
                <div className="mt-1 flex gap-3 text-[11px]">
                  <Check ok={s.checks.retest} label="retest" />
                  <Check ok={s.checks.sweep} label="sweep" />
                  <Check ok={s.checks.confirm} label="confirm" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Signal history */}
      {signals.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-muted">Recent signals</div>
          <div className="space-y-1">
            {signals.slice(0, 8).map((sig) => (
              <div key={sig.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                <span>
                  <span className={sig.direction === "LONG" ? "text-emerald-500" : "text-rose-500"}>
                    {sig.direction}
                  </span>{" "}
                  {sig.symbol.replace("-USD", "")} · {fmtNum(sig.entry)} → TP {fmtNum(sig.take_profit)}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  {sig.executed ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                      traded
                    </span>
                  ) : (
                    <span className="rounded bg-muted/20 px-1.5 py-0.5">alert</span>
                  )}
                  {ago(sig.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-input px-2 py-2 text-sm"
      />
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const cls =
    trend === "bullish"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : trend === "bearish"
        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
        : "bg-muted/20 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{trend}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    signal: "bg-primary/15 text-primary",
    waiting: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    "no-setup": "bg-muted/20 text-muted",
    neutral: "bg-muted/20 text-muted",
    "no-data": "bg-muted/20 text-muted",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[status] ?? "bg-muted/20 text-muted"}`}>{status}</span>;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "text-emerald-500" : "text-muted"}>
      {ok ? "✓" : "○"} {label}
    </span>
  );
}
