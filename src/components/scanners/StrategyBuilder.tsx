"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  FilePlus2,
  FlaskConical,
  Lightbulb,
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
type BuilderMode = "choose" | "guided" | "blank";

const STEPS = ["Setup", "Entry rules", "Exit & risk", "Test"];
const fieldClass =
  "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none transition focus:border-primary";

function initialRules(): CustomRule[] {
  return [
    makeDefaultRule("close_previous", "rule-1"),
    makeDefaultRule("candle_direction", "rule-2"),
  ];
}

function guidedRules(): CustomRule[] {
  return [
    { id: "rule-1", kind: "price_sma", operator: "above", period: 50 },
    { id: "rule-2", kind: "rsi", operator: "below", period: 14, value: 30 },
  ];
}

const GUIDED_STEPS = [
  {
    title: "Start with a testable hypothesis",
    description:
      "This example asks whether an hourly RSI pullback can recover while price remains above its 50-bar moving average. Keep the first test narrow: three symbols and one clear idea.",
  },
  {
    title: "Separate market context from the entry",
    description:
      "Match all means both rules must be true. Price above SMA(50) supplies the uptrend context; RSI(14) below 30 identifies the pullback. Change a value and the Rule summary translates it immediately.",
  },
  {
    title: "Define the loss before the target",
    description:
      "A 1.5x ATR stop adapts to recent volatility. A 2R target is twice the initial risk, and 24 hourly bars gives the idea about one day to work.",
  },
  {
    title: "Look for evidence, not a winning number",
    description:
      "Run the exact rules, then inspect sample size, net R, drawdown, and symbol concentration together. A positive replay still needs live paper evidence before it deserves confidence.",
  },
] as const;

export default function StrategyBuilder({
  accounts,
  initial,
}: {
  accounts: BuilderAccount[];
  initial?: CustomStrategyRow | null;
}) {
  const router = useRouter();
  const firstAccount = accounts.find((account) => account.id === initial?.accountId) ?? accounts[0];
  const [builderMode, setBuilderMode] = useState<BuilderMode>(initial ? "blank" : "choose");
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

  function startGuided() {
    setName("Hourly RSI pullback");
    setDescription("Hypothesis: after a sharp pullback, price may resume an existing uptrend.");
    setTimeframe("1h");
    setSymbols(marketUniverse(account?.type).slice(0, 3));
    setDirection("LONG");
    setMatchMode("all");
    setRules(guidedRules());
    setStopAtr(1.5);
    setTakeProfitRr(2);
    setMaxHoldBars(24);
    setResult(null);
    setTestedSignature(null);
    setStatus("draft");
    setStep(0);
    setBuilderMode("guided");
    clearNotices();
  }

  function startBlank() {
    setName("My candle experiment");
    setDescription("");
    setTimeframe("1h");
    setSymbols(marketUniverse(account?.type).slice(0, 3));
    setDirection("LONG");
    setMatchMode("all");
    setRules(initialRules());
    setStopAtr(1.5);
    setTakeProfitRr(2);
    setMaxHoldBars(24);
    setResult(null);
    setTestedSignature(null);
    setStatus("draft");
    setStep(0);
    setBuilderMode("blank");
    clearNotices();
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

  if (builderMode === "choose") {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="border-b border-border pb-5">
          <Link href="/dashboard/scanners" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Strategy Lab
          </Link>
          <h1 className="mt-3 text-xl font-semibold sm:text-2xl">Create your first strategy</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Learn with a complete example or open the same builder with neutral defaults. Both paths
            create editable rules for backtesting and paper observation.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="flex flex-col rounded-lg border border-primary/40 bg-primary/5 p-5" aria-labelledby="guided-choice-title">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <BookOpenCheck size={20} aria-hidden />
              </span>
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                Recommended
              </span>
            </div>
            <h2 id="guided-choice-title" className="mt-4 text-base font-semibold">Build a guided example</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Create an hourly RSI pullback experiment while the builder explains the hypothesis,
              entry logic, risk, and evidence at each step.
            </p>
            <ul className="mt-4 space-y-2 text-xs text-muted">
              {["Three symbols", "Two entry rules", "1.5x ATR stop", "2R target"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check size={14} className="text-primary" aria-hidden /> {item}
                </li>
              ))}
            </ul>
            <button
              onClick={startGuided}
              className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Start guided strategy <ArrowRight size={16} aria-hidden />
            </button>
          </section>

          <section className="flex flex-col rounded-lg border border-border bg-card p-5" aria-labelledby="blank-choice-title">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-background text-muted">
              <FilePlus2 size={20} aria-hidden />
            </span>
            <h2 id="blank-choice-title" className="mt-4 text-base font-semibold">Start with a blank strategy</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use the builder directly with neutral candle defaults. Best when you already know the
              market behavior and conditions you want to test.
            </p>
            <div className="mt-4 border-l-2 border-border pl-3 text-xs leading-5 text-muted">
              You can combine up to eight candle and indicator rules across as many as five symbols.
            </div>
            <button
              onClick={startBlank}
              className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-background"
            >
              Open blank builder <ArrowRight size={16} aria-hidden />
            </button>
          </section>
        </div>

        <p className="border-y border-border py-4 text-center text-xs leading-5 text-muted">
          The guided example is a teaching exercise, not a recommended trade or a promise of profit.
        </p>
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
          {builderMode === "guided" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <BookOpenCheck size={13} aria-hidden /> Guided example
            </span>
          )}
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
          {builderMode === "guided" && (
            <GuidedCoach step={step} onHide={() => setBuilderMode("blank")} />
          )}
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

function GuidedCoach({ step, onHide }: { step: number; onHide: () => void }) {
  const guidance = GUIDED_STEPS[step] ?? GUIDED_STEPS[0];
  return (
    <div className="mb-5 border-l-2 border-primary pl-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Lightbulb size={14} aria-hidden /> Guided step {step + 1}
          </p>
          <h2 className="mt-1 text-sm font-semibold">{guidance.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{guidance.description}</p>
        </div>
        <button onClick={onHide} className="shrink-0 text-xs text-muted hover:text-foreground hover:underline">
          Hide guide
        </button>
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
            <div className="mt-2 grid items-end gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase text-muted">Condition</span>
                <select value={rule.kind} onChange={(event) => onChangeKind(rule.id, event.target.value as CustomRuleKind)} className={fieldClass} aria-label={`Rule ${index + 1} type`}>
                  {(Object.entries(RULE_LABELS) as [CustomRuleKind, string][]).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                </select>
              </label>
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
  const number = (label: string, value: number | undefined, patch: "period" | "value", min: number, max: number, step = 1) => (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase text-muted">{label}</span>
      <input type="number" value={value ?? ""} min={min} max={max} step={step} onChange={(event) => onUpdate({ [patch]: Number(event.target.value) })} className={fieldClass} aria-label={label} />
    </label>
  );
  const select = (label: string, options: { value: string; label: string }[]) => (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase text-muted">{label}</span>
      <select value={rule.operator} onChange={(event) => onUpdate({ operator: event.target.value })} className={fieldClass}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  if (rule.kind === "rsi") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_76px_76px] items-end gap-2">
        {select("Comparison", [{ value: "below", label: "Below" }, { value: "above", label: "Above" }])}
        {number("Level", rule.value, "value", 1, 99)}
        {number("Period", rule.period, "period", 2, 200)}
      </div>
    );
  }
  if (rule.kind === "price_sma") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_90px] items-end gap-2">
        {select("Comparison", [{ value: "above", label: "Closes above" }, { value: "below", label: "Closes below" }])}
        {number("Period", rule.period, "period", 2, 200)}
      </div>
    );
  }
  if (rule.kind === "candle_direction") {
    return select("Direction", [{ value: "bullish", label: "Bullish close" }, { value: "bearish", label: "Bearish close" }]);
  }
  if (rule.kind === "body_percent") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_100px] items-end gap-2">
        <div><span className="mb-1 block text-[10px] font-semibold uppercase text-muted">Measure</span><span className="flex min-h-10 items-center text-sm text-muted">At least % of range</span></div>
        {number("Percent", rule.value, "value", 1, 100)}
      </div>
    );
  }
  if (rule.kind === "close_previous") {
    return select("Break condition", [{ value: "above_high", label: "Close above previous high" }, { value: "below_low", label: "Close below previous low" }]);
  }
  if (rule.kind === "range_atr") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-end gap-2">
        {select("Comparison", [{ value: "at_least", label: "At least" }, { value: "at_most", label: "At most" }])}
        {number("Multiple", rule.value, "value", 0.1, 10, 0.1)}
        {number("Period", rule.period, "period", 2, 200)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px] items-end gap-2">
      {select("Direction", [{ value: "bullish", label: "Bullish" }, { value: "bearish", label: "Bearish" }])}
      {number("Candles", rule.value, "value", 2, 5)}
    </div>
  );
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
          <EvidenceCoach result={result} />
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

function EvidenceCoach({ result }: { result: CustomBacktestResult }) {
  const positiveSymbols = result.perSymbol.filter((item) => item.totalR > 0);
  const positiveR = positiveSymbols.reduce((sum, item) => sum + item.totalR, 0);
  const strongest = positiveSymbols.reduce<(typeof positiveSymbols)[number] | undefined>(
    (best, item) => (!best || item.totalR > best.totalR ? item : best),
    undefined
  );
  const strongestShare = strongest && positiveR > 0 ? strongest.totalR / positiveR : 0;
  const notes = [
    result.n < 30
      ? `Only ${result.n} trades matched. Treat this as a small sample and test more history or symbols before drawing conclusions.`
      : `${result.n} trades matched. The sample is more useful than a handful of trades, but still needs forward testing.`,
    result.totalR > 0
      ? `The replay finished positive at +${result.totalR}R. That is evidence for further testing, not proof the rules will remain profitable.`
      : `The replay finished at ${result.totalR}R. Keep the result as evidence and change one assumption at a time before testing again.`,
    `The largest peak-to-trough decline was ${result.maxDrawdownR}R. Compare that loss sequence with the return, not with win rate alone.`,
  ];
  if (strongest && strongestShare >= 0.7 && result.perSymbol.length > 1) {
    notes.push(
      `${symbolLabel(strongest.symbol)} produced ${Math.round(strongestShare * 100)}% of the positive R. Check whether the idea works beyond one symbol.`
    );
  }

  return (
    <section className="border-y border-border py-4" aria-labelledby="evidence-coach-title">
      <h3 id="evidence-coach-title" className="text-sm font-semibold">How to read this result</h3>
      <ul className="mt-3 space-y-2 text-xs leading-5 text-muted">
        {notes.map((note) => (
          <li key={note} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </section>
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
