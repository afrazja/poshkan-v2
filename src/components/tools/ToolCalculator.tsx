"use client";

import { useState } from "react";
import {
  type CalcKey,
  type ToolPair,
  toolPairBySlug,
  toolPipValueUsd,
  toolPositionSize,
  toolMarginUsd,
  toolProfit,
  effectiveQuoteUsd,
  fmtUsd,
} from "@/app/tools/tools-data";
import { FX_LEVERAGE_OPTIONS, FX_LOTS } from "@/lib/forex";

interface Props {
  calc: CalcKey;
  pairSlug: string;
  initialRate: number; // live rate at render time (or the pair's fallback)
  quoteUsd: number; // USD value of 1 unit of the quote currency at render time
  live: boolean; // whether initialRate came from a live quote
}

const num = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function Field({
  label,
  suffix,
  value,
  onChange,
  step,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary/50">
        <input
          type="number"
          inputMode="decimal"
          step={step ?? "any"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm outline-none"
        />
        {suffix && <span className="shrink-0 text-xs text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

function Result({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span
        className={`text-right font-semibold tabular-nums ${
          tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function ToolCalculator({ calc, pairSlug, initialRate, quoteUsd, live }: Props) {
  const pair = toolPairBySlug(pairSlug) as ToolPair;

  const [rateStr, setRateStr] = useState(initialRate.toFixed(pair.rateDp));
  const [lotsStr, setLotsStr] = useState("1");
  const [balanceStr, setBalanceStr] = useState("10000");
  const [riskStr, setRiskStr] = useState("1");
  const [slPipsStr, setSlPipsStr] = useState("25");
  const [leverage, setLeverage] = useState<number>(30);
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [entryStr, setEntryStr] = useState(initialRate.toFixed(pair.rateDp));
  const [exitStr, setExitStr] = useState((initialRate + 50 * pair.pipSize).toFixed(pair.rateDp));

  const rate = num(rateStr);
  const qUsd = effectiveQuoteUsd(pair, rate, quoteUsd);
  const lots = num(lotsStr);
  const units = lots * pair.contractSize;

  const rateField = (
    <Field
      label={`${pair.name} rate${live ? " (live)" : ""}`}
      value={rateStr}
      onChange={setRateStr}
      step={String(pair.pipSize)}
    />
  );
  const lotsField = (
    <Field
      label="Trade size"
      suffix={`lots · 1 lot = ${pair.contractSize.toLocaleString("en-US")} ${pair.base === "XAU" ? "oz" : pair.base}`}
      value={lotsStr}
      onChange={setLotsStr}
      step="0.01"
    />
  );

  let inputs: React.ReactNode = null;
  let results: React.ReactNode = null;

  if (calc === "pip-calculator") {
    const perPip = toolPipValueUsd(units, pair, qUsd);
    inputs = (
      <>
        {lotsField}
        {rateField}
      </>
    );
    results = (
      <>
        <Result label={`1 pip on ${lots || 0} lot${lots === 1 ? "" : "s"}`} value={`$${fmtUsd(perPip)}`} />
        <div className="mt-2 border-t border-border pt-2">
          {FX_LOTS.map((l) => {
            const u = pair.base === "XAU" ? (l.units / 100_000) * pair.contractSize : l.units;
            return (
              <Result
                key={l.key}
                label={`${l.label} lot (${u.toLocaleString("en-US")} ${pair.base === "XAU" ? "oz" : pair.base})`}
                value={`$${fmtUsd(toolPipValueUsd(u, pair, qUsd))} / pip`}
              />
            );
          })}
        </div>
      </>
    );
  } else if (calc === "position-size-calculator") {
    const r = toolPositionSize(num(balanceStr), num(riskStr), num(slPipsStr), pair, qUsd);
    inputs = (
      <>
        <Field label="Account balance" suffix="USD" value={balanceStr} onChange={setBalanceStr} />
        <Field label="Risk per trade" suffix="%" value={riskStr} onChange={setRiskStr} step="0.1" />
        <Field label="Stop-loss distance" suffix="pips" value={slPipsStr} onChange={setSlPipsStr} />
        {pair.base === "USD" && rateField}
      </>
    );
    results = (
      <>
        <Result label="Money at risk" value={`$${fmtUsd(r.riskUsd)}`} />
        <Result label="Position size" value={`${r.lots.toFixed(2)} lots`} />
        <Result
          label={pair.base === "XAU" ? "In ounces" : "In units"}
          value={`${Math.round(r.units).toLocaleString("en-US")} ${pair.base === "XAU" ? "oz" : pair.base}`}
        />
        <Result label="Value of 1 pip at that size" value={`$${fmtUsd(toolPipValueUsd(r.units, pair, qUsd))}`} />
      </>
    );
  } else if (calc === "margin-calculator") {
    const r = toolMarginUsd(units, rate, leverage, pair, qUsd);
    inputs = (
      <>
        {lotsField}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Leverage</span>
          <span className="flex flex-wrap gap-2">
            {FX_LEVERAGE_OPTIONS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLeverage(l)}
                className={`rounded-xl border px-3 py-1.5 text-sm ${
                  leverage === l
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border text-muted hover:border-primary/50"
                }`}
              >
                {l}:1
              </button>
            ))}
          </span>
        </label>
        {rateField}
      </>
    );
    results = (
      <>
        <Result label="Position value (notional)" value={`$${fmtUsd(r.notionalUsd)}`} />
        <Result label={`Margin required at ${leverage}:1`} value={`$${fmtUsd(r.marginUsd)}`} />
      </>
    );
  } else {
    const entry = num(entryStr);
    const exit = num(exitStr);
    // For USD-base pairs the conversion uses the exit rate (P&L realizes there).
    const r = toolProfit(direction, units, entry, exit, pair, effectiveQuoteUsd(pair, exit, quoteUsd));
    const tone = r.profitUsd > 0 ? "pos" : r.profitUsd < 0 ? "neg" : undefined;
    inputs = (
      <>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Direction</span>
          <span className="flex gap-2">
            {(["LONG", "SHORT"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 rounded-xl border px-3 py-1.5 text-sm ${
                  direction === d
                    ? d === "LONG"
                      ? "border-positive bg-positive/10 font-semibold"
                      : "border-negative bg-negative/10 font-semibold"
                    : "border-border text-muted hover:border-primary/50"
                }`}
              >
                {d === "LONG" ? "Long (buy)" : "Short (sell)"}
              </button>
            ))}
          </span>
        </label>
        <Field label="Entry price" value={entryStr} onChange={setEntryStr} step={String(pair.pipSize)} />
        <Field label="Exit price" value={exitStr} onChange={setExitStr} step={String(pair.pipSize)} />
        {lotsField}
      </>
    );
    results = (
      <>
        <Result label="Result in pips" value={`${r.pips >= 0 ? "+" : ""}${fmtUsd(r.pips, 1)} pips`} tone={tone} />
        <Result
          label="Profit / loss"
          value={`${r.profitUsd >= 0 ? "+" : "−"}$${fmtUsd(Math.abs(r.profitUsd))}`}
          tone={tone}
        />
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">{inputs}</div>
        <div className="rounded-xl border border-border bg-card p-4">{results}</div>
      </div>
      <p className="mt-4 text-xs text-muted">
        {live
          ? `Prefilled with a recent ${pair.name} rate — every field is editable.`
          : `Live rate unavailable right now — prefilled with a typical ${pair.name} rate; edit any field.`}
      </p>
    </div>
  );
}
