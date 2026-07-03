import "server-only";
import { getOhlc } from "./marketdata";
import { realBars, evaluateAt, DEFAULT_PARAMS, type SmcParams } from "./smc";
import { costInR } from "./trading-costs";

// Live uses the last 150 M5 / 120 H1 bars — the replay mirrors that exactly.
const M5_LOOKBACK = 150;
const H1_LOOKBACK = 120;

export interface BtTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  takeProfit: number;
  entryTime: string;
  exitTime: string;
  exit: number;
  r: number; // R-multiple: +tpRR on a win, -1 on a loss
  win: boolean;
}

export interface BtSymbol {
  symbol: string;
  trades: BtTrade[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  from: string | null;
  to: string | null;
}

export interface BtResult {
  perSymbol: BtSymbol[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  avgR: number;
  profitFactor: number; // ∞ encoded as -1 by the API layer
  maxDrawdownR: number;
  equity: { t: string; value: number }[]; // cumulative R after each closed trade
  from: string | null;
  to: string | null;
}

// Replay the SMC strategy over one symbol's recent history (no lookahead).
async function backtestSymbol(symbol: string, params: SmcParams): Promise<BtSymbol> {
  // Pull the deepest window Yahoo allows so the sample is big enough to mean
  // something: ~58 days of 5-min entries, ~180 days of 1-hour trend context.
  const [h1raw, m5raw] = await Promise.all([
    getOhlc(symbol, "1h", 5000, 180),
    getOhlc(symbol, "5min", 20000, 58),
  ]);
  const h1 = realBars(h1raw, 60);
  const m5 = realBars(m5raw, 5);
  const trades: BtTrade[] = [];
  const h1Time = h1.map((c) => new Date(c.datetime).getTime());

  let i = M5_LOOKBACK;
  while (i < m5.length) {
    // Window of exactly M5_LOOKBACK bars ending at bar i — matches the live fetch.
    const m5win = m5.slice(Math.max(0, i - M5_LOOKBACK + 1), i + 1);
    const tTime = new Date(m5[i].datetime).getTime();
    // H1 window = only bars fully CLOSED by this M5 bar's close. Timestamps are
    // bar OPENS, so an H1 bar is usable when open + 60min ≤ m5 open + 5min —
    // otherwise its close contains up to ~55 minutes of future data (lookahead).
    let hi = h1Time.length;
    while (hi > 0 && h1Time[hi - 1] + 3_600_000 > tTime + 5 * 60_000) hi--;
    const h1win = h1.slice(Math.max(0, hi - H1_LOOKBACK), hi);
    if (h1win.length < 30) {
      i++;
      continue;
    }

    const ev = evaluateAt(symbol, h1win, m5win, params);
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
      for (let b = i + 1; b < m5.length; b++) {
        const c = m5[b];
        if (isLong) {
          if (c.low <= stop) { exitIdx = b; exit = stop; win = false; break; } // stop checked first (conservative)
          if (c.high >= takeProfit) { exitIdx = b; exit = takeProfit; win = true; break; }
        } else {
          if (c.high >= stop) { exitIdx = b; exit = stop; win = false; break; }
          if (c.low <= takeProfit) { exitIdx = b; exit = takeProfit; win = true; break; }
        }
      }
      if (exitIdx === -1) break; // open at end of data — stop (don't count an unresolved trade)
      trades.push({
        symbol,
        direction: ev.direction,
        entry,
        stop,
        takeProfit,
        entryTime: m5[i].datetime,
        exitTime: m5[exitIdx].datetime,
        exit,
        // Net of estimated spread + slippage — ideal-price fills flatter every
        // strategy, high-frequency ones most.
        r: (win ? params.tpRR : -1) - costInR(symbol, entry, stop),
        win,
      });
      i = exitIdx + 1; // one position at a time — resume after it closes
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
    from: m5[0]?.datetime ?? null,
    to: m5[m5.length - 1]?.datetime ?? null,
  };
}

export async function backtestSmc(symbols: string[], params: SmcParams = DEFAULT_PARAMS): Promise<BtResult> {
  const perSymbol = await Promise.all(symbols.slice(0, 8).map((s) => backtestSymbol(s, params)));

  // Combined equity curve: all trades ordered by exit time.
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
