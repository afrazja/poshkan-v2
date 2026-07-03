import "server-only";
import { getOhlc } from "./marketdata";
import { realBars } from "./smc";
import { evaluateMeanRevAt, MEANREV_DEFAULTS, type MeanRevParams } from "./meanrev";
import { costInR } from "./trading-costs";

const LOOKBACK = 140; // enough for a 100-MA trend filter + the bands

export interface MeanRevTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  takeProfit: number;
  entryTime: string;
  exitTime: string;
  exit: number;
  r: number; // +rr on a win (target is the mean, so R varies), -1 on a loss
  win: boolean;
}

export interface MeanRevBtSymbol {
  symbol: string;
  trades: MeanRevTrade[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  from: string | null;
  to: string | null;
}

export interface MeanRevBtResult {
  perSymbol: MeanRevBtSymbol[];
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

async function backtestSymbol(symbol: string, params: MeanRevParams): Promise<MeanRevBtSymbol> {
  const c = realBars(await getOhlc(symbol, "1h", 12000, 365), 60);
  const trades: MeanRevTrade[] = [];

  let i = LOOKBACK;
  while (i < c.length) {
    const ev = evaluateMeanRevAt(symbol, c.slice(Math.max(0, i - LOOKBACK), i + 1), params);
    if (
      ev.status === "signal" &&
      ev.direction &&
      ev.entry != null &&
      ev.stop != null &&
      ev.takeProfit != null &&
      ev.rr != null
    ) {
      const isLong = ev.direction === "LONG";
      const { entry, stop, takeProfit, rr } = ev as { entry: number; stop: number; takeProfit: number; rr: number };
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
      if (exitIdx === -1) break;
      trades.push({
        symbol,
        direction: ev.direction,
        entry,
        stop,
        takeProfit,
        entryTime: c[i].datetime,
        exitTime: c[exitIdx].datetime,
        exit,
        // Net of estimated spread + slippage.
        r: (win ? rr : -1) - costInR(symbol, entry, stop),
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

export async function backtestMeanRev(
  symbols: string[],
  params: MeanRevParams = MEANREV_DEFAULTS
): Promise<MeanRevBtResult> {
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
