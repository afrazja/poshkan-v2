import "server-only";
import { getOhlc } from "./marketdata";
import { realBars } from "./smc";
import { evaluateTrendAt, TREND_DEFAULTS, type TrendParams } from "./trend";

// A 120-bar window is plenty for Donchian(20) + a 50-MA filter.
const LOOKBACK = 120;

export interface TrendTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  takeProfit: number;
  entryTime: string;
  exitTime: string;
  exit: number;
  r: number; // +tpRR on a win, -1 on a loss
  win: boolean;
}

export interface TrendBtSymbol {
  symbol: string;
  trades: TrendTrade[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  from: string | null;
  to: string | null;
}

export interface TrendBtResult {
  perSymbol: TrendBtSymbol[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  avgR: number;
  profitFactor: number; // ∞ encoded as -1
  maxDrawdownR: number;
  equity: { t: string; value: number }[];
  from: string | null;
  to: string | null;
}

async function backtestSymbol(symbol: string, params: TrendParams): Promise<TrendBtSymbol> {
  // ~1 year of 1-hour bars (Yahoo allows up to ~730 days hourly).
  const c = realBars(await getOhlc(symbol, "1h", 12000, 365), 60);
  const trades: TrendTrade[] = [];

  let i = LOOKBACK;
  while (i < c.length) {
    const ev = evaluateTrendAt(symbol, c.slice(Math.max(0, i - LOOKBACK), i + 1), params);
    if (
      ev.status === "signal" &&
      ev.direction &&
      ev.entry != null &&
      ev.stop != null &&
      ev.takeProfit != null
    ) {
      const isLong = ev.direction === "LONG";
      const { entry, stop, takeProfit } = ev as { entry: number; stop: number; takeProfit: number };
      let exitIdx = -1;
      let exit = 0;
      let win = false;
      for (let b = i + 1; b < c.length; b++) {
        const k = c[b];
        if (isLong) {
          if (k.low <= stop) { exitIdx = b; exit = stop; win = false; break; } // stop first (conservative)
          if (k.high >= takeProfit) { exitIdx = b; exit = takeProfit; win = true; break; }
        } else {
          if (k.high >= stop) { exitIdx = b; exit = stop; win = false; break; }
          if (k.low <= takeProfit) { exitIdx = b; exit = takeProfit; win = true; break; }
        }
      }
      if (exitIdx === -1) break; // open at end of data — don't count
      trades.push({
        symbol,
        direction: ev.direction,
        entry,
        stop,
        takeProfit,
        entryTime: c[i].datetime,
        exitTime: c[exitIdx].datetime,
        exit,
        r: win ? params.tpRR : -1,
        win,
      });
      i = exitIdx + 1;
    } else {
      i++;
    }
  }

  const n = trades.length;
  const wins = trades.filter((t) => t.win).length;
  return {
    symbol,
    trades,
    n,
    wins,
    winRate: n ? wins / n : 0,
    totalR: trades.reduce((s, t) => s + t.r, 0),
    from: c[0]?.datetime ?? null,
    to: c[c.length - 1]?.datetime ?? null,
  };
}

export async function backtestTrend(symbols: string[], params: TrendParams = TREND_DEFAULTS): Promise<TrendBtResult> {
  const perSymbol = await Promise.all(symbols.slice(0, 8).map((s) => backtestSymbol(s, params)));

  const all = perSymbol
    .flatMap((r) => r.trades)
    .sort((a, b) => new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime());

  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  const equity = all.map((t) => {
    cum += t.r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    return { t: t.exitTime, value: Math.round(cum * 100) / 100 };
  });

  const n = all.length;
  const wins = all.filter((t) => t.win).length;
  const totalR = all.reduce((s, t) => s + t.r, 0);
  const grossWin = all.filter((t) => t.r > 0).reduce((s, t) => s + t.r, 0);
  const grossLoss = Math.abs(all.filter((t) => t.r < 0).reduce((s, t) => s + t.r, 0));
  const fromTimes = perSymbol.map((r) => r.from).filter(Boolean) as string[];
  const toTimes = perSymbol.map((r) => r.to).filter(Boolean) as string[];

  return {
    perSymbol,
    n,
    wins,
    winRate: n ? wins / n : 0,
    totalR: Math.round(totalR * 100) / 100,
    avgR: n ? Math.round((totalR / n) * 100) / 100 : 0,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? -1 : 0,
    maxDrawdownR: Math.round(maxDd * 100) / 100,
    equity,
    from: fromTimes.sort()[0] ?? null,
    to: toTimes.sort().slice(-1)[0] ?? null,
  };
}
