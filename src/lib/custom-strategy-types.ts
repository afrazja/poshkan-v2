import { z } from "zod";

export const CUSTOM_TIMEFRAMES = ["15min", "1h", "1day"] as const;
export const CUSTOM_RULE_KINDS = [
  "rsi",
  "price_sma",
  "candle_direction",
  "body_percent",
  "close_previous",
  "range_atr",
  "consecutive",
] as const;

export type CustomTimeframe = (typeof CUSTOM_TIMEFRAMES)[number];
export type CustomRuleKind = (typeof CUSTOM_RULE_KINDS)[number];
export type CustomDirection = "LONG" | "SHORT";
export type CustomMatchMode = "all" | "any";
export type CustomStrategyStatus = "draft" | "backtested" | "live" | "paused";

export interface CustomRule {
  id: string;
  kind: CustomRuleKind;
  operator: string;
  period?: number;
  value?: number;
}

export interface CustomStrategyInput {
  accountId: string;
  name: string;
  description: string;
  timeframe: CustomTimeframe;
  symbols: string[];
  direction: CustomDirection;
  matchMode: CustomMatchMode;
  rules: CustomRule[];
  stopAtr: number;
  takeProfitRr: number;
  maxHoldBars: number;
}

export interface CustomStrategyRow extends CustomStrategyInput {
  id: string;
  userId: string;
  status: CustomStrategyStatus;
  version: number;
  lastBacktest: CustomBacktestResult | null;
  lastBacktestedAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomBacktestTrade {
  symbol: string;
  direction: CustomDirection;
  entry: number;
  stop: number;
  takeProfit: number;
  entryTime: string;
  exitTime: string;
  exit: number;
  r: number;
  win: boolean;
  exitReason: "stop" | "target" | "time";
}

export interface CustomBacktestSymbol {
  symbol: string;
  trades: CustomBacktestTrade[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  from: string | null;
  to: string | null;
}

export interface CustomBacktestResult {
  perSymbol: CustomBacktestSymbol[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  avgR: number;
  profitFactor: number;
  maxDrawdownR: number;
  equity: { t: string; value: number }[];
  from: string | null;
  to: string | null;
}

const ruleSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(CUSTOM_RULE_KINDS),
    operator: z.string().min(1).max(32),
    period: z.number().int().min(2).max(200).optional(),
    value: z.number().finite().optional(),
  })
  .superRefine((rule, ctx) => {
    const allowed: Record<CustomRuleKind, string[]> = {
      rsi: ["above", "below"],
      price_sma: ["above", "below"],
      candle_direction: ["bullish", "bearish"],
      body_percent: ["at_least"],
      close_previous: ["above_high", "below_low"],
      range_atr: ["at_least", "at_most"],
      consecutive: ["bullish", "bearish"],
    };
    if (!allowed[rule.kind].includes(rule.operator)) {
      ctx.addIssue({ code: "custom", message: "Unsupported rule comparison" });
    }
    if (["rsi", "price_sma", "range_atr"].includes(rule.kind) && rule.period == null) {
      ctx.addIssue({ code: "custom", message: "This rule needs a lookback period" });
    }
    if (["rsi", "body_percent", "range_atr", "consecutive"].includes(rule.kind) && rule.value == null) {
      ctx.addIssue({ code: "custom", message: "This rule needs a value" });
    }
    if (rule.kind === "rsi" && (rule.value! < 1 || rule.value! > 99)) {
      ctx.addIssue({ code: "custom", message: "RSI must be between 1 and 99" });
    }
    if (rule.kind === "body_percent" && (rule.value! < 1 || rule.value! > 100)) {
      ctx.addIssue({ code: "custom", message: "Body size must be between 1% and 100%" });
    }
    if (rule.kind === "range_atr" && (rule.value! < 0.1 || rule.value! > 10)) {
      ctx.addIssue({ code: "custom", message: "ATR multiple must be between 0.1 and 10" });
    }
    if (rule.kind === "consecutive" && (rule.value! < 2 || rule.value! > 5 || !Number.isInteger(rule.value))) {
      ctx.addIssue({ code: "custom", message: "Consecutive candles must be between 2 and 5" });
    }
  });

export const customStrategyInputSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(280),
  timeframe: z.enum(CUSTOM_TIMEFRAMES),
  symbols: z.array(z.string().trim().min(1).max(30)).min(1).max(5),
  direction: z.enum(["LONG", "SHORT"]),
  matchMode: z.enum(["all", "any"]),
  rules: z.array(ruleSchema).min(1).max(8),
  stopAtr: z.number().min(0.25).max(10),
  takeProfitRr: z.number().min(0.5).max(10),
  maxHoldBars: z.number().int().min(1).max(500),
});

export const RULE_LABELS: Record<CustomRuleKind, string> = {
  rsi: "RSI level",
  price_sma: "Price vs moving average",
  candle_direction: "Candle direction",
  body_percent: "Candle body size",
  close_previous: "Previous candle break",
  range_atr: "Candle range vs ATR",
  consecutive: "Consecutive candles",
};

export function makeDefaultRule(kind: CustomRuleKind, id: string): CustomRule {
  switch (kind) {
    case "rsi":
      return { id, kind, operator: "below", period: 14, value: 30 };
    case "price_sma":
      return { id, kind, operator: "above", period: 50 };
    case "candle_direction":
      return { id, kind, operator: "bullish" };
    case "body_percent":
      return { id, kind, operator: "at_least", value: 60 };
    case "close_previous":
      return { id, kind, operator: "above_high" };
    case "range_atr":
      return { id, kind, operator: "at_least", period: 14, value: 1.5 };
    case "consecutive":
      return { id, kind, operator: "bullish", value: 3 };
  }
}

export function describeRule(rule: CustomRule): string {
  switch (rule.kind) {
    case "rsi":
      return `RSI(${rule.period}) is ${rule.operator} ${rule.value}`;
    case "price_sma":
      return `price closes ${rule.operator} its ${rule.period}-bar moving average`;
    case "candle_direction":
      return `the candle closes ${rule.operator}`;
    case "body_percent":
      return `the candle body is at least ${rule.value}% of its range`;
    case "close_previous":
      return rule.operator === "above_high"
        ? "price closes above the previous candle high"
        : "price closes below the previous candle low";
    case "range_atr":
      return `the candle range is ${rule.operator === "at_least" ? "at least" : "at most"} ${rule.value}x ATR(${rule.period})`;
    case "consecutive":
      return `${rule.value} consecutive candles close ${rule.operator}`;
  }
}

export function describeStrategy(input: Pick<CustomStrategyInput, "direction" | "matchMode" | "rules" | "stopAtr" | "takeProfitRr" | "maxHoldBars">): string {
  const joined = input.rules.map(describeRule).join(input.matchMode === "all" ? ", and " : ", or ");
  return `${input.direction === "LONG" ? "Look for a long setup" : "Look for a short setup"} when ${joined}. Stop ${input.stopAtr}x ATR away, target ${input.takeProfitRr}R, and close after ${input.maxHoldBars} bars if neither is reached.`;
}

export function customStrategyFromDb(row: Record<string, unknown>): CustomStrategyRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    accountId: String(row.account_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    timeframe: row.timeframe as CustomTimeframe,
    symbols: (row.symbols ?? []) as string[],
    direction: row.direction as CustomDirection,
    matchMode: row.match_mode as CustomMatchMode,
    rules: (row.rules ?? []) as CustomRule[],
    stopAtr: Number(row.stop_atr),
    takeProfitRr: Number(row.take_profit_rr),
    maxHoldBars: Number(row.max_hold_bars),
    status: row.status as CustomStrategyStatus,
    version: Number(row.version),
    lastBacktest: (row.last_backtest as CustomBacktestResult | null) ?? null,
    lastBacktestedAt: (row.last_backtested_at as string | null) ?? null,
    lastRunAt: (row.last_run_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
