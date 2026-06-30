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
  getTrendData,
  saveTrendSettings,
  backtestTrendAction,
  refreshTrendRead,
  type TrendSettings,
  type TrendSignal,
  type TrendStatusItem,
} from "@/app/dashboard/[accountId]/trend-actions";
import type { TrendBtResult } from "@/lib/trend-backtest";

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5);

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export default function TrendScanner({
  accountId,
  accountType,
  initialSettings,
  initialSignals,
  defaultOpen = false,
}: {
  accountId: string;
  accountType: string;
  initialSettings: TrendSettings | null;
  initialSignals: TrendSignal[];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const universe = marketUniverse(accountType);
  const [settings, setSettings] = useState<TrendSettings | null>(initialSettings);
  const [signals, setSignals] = useState<TrendSignal[]>(initialSignals);
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);

  const [bt, setBt] = useState<TrendBtResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btErr, setBtErr] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(initialSettings?.enabled ?? false);
  const [mode, setMode] = useState<"alert" | "auto">(initialSettings?.mode ?? "alert");
  const [symbols, setSymbols] = useState<string[]>(initialSettings?.symbols ?? universe);
  const [riskPct, setRiskPct] = useState(((initialSettings?.risk_pct ?? 0.02) * 100).toString());
  const [donchianN, setDonchianN] = useState((initialSettings?.donchian_n ?? 20).toString());
  const [tpRR, setTpRR] = useState((initialSettings?.tp_rr ?? 3).toString());
  const [adxMin, setAdxMin] = useState((initialSettings?.adx_min ?? 20).toString());
  const [maSlope, setMaSlope] = useState(initialSettings?.ma_slope ?? true);
  const [maxChase, setMaxChase] = useState((initialSettings?.max_chase_atr ?? 1.5).toString());
  const [maxOpen, setMaxOpen] = useState((initialSettings?.max_open ?? 2).toString());
  const [maxPerDay, setMaxPerDay] = useState((initialSettings?.max_per_day ?? 5).toString());
  const [dailyLoss, setDailyLoss] = useState(((initialSettings?.daily_loss_pct ?? 0.04) * 100).toString());
  const [autoCloseHours, setAutoCloseHours] = useState((initialSettings?.auto_close_hours ?? 0).toString());
  const [leverage, setLeverage] = useState<number>(initialSettings?.leverage ?? 1);

  const [scanning, setScanning] = useState(false);
  const [openRead, setOpenRead] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      const data = await getTrendData(accountId);
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
      const res = await backtestTrendAction({
        accountId,
        symbols,
        donchianN: Number(donchianN),
        tpRR: Number(tpRR),
        adxMin: Number(adxMin),
        maSlope,
        maxChaseAtr: Number(maxChase),
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
      const res = await refreshTrendRead(accountId);
      if (res.error) {
        alert(res.error);
        return;
      }
      const data = await getTrendData(accountId);
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
      const res = await saveTrendSettings({
        accountId,
        enabled,
        mode,
        symbols,
        riskPct: Number(riskPct) / 100,
        donchianN: Number(donchianN),
        tpRR: Number(tpRR),
        adxMin: Number(adxMin),
        maSlope,
        maxChaseAtr: Number(maxChase),
        maxOpen: Number(maxOpen),
        maxPerDay: Number(maxPerDay),
        dailyLossPct: Number(dailyLoss) / 100,
        autoCloseHours: Number(autoCloseHours),
        leverage: Number(leverage),
      });
      if (!res.error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        const data = await getTrendData(accountId);
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
    <ScannerCard icon="🚀" name="Trend Breakout" defaultOpen={defaultOpen}>
      <p className="text-xs text-muted">
        Donchian/Turtle breakout on 1-hour bars — enters on a fresh break of the N-bar high/low in the
        direction of the trend MA, with an ATR stop. Rides trends (the complement to SMC/OTE). Last run:{" "}
        {ago(settings?.last_run_at ?? null)}.
      </p>
      <ScannerInfo
        whatItIs="A classic Donchian/'Turtle' breakout — it buys new highs (or sells new lows) to ride sustained trends. The opposite edge to the structure scanners: it chases momentum instead of fading it."
        bestWhen="Strong, trending markets that keep making new highs or lows."
        how={[
          "On 1-hour bars, tracks the highest high / lowest low of the last N bars (the 'breakout length').",
          "Enters on a fresh break of that level (only the bar that crosses out, so it doesn't re-fire).",
          "Confirms a REAL trend first: ADX above your threshold and the trend MA sloping the right way — filters out choppy fake-outs.",
          "Leaves room to run: skips breakouts that already ran too far past the level (no chasing the top).",
          "Stop is a multiple of ATR; target is a fixed reward:risk (e.g. 3R).",
        ]}
        reading="'signal' = a confirmed, fresh breakout with room left. 'no-setup' tells you why it's waiting (inside range, weak ADX, flat MA, or already extended)."
        judge="Breakouts have LOWER win rates but bigger winners — judge by net R / profit factor, NOT win rate."
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
          <Field label="Breakout length (bars)" value={donchianN} onChange={setDonchianN} />
          <Field label="Target (R)" value={tpRR} onChange={setTpRR} />
          <Field label="Min ADX (0 = off)" value={adxMin} onChange={setAdxMin} />
          <Field label="Max chase (×ATR, 0 = off)" value={maxChase} onChange={setMaxChase} />
          <Field label="Max open" value={maxOpen} onChange={setMaxOpen} />
          <Field label="Max trades / day" value={maxPerDay} onChange={setMaxPerDay} />
          <Field label="Daily loss limit (%)" value={dailyLoss} onChange={setDailyLoss} />
          <Field label="Auto-close after (hours, 0 = off)" value={autoCloseHours} onChange={setAutoCloseHours} />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Leverage</label>
            <select
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {[1, 2, 5, 10].map((x) => (
                <option key={x} value={x}>{x}× {x === 1 ? "(no leverage)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={maSlope}
            onChange={(e) => setMaSlope(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Require the trend MA to be sloping
            <span className="block text-[11px] text-muted">
              Only take a breakout when the trend moving-average is actually rising (longs) or falling
              (shorts) — confirms a real new trend instead of a poke above a flat average.
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
          multiple (a win is +{tpRR}R, a loss −1R).
        </p>
        {btErr && <p className="mt-2 text-xs text-negative">{btErr}</p>}
        {bt &&
          (bt.n === 0 ? (
            <p className="mt-2 text-xs text-muted">No breakouts fired in the backtest window.</p>
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
          {status.map((s: TrendStatusItem) => (
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
