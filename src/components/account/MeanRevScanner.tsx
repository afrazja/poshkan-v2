"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ScannerCard from "./ScannerCard";
import ScannerInfo from "./ScannerInfo";
import SymbolSearch from "@/components/SymbolSearch";
import { marketUniverse, symbolLabel, assetTypeError } from "@/lib/assets";
import { FX_PAIRS } from "@/lib/forex";
import AreaChart from "./AreaChart";
import {
  getMeanRevData,
  saveMeanRevSettings,
  backtestMeanRevAction,
  refreshMeanRevRead,
  type MeanRevSettings,
  type MeanRevSignal,
  type MeanRevStatusItem,
} from "@/app/dashboard/[accountId]/meanrev-actions";
import type { MeanRevBtResult } from "@/lib/meanrev-backtest";

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5);

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export default function MeanRevScanner({
  accountId,
  accountType,
  initialSettings,
  initialSignals,
  defaultOpen = false,
}: {
  accountId: string;
  accountType: string;
  initialSettings: MeanRevSettings | null;
  initialSignals: MeanRevSignal[];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const universe = marketUniverse(accountType);
  const [settings, setSettings] = useState<MeanRevSettings | null>(initialSettings);
  const [signals, setSignals] = useState<MeanRevSignal[]>(initialSignals);
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);

  const [bt, setBt] = useState<MeanRevBtResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btErr, setBtErr] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(initialSettings?.enabled ?? false);
  const [mode, setMode] = useState<"alert" | "auto">(initialSettings?.mode ?? "alert");
  const [symbols, setSymbols] = useState<string[]>(initialSettings?.symbols ?? universe);
  const [riskPct, setRiskPct] = useState(((initialSettings?.risk_pct ?? 0.02) * 100).toString());
  const [bbPeriod, setBbPeriod] = useState((initialSettings?.bb_period ?? 20).toString());
  const [bbK, setBbK] = useState((initialSettings?.bb_k ?? 2).toString());
  const [trendMa, setTrendMa] = useState((initialSettings?.trend_ma ?? 100).toString());
  const [rsiConfirm, setRsiConfirm] = useState(initialSettings?.rsi_confirm ?? false);
  const [maxOpen, setMaxOpen] = useState((initialSettings?.max_open ?? 2).toString());
  const [maxPerDay, setMaxPerDay] = useState((initialSettings?.max_per_day ?? 5).toString());
  const [dailyLoss, setDailyLoss] = useState(((initialSettings?.daily_loss_pct ?? 0.04) * 100).toString());

  const [scanning, setScanning] = useState(false);
  const [openRead, setOpenRead] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      const data = await getMeanRevData(accountId);
      if (data) {
        setSettings(data.settings);
        setSignals(data.signals);
      }
    }, 45_000);
    return () => clearInterval(id);
  }, [accountId]);

  const toggleSymbol = (s: string) =>
    setSymbols((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const addSymbol = (s: string) =>
    setSymbols((prev) => (prev.includes(s) || assetTypeError(accountType, s) ? prev : [...prev, s]));
  const removeSymbol = (s: string) => setSymbols((prev) => prev.filter((x) => x !== s));

  async function runBacktest() {
    setBtLoading(true);
    setBtErr(null);
    setBt(null);
    try {
      const res = await backtestMeanRevAction({
        accountId,
        symbols,
        bbPeriod: Number(bbPeriod),
        bbK: Number(bbK),
        trendMa: Number(trendMa),
        rsiConfirm,
      });
      if (res.error) setBtErr(res.error);
      else setBt(res.result ?? null);
    } catch (e) {
      setBtErr(`Backtest failed: ${(e as Error).message}`);
    } finally {
      setBtLoading(false);
    }
  }

  async function runScanNow() {
    setScanning(true);
    try {
      const res = await refreshMeanRevRead(accountId);
      if (res.error) {
        alert(res.error);
        return;
      }
      const data = await getMeanRevData(accountId);
      if (data) {
        setSettings(data.settings);
        setSignals(data.signals);
      }
    } catch (e) {
      alert(`Scan failed: ${(e as Error).message}`);
    } finally {
      setScanning(false);
    }
  }

  const save = () =>
    startSave(async () => {
      const res = await saveMeanRevSettings({
        accountId,
        enabled,
        mode,
        symbols,
        riskPct: Number(riskPct) / 100,
        bbPeriod: Number(bbPeriod),
        bbK: Number(bbK),
        trendMa: Number(trendMa),
        rsiConfirm,
        maxOpen: Number(maxOpen),
        maxPerDay: Number(maxPerDay),
        dailyLossPct: Number(dailyLoss) / 100,
      });
      if (!res.error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        const data = await getMeanRevData(accountId);
        if (data) {
          setSettings(data.settings);
          setSignals(data.signals);
        }
        router.refresh();
      } else {
        alert(res.error);
      }
    });

  const status = settings?.last_status ?? [];
  const lastRunMs = settings?.last_run_at ? Date.now() - new Date(settings.last_run_at).getTime() : Infinity;
  const liveStale = lastRunMs > 20 * 60 * 1000;

  return (
    <ScannerCard icon="↩️" name="Mean Reversion" defaultOpen={defaultOpen}>
      <p className="text-xs text-muted">
        Bollinger-Band bounce on 1-hour bars — fades a fresh close beyond the band back toward the mean
        (the middle band is the target), with an ATR stop, optionally only with the longer trend. Profits
        in ranges (the complement to the trend/structure scanners). Last run: {ago(settings?.last_run_at ?? null)}.
      </p>
      <ScannerInfo
        whatItIs="A Bollinger-Band 'bounce' — it fades over-stretched prices back toward the average. When something spikes too far too fast, it bets on a snap-back to the mean."
        bestWhen="Range-bound, choppy markets — the exact opposite of when Trend Breakout shines."
        how={[
          "On 1-hour bars, draws Bollinger bands (a moving average ± volatility).",
          "When price closes beyond a band (over-stretched)…",
          "…it enters the other way, targeting the middle band (the mean).",
          "Stop is a multiple of ATR. By default it only fades WITH the bigger trend — set Trend MA to 0 to fade both ways.",
        ]}
        reading="'signal' = a fresh stretch beyond the band. Otherwise price is sitting inside the bands (no edge)."
        judge="Mean-reversion wins OFTEN but small — judge by win rate AND profit factor together."
      />
      <button
        onClick={runScanNow}
        disabled={scanning}
        className="mt-2 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-50"
      >
        {scanning ? "Scanning…" : "↻ Run scan now"}
      </button>

      {/* Settings */}
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
                className={`flex-1 rounded-lg border px-3 py-2 text-left ${
                  mode === m ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                <span className="block text-sm font-medium">{m === "alert" ? "Alert only" : "Auto-trade"}</span>
                <span className="block text-[11px] text-muted">
                  {m === "alert" ? "Notifies you — never trades" : "Opens trades on its own"}
                </span>
              </button>
            ))}
          </div>
          {mode === "alert" ? (
            <p className="mt-1 text-xs text-muted">
              ℹ️ <strong>Alert only never opens a position</strong> — it just logs the signal and pushes
              you a notification. Pick <strong>Auto-trade</strong> if you want it to place trades for you.
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Auto-trade opens real (paper) positions on its own within the risk limits below.
            </p>
          )}
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-muted">Watch symbols ({accountType})</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {symbols.length === 0 ? (
              <span className="text-xs text-muted">None selected — add below.</span>
            ) : (
              symbols.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary"
                >
                  {symbolLabel(s)}
                  <button
                    onClick={() => removeSymbol(s)}
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
                  onClick={() => toggleSymbol(p.symbol)}
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
                placeholder={accountType === "crypto" ? "Add a crypto (e.g. XRP, ADA)…" : "Add a stock (e.g. TSLA)…"}
                onSelect={(r) => addSymbol(r.symbol)}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {universe.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSymbol(s)}
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
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Risk per trade (%)" value={riskPct} onChange={setRiskPct} />
          <Field label="Band length (bars)" value={bbPeriod} onChange={setBbPeriod} />
          <Field label="Band width (×σ)" value={bbK} onChange={setBbK} />
          <Field label="Trend MA (0 = off)" value={trendMa} onChange={setTrendMa} />
          <Field label="Max open" value={maxOpen} onChange={setMaxOpen} />
          <Field label="Max trades / day" value={maxPerDay} onChange={setMaxPerDay} />
          <Field label="Daily loss limit (%)" value={dailyLoss} onChange={setDailyLoss} />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={rsiConfirm}
            onChange={(e) => setRsiConfirm(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Require RSI confirmation
            <span className="block text-[11px] text-muted">
              Only fade the band when RSI(2) is also extreme (≤10 oversold for longs, ≥90 overbought for
              shorts) — the Connors RSI-2 filter. Fewer, higher-quality signals.
            </span>
          </span>
        </label>

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
        </button>
      </div>

      {/* Backtest */}
      <div className="mt-3 rounded-lg border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Backtest</span>
          <button
            onClick={runBacktest}
            disabled={btLoading || symbols.length === 0}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {btLoading ? "Running…" : "Run backtest"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Replays this exact strategy on ~1 year of 1-hour data for your watched symbols. R = risk
          multiple (a win banks the setup&apos;s reward:risk, which varies; a loss is −1R).
        </p>
        {btErr && <p className="mt-2 text-xs text-negative">{btErr}</p>}
        {bt &&
          (bt.n === 0 ? (
            <p className="mt-2 text-xs text-muted">No setups fired in the backtest window.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <BtStat
                  label="Net R"
                  value={`${bt.totalR >= 0 ? "+" : ""}${bt.totalR}R`}
                  cls={bt.totalR >= 0 ? "text-emerald-500" : "text-rose-500"}
                />
                <BtStat label="Win rate" value={`${Math.round(bt.winRate * 100)}% (${bt.n})`} />
                <BtStat label="Profit factor" value={bt.profitFactor === -1 ? "∞" : bt.profitFactor.toFixed(2)} />
                <BtStat label="Max drawdown" value={`−${bt.maxDrawdownR}R`} />
              </div>
              {bt.equity.length >= 2 && (
                <AreaChart
                  points={bt.equity.map((e) => ({ label: e.t, value: e.value }))}
                  height={160}
                  formatValue={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`}
                  baseline={0}
                />
              )}
              <div className="space-y-1">
                {bt.perSymbol
                  .filter((p) => p.n > 0)
                  .map((p) => (
                    <div
                      key={p.symbol}
                      className="flex items-center justify-between rounded-lg border border-border px-2 py-1 text-xs"
                    >
                      <span className="font-medium">{symbolLabel(p.symbol)}</span>
                      <span className="text-muted">
                        {p.n} trades · {Math.round(p.winRate * 100)}% ·{" "}
                        <span className={p.totalR >= 0 ? "text-emerald-500" : "text-rose-500"}>
                          {p.totalR >= 0 ? "+" : ""}
                          {Math.round(p.totalR * 10) / 10}R
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
      </div>

      {/* Live per-symbol read */}
      {status.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Live read</span>
            <span className={`text-[11px] ${liveStale ? "text-amber-600 dark:text-amber-400" : "text-muted"}`}>
              {settings?.last_run_at ? `updated ${ago(settings.last_run_at)}` : "not run yet"}
            </span>
          </div>
          {liveStale && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              ⚠️ Hasn&apos;t updated recently — the scanner may not be running. A live read should refresh
              every few minutes.
            </p>
          )}
          {status.map((s: MeanRevStatusItem) => (
            <div
              key={s.symbol}
              onClick={() => setOpenRead(openRead === s.symbol ? null : s.symbol)}
              className="cursor-pointer rounded-lg border border-border bg-background p-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{symbolLabel(s.symbol)}</span>
                <span className="flex items-center gap-2">
                  <TrendBadge trend={s.trend} />
                  <StatusBadge status={s.status} />
                  <span className={`text-muted transition-transform ${openRead === s.symbol ? "rotate-90" : ""}`}>›</span>
                </span>
              </div>
              <p className="mt-1 text-muted">{s.reason}</p>
              {openRead === s.symbol && (
                <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
                  {Object.entries(s.checks).map(([k, v]) => (
                    <Check key={k} ok={v} label={k} />
                  ))}
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
                  {symbolLabel(sig.symbol)} · {fmtNum(sig.entry)} → TP {fmtNum(sig.take_profit)}
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
    </ScannerCard>
  );
}

function BtStat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${cls ?? ""}`}>{value}</div>
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
    "no-setup": "bg-muted/20 text-muted",
    neutral: "bg-muted/20 text-muted",
    "no-data": "bg-muted/20 text-muted",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[status] ?? "bg-muted/20 text-muted"}`}>
      {status}
    </span>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? "text-emerald-500" : "text-muted"}>
      {ok ? "✓" : "○"} {label}
    </span>
  );
}
