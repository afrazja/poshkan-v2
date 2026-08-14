"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FlaskConical,
  Play,
  Plus,
  Radio,
  Save,
  Trash2,
} from "lucide-react";
import AreaChart from "@/components/account/AreaChart";
import SymbolSearch from "@/components/SymbolSearch";
import { UnsavedBadge, useUnsavedGuard } from "@/components/account/UnsavedChanges";
import { FX_PAIRS } from "@/lib/forex";
import { assetTypeError, marketUniverse, symbolLabel } from "@/lib/assets";
import {
  customStrategyInputSchema,
  describeStrategy,
  makeDefaultRule,
  RULE_LABELS,
  type CustomBacktestResult,
  type CustomRule,
  type CustomRuleKind,
  type CustomStrategyInput,
  type CustomStrategyRow,
} from "@/lib/custom-strategy-types";
import {
  runCustomBacktestAction,
  saveCustomStrategy,
  setCustomStrategyLive,
} from "@/app/dashboard/scanners/custom-actions";

type BuilderAccount = { id: string; name: string; type: string };

const STEPS = ["Setup", "Entry rules", "Exit & risk", "Test"];
const fieldClass =
  "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none transition focus:border-primary";

function initialRules(): CustomRule[] {
  return [
    makeDefaultRule("close_previous", "rule-1"),
    makeDefaultRule("candle_direction", "rule-2"),
  ];
}

export default function StrategyBuilder({
  accounts,
  initial,
}: {
  accounts: BuilderAccount[];
  initial?: CustomStrategyRow | null;
}) {
  const router = useRouter();
  const firstAccount = accounts.find((account) => account.id === initial?.accountId) ?? accounts[0];
  const [strategyId, setStrategyId] = useState(initial?.id ?? null);
  const [step, setStep] = useState(initial?.lastBacktest ? 3 : 0);
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "My candle experiment");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [timeframe, setTimeframe] = useState<CustomStrategyInput["timeframe"]>(initial?.timeframe ?? "1h");
  const [symbols, setSymbols] = useState<string[]>(initial?.symbols ?? marketUniverse(firstAccount?.type).slice(0, 3));
  const [direction, setDirection] = useState<CustomStrategyInput["direction"]>(initial?.direction ?? "LONG");
  const [matchMode, setMatchMode] = useState<CustomStrategyInput["matchMode"]>(initial?.matchMode ?? "all");
  const [rules, setRules] = useState<CustomRule[]>(initial?.rules ?? initialRules());
  const [stopAtr, setStopAtr] = useState(initial?.stopAtr ?? 1.5);
  const [takeProfitRr, setTakeProfitRr] = useState(initial?.takeProfitRr ?? 2);
  const [maxHoldBars, setMaxHoldBars] = useState(initial?.maxHoldBars ?? 24);
  const [result, setResult] = useState<CustomBacktestResult | null>(initial?.lastBacktest ?? null);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [busy, setBusy] = useState<"save" | "test" | "live" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const account = accounts.find((item) => item.id === accountId) ?? firstAccount;
  const input = useMemo<CustomStrategyInput>(
    () => ({
      accountId,
      name,
      description,
      timeframe,
      symbols,
      direction,
      matchMode,
      rules,
      stopAtr,
      takeProfitRr,
      maxHoldBars,
    }),
    [accountId, name, description, timeframe, symbols, direction, matchMode, rules, stopAtr, takeProfitRr, maxHoldBars]
  );
  const signature = JSON.stringify(input);
  const [testedSignature, setTestedSignature] = useState(initial?.lastBacktestedAt ? signature : null);
  const [savedSignature, setSavedSignature] = useState(signature);
  const testIsCurrent = testedSignature === signature && result != null;
  const dirty = savedSignature !== signature;
  useUnsavedGuard(dirty);

  function pickAccount(id: string) {
    const next = accounts.find((item) => item.id === id);
    setAccountId(id);
    setSymbols(marketUniverse(next?.type).slice(0, 3));
    clearNotices();
  }

  function clearNotices() {
    setError(null);
    setMessage(null);
  }

  function addSymbol(symbol: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized || symbols.includes(normalized) || assetTypeError(account?.type, normalized)) return;
    setSymbols((current) => [...current, normalized].slice(0, 5));
    clearNotices();
  }

  function toggleSymbol(symbol: string) {
    setSymbols((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol].slice(0, 5)
    );
    clearNotices();
  }

  function addRule() {
    setRules((current) => [...current, makeDefaultRule("rsi", `rule-${Date.now()}`)].slice(0, 8));
    clearNotices();
  }

  function changeRuleKind(id: string, kind: CustomRuleKind) {
    setRules((current) => current.map((rule) => (rule.id === id ? makeDefaultRule(kind, id) : rule)));
    clearNotices();
  }

  function updateRule(id: string, patch: Partial<CustomRule>) {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
    clearNotices();
  }

  function validate(): CustomStrategyInput | null {
    const parsed = customStrategyInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the strategy settings.");
      return null;
    }
    return parsed.data;
  }

  async function save(runTest = false) {
    const valid = validate();
    if (!valid) return;
    setBusy(runTest ? "test" : "save");
    clearNotices();
    try {
      const saved = await saveCustomStrategy(valid, strategyId ?? undefined);
      if (!saved.id) {
        setError(saved.error ?? "Could not save the strategy.");
        return;
      }
      setStrategyId(saved.id);
      setSavedSignature(JSON.stringify(valid));
      setStatus("draft");
      setResult(null);
      setTestedSignature(null);

      if (!runTest) {
        setMessage("Draft saved. Any previous test was cleared because the rules changed.");
        if (!strategyId) router.replace(`/dashboard/scanners/${saved.id}`);
        return;
      }

      const tested = await runCustomBacktestAction(saved.id);
      if (!tested.result) {
        setError(tested.error ?? "Backtest failed.");
        return;
      }
      setResult(tested.result);
      setStatus("backtested");
      setTestedSignature(JSON.stringify(valid));
      setMessage("Backtest complete. These results are tied to this exact rule version.");
      if (!strategyId) router.replace(`/dashboard/scanners/${saved.id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggleLive() {
    if (!strategyId || !testIsCurrent) {
      setError("Run a new backtest for the current rules before starting live alerts.");
      return;
    }
    setBusy("live");
    clearNotices();
    try {
      const shouldStart = status !== "live";
      const response = await setCustomStrategyLive(strategyId, shouldStart);
      if (response.error) {
        setError(response.error);
        return;
      }
      setStatus(shouldStart ? "live" : "paused");
      setMessage(shouldStart ? "Live paper alerts started." : "Live paper alerts paused.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <FlaskConical className="mx-auto text-muted" size={32} aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">Create an account first</h1>
        <p className="mt-2 text-sm text-muted">A strategy needs a paper account to define its market and symbols.</p>
        <Link href="/dashboard" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Go to accounts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <Link href="/dashboard/scanners" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Strategy Lab
          </Link>
          <h1 className="mt-2 text-xl font-semibold">{strategyId ? "Edit experiment" : "New strategy experiment"}</h1>
          <p className="mt-1 text-sm text-muted">Build explicit rules, replay them on completed candles, then observe them with paper alerts.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <UnsavedBadge />}
          <StatusBadge status={testIsCurrent ? status : "draft"} />
        </div>
      </header>

      <nav className="grid grid-cols-4 border-b border-border" aria-label="Builder steps">
        {STEPS.map((label, index) => (
          <button
            key={label}
            onClick={() => setStep(index)}
            className={`border-b-2 px-2 py-3 text-xs font-medium sm:text-sm ${
              step === index ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <span className="mr-1 hidden sm:inline">{index + 1}.</span>{label}
          </button>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          {step === 0 && (
            <SetupStep
              accounts={accounts}
              accountId={accountId}
              onAccountChange={pickAccount}
              accountType={account.type}
              name={name}
              onNameChange={(value) => { setName(value); clearNotices(); }}
              description={description}
              onDescriptionChange={(value) => { setDescription(value); clearNotices(); }}
              timeframe={timeframe}
              onTimeframeChange={(value) => { setTimeframe(value); clearNotices(); }}
              symbols={symbols}
              onAddSymbol={addSymbol}
              onToggleSymbol={toggleSymbol}
              onRemoveSymbol={(symbol) => setSymbols((current) => current.filter((item) => item !== symbol))}
            />
          )}

          {step === 1 && (
            <RulesStep
              direction={direction}
              onDirectionChange={setDirection}
              matchMode={matchMode}
              onMatchModeChange={setMatchMode}
              rules={rules}
              onAddRule={addRule}
              onRemoveRule={(id) => setRules((current) => current.filter((rule) => rule.id !== id))}
              onChangeKind={changeRuleKind}
              onUpdateRule={updateRule}
            />
          )}

          {step === 2 && (
            <RiskStep
              stopAtr={stopAtr}
              onStopAtrChange={setStopAtr}
              takeProfitRr={takeProfitRr}
              onTakeProfitRrChange={setTakeProfitRr}
              maxHoldBars={maxHoldBars}
              onMaxHoldBarsChange={setMaxHoldBars}
              timeframe={timeframe}
            />
          )}

          {step === 3 && (
            <TestStep
              result={testIsCurrent ? result : null}
              busy={busy}
              status={status}
              strategyId={strategyId}
              onSave={() => save(false)}
              onTest={() => save(true)}
              onToggleLive={toggleLive}
            />
          )}

          {error && <p className="mt-4 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">{error}</p>}
          {message && <p className="mt-4 rounded-lg border border-positive/30 bg-positive/5 px-3 py-2 text-sm text-positive">{message}</p>}

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <button
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-card disabled:opacity-40"
            >
              <ArrowLeft size={16} aria-hidden /> Back
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((current) => Math.min(3, current + 1))}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Continue <ArrowRight size={16} aria-hidden />
              </button>
            ) : (
              <button
                onClick={() => save(false)}
                disabled={busy != null}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-card disabled:opacity-50"
              >
                <Save size={16} aria-hidden /> Save draft
              </button>
            )}
          </div>
        </section>

        <aside className="border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
          <div className="lg:sticky lg:top-24">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical size={16} className="text-primary" aria-hidden /> Rule summary
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{describeStrategy(input)}</p>
            <dl className="mt-5 space-y-3 border-t border-border pt-4 text-xs">
              <SummaryRow label="Market" value={`${account.type} / ${timeframe}`} />
              <SummaryRow label="Symbols" value={symbols.length ? symbols.map(symbolLabel).join(", ") : "None"} />
              <SummaryRow label="Logic" value={`Match ${matchMode} of ${rules.length} rule${rules.length === 1 ? "" : "s"}`} />
              <SummaryRow label="Exit" value={`${takeProfitRr}R target / ${stopAtr}x ATR stop`} />
            </dl>
            <p className="mt-5 border-l-2 border-primary pl-3 text-xs leading-5 text-muted">
              This is a market experiment, not a promise of profit. A strong backtest still needs live forward evidence.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SetupStep({
  accounts,
  accountId,
  onAccountChange,
  accountType,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  timeframe,
  onTimeframeChange,
  symbols,
  onAddSymbol,
  onToggleSymbol,
  onRemoveSymbol,
}: {
  accounts: BuilderAccount[];
  accountId: string;
  onAccountChange: (value: string) => void;
  accountType: string;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  timeframe: CustomStrategyInput["timeframe"];
  onTimeframeChange: (value: CustomStrategyInput["timeframe"]) => void;
  symbols: string[];
  onAddSymbol: (symbol: string) => void;
  onToggleSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
}) {
  const universe = marketUniverse(accountType);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Set up the experiment</h2>
        <p className="mt-1 text-sm text-muted">Choose where the rules run and give this version a recognizable name.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Name</span>
          <input value={name} maxLength={80} onChange={(event) => onNameChange(event.target.value)} className={fieldClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Paper account</span>
          <select value={accountId} onChange={(event) => onAccountChange(event.target.value)} className={fieldClass}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.type})</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">Research note <span className="font-normal text-muted">(optional)</span></span>
        <textarea value={description} maxLength={280} rows={3} onChange={(event) => onDescriptionChange(event.target.value)} className={fieldClass} placeholder="What market behavior are you trying to test?" />
      </label>
      <div>
        <span className="mb-1.5 block text-sm font-medium">Timeframe</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {(["15min", "1h", "1day"] as const).map((value) => (
            <button key={value} onClick={() => onTimeframeChange(value)} className={`px-4 py-2 text-sm ${timeframe === value ? "bg-primary text-primary-foreground" : "bg-card text-muted hover:text-foreground"}`}>
              {value === "15min" ? "15 min" : value === "1h" ? "1 hour" : "1 day"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Symbols</span>
          <span className="text-xs text-muted">{symbols.length}/5</span>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {symbols.map((symbol) => (
            <span key={symbol} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
              {symbolLabel(symbol)}
              <button onClick={() => onRemoveSymbol(symbol)} aria-label={`Remove ${symbol}`} className="rounded p-0.5 hover:bg-primary/10"><Trash2 size={12} aria-hidden /></button>
            </span>
          ))}
        </div>
        {accountType === "forex" ? (
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto border border-border bg-card p-2">
            {FX_PAIRS.map((pair) => (
              <button key={pair.symbol} onClick={() => onToggleSymbol(pair.symbol)} className={`rounded-lg border px-2 py-1 text-xs ${symbols.includes(pair.symbol) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>
                {symbolLabel(pair.symbol)}
              </button>
            ))}
          </div>
        ) : (
          <>
            <SymbolSearch assetType={accountType} placeholder={accountType === "crypto" ? "Add a cryptocurrency" : "Add a stock or ETF"} onSelect={(result) => onAddSymbol(result.symbol)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {universe.map((symbol) => (
                <button key={symbol} onClick={() => onToggleSymbol(symbol)} className={`rounded-lg border px-2 py-1 text-xs ${symbols.includes(symbol) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>
                  {symbols.includes(symbol) ? <Check size={12} className="mr-1 inline" aria-hidden /> : <Plus size={12} className="mr-1 inline" aria-hidden />}{symbolLabel(symbol)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RulesStep({
  direction,
  onDirectionChange,
  matchMode,
  onMatchModeChange,
  rules,
  onAddRule,
  onRemoveRule,
  onChangeKind,
  onUpdateRule,
}: {
  direction: CustomStrategyInput["direction"];
  onDirectionChange: (value: CustomStrategyInput["direction"]) => void;
  matchMode: CustomStrategyInput["matchMode"];
  onMatchModeChange: (value: CustomStrategyInput["matchMode"]) => void;
  rules: CustomRule[];
  onAddRule: () => void;
  onRemoveRule: (id: string) => void;
  onChangeKind: (id: string, kind: CustomRuleKind) => void;
  onUpdateRule: (id: string, patch: Partial<CustomRule>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Define the entry</h2>
        <p className="mt-1 text-sm text-muted">Rules are evaluated only after a candle closes, so signals do not disappear mid-candle.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented label="Direction" value={direction} options={[{ value: "LONG", label: "Long" }, { value: "SHORT", label: "Short" }]} onChange={(value) => onDirectionChange(value as CustomStrategyInput["direction"])} />
        <Segmented label="Rule logic" value={matchMode} options={[{ value: "all", label: "Match all" }, { value: "any", label: "Match any" }]} onChange={(value) => onMatchModeChange(value as CustomStrategyInput["matchMode"])} />
      </div>
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div key={rule.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted">Rule {index + 1}</span>
              <button onClick={() => onRemoveRule(rule.id)} disabled={rules.length === 1} aria-label={`Remove rule ${index + 1}`} title="Remove rule" className="rounded-md p-1.5 text-muted hover:bg-background hover:text-negative disabled:opacity-30">
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select value={rule.kind} onChange={(event) => onChangeKind(rule.id, event.target.value as CustomRuleKind)} className={fieldClass} aria-label={`Rule ${index + 1} type`}>
                {(Object.entries(RULE_LABELS) as [CustomRuleKind, string][]).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
              </select>
              <RuleFields rule={rule} onUpdate={(patch) => onUpdateRule(rule.id, patch)} />
            </div>
          </div>
        ))}
      </div>
      <button onClick={onAddRule} disabled={rules.length >= 8} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-card disabled:opacity-40">
        <Plus size={16} aria-hidden /> Add rule
      </button>
    </div>
  );
}

function RuleFields({ rule, onUpdate }: { rule: CustomRule; onUpdate: (patch: Partial<CustomRule>) => void }) {
  const number = (value: number | undefined, patch: "period" | "value", min: number, max: number, step = 1) => (
    <input type="number" value={value ?? ""} min={min} max={max} step={step} onChange={(event) => onUpdate({ [patch]: Number(event.target.value) })} className={fieldClass} aria-label={patch} />
  );
  if (rule.kind === "rsi") return <div className="grid grid-cols-[1fr_76px_76px] gap-2"><select value={rule.operator} onChange={(event) => onUpdate({ operator: event.target.value })} className={fieldClass}><option value="below">Below</option><option value="above">Above</option></select>{number(rule.value, "value", 1, 99)}{number(rule.period, "period", 2, 200)}</div>;
  if (rule.kind === "price_sma") return <div className="grid grid-cols-[1fr_90px] gap-2"><select value={rule.operator} onChange={(event) => onUpdate({ operator: event.target.value })} className={fieldClass}><option value="above">Closes above</option><option value="below">Closes below</option></select>{number(rule.period, "period", 2, 200)}</div>;
  if (rule.kind === "candle_direction") return <select value={rule.operator} onChange={(event) => onUpdate({ operator: event.target.value })} className={fieldClass}><option value="bullish">Bullish close</option><option value="bearish">Bearish close</option></select>;
  if (rule.kind === "body_percent") return <div className="grid grid-cols-[1fr_100px] gap-2"><span className="flex items-center text-sm text-muted">At least % of range</span>{number(rule.value, "value", 1, 100)}</div>;
  if (rule.kind === "close_previous") return <select value={rule.operator} onChange={(event) => onUpdate({ operator: event.target.value })} className={fieldClass}><option value="above_high">Close above previous high</option><option value="below_low">Close below previous low</option></select>;
  if (rule.kind === "range_atr") return <div className="grid grid-cols-[1fr_72px_72px] gap-2"><select value={rule.operator} onChange={(event) => onUpdate({ operator: event.target.value })} className={fieldClass}><option value="at_least">At least</option><option value="at_most">At most</option></select>{number(rule.value, "value", 0.1, 10, 0.1)}{number(rule.period, "period", 2, 200)}</div>;
  return <div className="grid grid-cols-[1fr_90px] gap-2"><select value={rule.operator} onChange={(event) => onUpdate({ operator: event.target.value })} className={fieldClass}><option value="bullish">Bullish</option><option value="bearish">Bearish</option></select>{number(rule.value, "value", 2, 5)}</div>;
}

function RiskStep({ stopAtr, onStopAtrChange, takeProfitRr, onTakeProfitRrChange, maxHoldBars, onMaxHoldBarsChange, timeframe }: { stopAtr: number; onStopAtrChange: (value: number) => void; takeProfitRr: number; onTakeProfitRrChange: (value: number) => void; maxHoldBars: number; onMaxHoldBarsChange: (value: number) => void; timeframe: string }) {
  return (
    <div className="space-y-5">
      <div><h2 className="text-base font-semibold">Define the exit</h2><p className="mt-1 text-sm text-muted">Every candidate receives the same explicit stop, target, and time limit.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField label="Stop distance" suffix="x ATR" value={stopAtr} min={0.25} max={10} step={0.25} onChange={onStopAtrChange} />
        <NumberField label="Profit target" suffix="R" value={takeProfitRr} min={0.5} max={10} step={0.25} onChange={onTakeProfitRrChange} />
        <NumberField label="Maximum hold" suffix="bars" value={maxHoldBars} min={1} max={500} step={1} onChange={onMaxHoldBarsChange} />
      </div>
      <div className="border-l-2 border-border pl-4 text-sm text-muted">
        On the {timeframe === "15min" ? "15-minute" : timeframe === "1h" ? "hourly" : "daily"} timeframe, a {maxHoldBars}-bar limit is approximately {holdDuration(timeframe, maxHoldBars)}. Backtests assume the stop is hit first when both stop and target fall inside the same candle.
      </div>
    </div>
  );
}

function TestStep({ result, busy, status, strategyId, onSave, onTest, onToggleLive }: { result: CustomBacktestResult | null; busy: string | null; status: string; strategyId: string | null; onSave: () => void; onTest: () => void; onToggleLive: () => void }) {
  return (
    <div className="space-y-5">
      <div><h2 className="text-base font-semibold">Test the exact rule version</h2><p className="mt-1 text-sm text-muted">The replay uses completed historical candles and subtracts estimated spread and slippage.</p></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onSave} disabled={busy != null} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-card disabled:opacity-50"><Save size={16} aria-hidden />{strategyId ? "Save draft" : "Create draft"}</button>
        <button onClick={onTest} disabled={busy != null} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"><Play size={16} aria-hidden />{busy === "test" ? "Running replay..." : "Save and run backtest"}</button>
        {result && <button onClick={onToggleLive} disabled={busy != null} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${status === "live" ? "border border-border" : "bg-positive text-white"}`}><Radio size={16} aria-hidden />{busy === "live" ? "Updating..." : status === "live" ? "Pause live alerts" : "Start live paper alerts"}</button>}
      </div>
      {!result ? (
        <div className="border-y border-border py-8 text-center"><FlaskConical className="mx-auto text-muted" size={28} aria-hidden /><p className="mt-3 text-sm font-medium">No current evidence yet</p><p className="mt-1 text-xs text-muted">Run the replay after every rule change. Old results are intentionally invalidated.</p></div>
      ) : result.n === 0 ? (
        <div className="border-y border-border py-8 text-center"><p className="text-sm font-medium">No trades matched</p><p className="mt-1 text-xs text-muted">The rules may be too strict, or the pattern did not occur in this window.</p></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Net R" value={`${result.totalR >= 0 ? "+" : ""}${result.totalR}R`} tone={result.totalR >= 0 ? "positive" : "negative"} />
            <Metric label="Win rate" value={`${Math.round(result.winRate * 100)}% (${result.n})`} />
            <Metric label="Profit factor" value={result.profitFactor === -1 ? "infinite" : result.profitFactor.toFixed(2)} />
            <Metric label="Max drawdown" value={`-${result.maxDrawdownR}R`} />
          </div>
          {result.equity.length > 1 && <AreaChart points={result.equity.map((point) => ({ label: point.t, value: point.value }))} height={190} formatValue={(value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}R`} baseline={0} />}
          <div className="divide-y divide-border border-y border-border">
            {result.perSymbol.map((item) => <div key={item.symbol} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="font-medium">{symbolLabel(item.symbol)}</span><span className="text-xs text-muted">{item.n} trades / {Math.round(item.winRate * 100)}% wins / <span className={item.totalR >= 0 ? "text-positive" : "text-negative"}>{item.totalR >= 0 ? "+" : ""}{item.totalR.toFixed(1)}R</span></span></div>)}
          </div>
          <p className="text-xs leading-5 text-muted">A profitable replay is evidence to investigate, not proof. Compare later live results with this backtest before trusting the idea.</p>
        </div>
      )}
    </div>
  );
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div><span className="mb-1.5 block text-sm font-medium">{label}</span><div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">{options.map((option) => <button key={option.value} onClick={() => onChange(option.value)} className={`px-3 py-2 text-sm ${value === option.value ? "bg-primary text-primary-foreground" : "bg-card text-muted hover:text-foreground"}`}>{option.label}</button>)}</div></div>;
}

function NumberField({ label, suffix, value, min, max, step, onChange }: { label: string; suffix: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="text-sm"><span className="mb-1.5 block font-medium">{label}</span><div className="flex rounded-lg border border-border bg-input focus-within:border-primary"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none" /><span className="flex items-center border-l border-border px-2 text-xs text-muted">{suffix}</span></div></label>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return <div className="rounded-lg border border-border bg-card p-3"><div className="text-[10px] uppercase text-muted">{label}</div><div className={`mt-1 text-sm font-semibold ${tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : ""}`}>{value}</div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const style = status === "live" ? "bg-positive/15 text-positive" : status === "backtested" ? "bg-primary/15 text-primary" : status === "paused" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted/15 text-muted";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style}`}>{status}</span>;
}

function holdDuration(timeframe: string, bars: number): string {
  const hours = timeframe === "15min" ? bars / 4 : timeframe === "1h" ? bars : bars * 24;
  if (hours < 24) return `${hours.toFixed(hours % 1 ? 1 : 0)} hours`;
  return `${Math.round(hours / 24)} days`;
}
