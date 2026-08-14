import "server-only";

import { getOhlc, type OhlcCandle } from "./marketdata";
import { realBars } from "./smc";
import { costInR } from "./trading-costs";
import { evaluateCustomStrategyAt, minimumBarsForStrategy } from "./custom-strategy";
import type {
  CustomBacktestResult,
  CustomBacktestSymbol,
  CustomBacktestTrade,
  CustomStrategyInput,
} from "./custom-strategy-types";

const TIMEFRAME_DATA = {
  "15min": { output: 7000, days: 59, step: 15 },
  "1h": { output: 9000, days: 365, step: 60 },
  "1day": { output: 1300, days: 2100, step: 1440 },
} as const;

export async function getCustomStrategyBars(symbol: string, timeframe: CustomStrategyInput["timeframe"]): Promise<OhlcCandle[]> {
  const config = TIMEFRAME_DATA[timeframe];
  return realBars(await getOhlc(symbol, timeframe, config.output, config.days), config.step);
}

async function backtestSymbol(symbol: string, strategy: CustomStrategyInput): Promise<CustomBacktestSymbol> {
  const candles = await getCustomStrategyBars(symbol, strategy.timeframe);
  const trades: CustomBacktestTrade[] = [];
  const warmup = minimumBarsForStrategy(strategy);

  let i = warmup;
  while (i < candles.length - 1) {
    const evaluation = evaluateCustomStrategyAt(candles.slice(Math.max(0, i - 240), i + 1), strategy);
    if (
      evaluation.status !== "signal" ||
      evaluation.entry == null ||
      evaluation.stop == null ||
      evaluation.takeProfit == null ||
      !evaluation.direction
    ) {
      i++;
      continue;
    }

    const isLong = evaluation.direction === "LONG";
    const entry = evaluation.entry;
    const stop = evaluation.stop;
    const takeProfit = evaluation.takeProfit;
    const lastExitIndex = Math.min(candles.length - 1, i + strategy.maxHoldBars);
    let exitIndex = lastExitIndex;
    let exit = candles[lastExitIndex].close;
    let exitReason: CustomBacktestTrade["exitReason"] = "time";

    for (let bar = i + 1; bar <= lastExitIndex; bar++) {
      const candle = candles[bar];
      if (isLong) {
        if (candle.low <= stop) {
          exitIndex = bar;
          exit = stop;
          exitReason = "stop";
          break;
        }
        if (candle.high >= takeProfit) {
          exitIndex = bar;
          exit = takeProfit;
          exitReason = "target";
          break;
        }
      } else {
        if (candle.high >= stop) {
          exitIndex = bar;
          exit = stop;
          exitReason = "stop";
          break;
        }
        if (candle.low <= takeProfit) {
          exitIndex = bar;
          exit = takeProfit;
          exitReason = "target";
          break;
        }
      }
    }

    const riskDistance = Math.abs(entry - stop);
    const grossR = riskDistance > 0 ? ((isLong ? exit - entry : entry - exit) / riskDistance) : 0;
    const netR = grossR - costInR(symbol, entry, stop);
    trades.push({
      symbol,
      direction: evaluation.direction,
      entry,
      stop,
      takeProfit,
      entryTime: candles[i].datetime,
      exitTime: candles[exitIndex].datetime,
      exit,
      r: Math.round(netR * 1000) / 1000,
      win: netR > 0,
      exitReason,
    });
    i = exitIndex + 1;
  }

  const n = trades.length;
  const wins = trades.filter((trade) => trade.win).length;
  return {
    symbol,
    trades,
    n,
    wins,
    winRate: n ? wins / n : 0,
    totalR: trades.reduce((sum, trade) => sum + trade.r, 0),
    from: candles[0]?.datetime ?? null,
    to: candles[candles.length - 1]?.datetime ?? null,
  };
}

export async function backtestCustomStrategy(strategy: CustomStrategyInput): Promise<CustomBacktestResult> {
  const perSymbol = await Promise.all(strategy.symbols.slice(0, 5).map((symbol) => backtestSymbol(symbol, strategy)));
  const trades = perSymbol
    .flatMap((result) => result.trades)
    .sort((a, b) => new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime());

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equity = trades.map((trade) => {
    cumulative += trade.r;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    return { t: trade.exitTime, value: Math.round(cumulative * 100) / 100 };
  });

  const n = trades.length;
  const wins = trades.filter((trade) => trade.win).length;
  const totalR = trades.reduce((sum, trade) => sum + trade.r, 0);
  const grossWin = trades.filter((trade) => trade.r > 0).reduce((sum, trade) => sum + trade.r, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.r < 0).reduce((sum, trade) => sum + trade.r, 0));
  const fromTimes = perSymbol.map((result) => result.from).filter(Boolean) as string[];
  const toTimes = perSymbol.map((result) => result.to).filter(Boolean) as string[];

  return {
    perSymbol,
    n,
    wins,
    winRate: n ? wins / n : 0,
    totalR: Math.round(totalR * 100) / 100,
    avgR: n ? Math.round((totalR / n) * 100) / 100 : 0,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? -1 : 0,
    maxDrawdownR: Math.round(maxDrawdown * 100) / 100,
    equity,
    from: fromTimes.sort()[0] ?? null,
    to: toTimes.sort().slice(-1)[0] ?? null,
  };
}
