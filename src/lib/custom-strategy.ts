import "server-only";

import type { OhlcCandle } from "./marketdata";
import { atr } from "./smc";
import { rsi, sma } from "./indicators";
import { describeRule, type CustomRule, type CustomStrategyInput } from "./custom-strategy-types";

export interface CustomRuleRead {
  rule: CustomRule;
  passed: boolean;
  label: string;
  actual: string;
}

export interface CustomStrategyEvaluation {
  status: "signal" | "waiting" | "no-data";
  reason: string;
  checks: CustomRuleRead[];
  direction?: "LONG" | "SHORT";
  entry?: number;
  stop?: number;
  takeProfit?: number;
  rr?: number;
  barTime?: string;
}

const fmt = (value: number) => (Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4));

function evaluateRule(candles: OhlcCandle[], rule: CustomRule): CustomRuleRead {
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const closes = candles.map((c) => c.close);
  let passed = false;
  let actual = "not enough data";

  switch (rule.kind) {
    case "rsi": {
      const value = rsi(closes, rule.period);
      if (value != null) {
        passed = rule.operator === "above" ? value > rule.value! : value < rule.value!;
        actual = value.toFixed(1);
      }
      break;
    }
    case "price_sma": {
      const value = sma(closes, rule.period!);
      if (value != null) {
        passed = rule.operator === "above" ? current.close > value : current.close < value;
        actual = `close ${fmt(current.close)}, SMA ${fmt(value)}`;
      }
      break;
    }
    case "candle_direction": {
      const direction = current.close > current.open ? "bullish" : current.close < current.open ? "bearish" : "flat";
      passed = direction === rule.operator;
      actual = direction;
      break;
    }
    case "body_percent": {
      const range = current.high - current.low;
      const value = range > 0 ? (Math.abs(current.close - current.open) / range) * 100 : 0;
      passed = value >= rule.value!;
      actual = `${value.toFixed(0)}%`;
      break;
    }
    case "close_previous": {
      if (previous) {
        passed = rule.operator === "above_high" ? current.close > previous.high : current.close < previous.low;
        actual = `close ${fmt(current.close)}, prior ${rule.operator === "above_high" ? "high" : "low"} ${fmt(rule.operator === "above_high" ? previous.high : previous.low)}`;
      }
      break;
    }
    case "range_atr": {
      const atrValue = atr(candles, rule.period!);
      if (atrValue > 0) {
        const multiple = (current.high - current.low) / atrValue;
        passed = rule.operator === "at_least" ? multiple >= rule.value! : multiple <= rule.value!;
        actual = `${multiple.toFixed(2)}x ATR`;
      }
      break;
    }
    case "consecutive": {
      const count = Math.round(rule.value!);
      const recent = candles.slice(-count);
      if (recent.length === count) {
        passed = recent.every((c) =>
          rule.operator === "bullish" ? c.close > c.open : c.close < c.open
        );
        actual = `${recent.filter((c) => c.close !== c.open).length} directional bars checked`;
      }
      break;
    }
  }

  return { rule, passed, label: describeRule(rule), actual };
}

export function minimumBarsForStrategy(strategy: Pick<CustomStrategyInput, "rules">): number {
  return Math.max(
    20,
    ...strategy.rules.map((rule) => {
      if (rule.kind === "consecutive") return Math.round(rule.value ?? 2) + 1;
      return (rule.period ?? 2) + 2;
    })
  );
}

export function evaluateCustomStrategyAt(
  candles: OhlcCandle[],
  strategy: CustomStrategyInput
): CustomStrategyEvaluation {
  if (candles.length < minimumBarsForStrategy(strategy)) {
    return { status: "no-data", reason: "Not enough completed candles for these rules.", checks: [] };
  }

  const checks = strategy.rules.map((rule) => evaluateRule(candles, rule));
  const matched = strategy.matchMode === "all" ? checks.every((c) => c.passed) : checks.some((c) => c.passed);
  if (!matched) {
    const failed = checks.filter((c) => !c.passed).map((c) => c.label);
    return {
      status: "waiting",
      reason: strategy.matchMode === "all" ? `Waiting for: ${failed.join("; ")}` : "None of the entry rules match yet.",
      checks,
    };
  }

  const current = candles[candles.length - 1];
  const atrValue = atr(candles, 14);
  if (atrValue <= 0) return { status: "no-data", reason: "ATR could not be calculated.", checks };

  const entry = current.close;
  const risk = atrValue * strategy.stopAtr;
  const isLong = strategy.direction === "LONG";
  const stop = isLong ? entry - risk : entry + risk;
  const takeProfit = isLong ? entry + risk * strategy.takeProfitRr : entry - risk * strategy.takeProfitRr;
  return {
    status: "signal",
    reason: checks.filter((c) => c.passed).map((c) => c.label).join("; "),
    checks,
    direction: strategy.direction,
    entry,
    stop,
    takeProfit,
    rr: strategy.takeProfitRr,
    barTime: current.datetime,
  };
}
