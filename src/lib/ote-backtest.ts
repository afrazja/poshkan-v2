import "server-only";
import { getOhlc } from "./marketdata";
import { realBars } from "./smc";
import { evaluateOteAt, OTE_DEFAULTS, type OteParams } from "./ote";

// Live fetches 250 entry-TF (5min) bars and 200 trend-TF (15min) bars — the
// replay must use the same window sizes or it measures a different strategy
// (window length changes trendBOS, the swing anchors, and the sweep pool).
// NOTE the historical naming: "m15" here is the 5-min ENTRY series and "h1"
// is the 15-min TREND series, matching ote.ts's fetches.
const M15_LOOKBACK = 250;
const H1_LOOKBACK = 200;

export interface OteTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  takeProfit: number;
  entryTime: string;
  exitTime: string;
  exit: number;
  r: number; // +rr on a win (OTE targets a swing, so R varies), -1 on a loss
  win: boolean;
}

export interface OteBtSymbol {
  symbol: string;
  trades: OteTrade[];
  n: number;
  wins: number;
  winRate: number;
  totalR: number;
  from: string | null;
  to: string | null;
}

export interface OteBtResult {
  perSymbol: OteBtSymbol[];
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

async function backtestSymbol(symbol: string, params: OteParams): Promise<OteBtSymbol> {
  // Deepest window Yahoo allows for intraday: ~58d of 15-min trend / 5-min entries.
  const [h1raw, m15raw] = await Promise.all([
    getOhlc(symbol, "15min", 8000, 58),
    getOhlc(symbol, "5min", 8000, 58),
  ]);
  const h1 = realBars(h1raw, 15);
  const m15 = realBars(m15raw, 5);
  const trades: OteTrade[] = [];
  const h1Time = h1.map((c) => new Date(c.datetime).getTime());

  let i = M15_LOOKBACK;
  while (i < m15.length) {
    // Window of exactly M15_LOOKBACK entry bars ending at bar i — matches live.
    const m15win = m15.slice(Math.max(0, i - M15_LOOKBACK + 1), i + 1);
    const tTime = new Date(m15[i].datetime).getTime();
    // Trend window = only 15-min bars fully CLOSED by this 5-min bar's close.
    // Timestamps are bar OPENS, so a trend bar is usable when open + 15min ≤
    // entry open + 5min — otherwise its close is future data (lookahead).
    let hi = h1Time.length;
    while (hi > 0 && h1Time[hi - 1] + 15 * 60_000 > tTime + 5 * 60_000) hi--;
    const h1win = h1.slice(Math.max(0, hi - H1_LOOKBACK), hi);
    if (h1win.length < 30) {
      i++;
      continue;
    }

    const ev = evaluateOteAt(symbol, h1win, m15win, params);
    if (
      ev.status === "signal" &&
      ev.direction &&
      ev.entry != null &&
      ev.stop != null &&
      ev.takeProfit != null &&
      ev.rr != null
    ) {
      const isLong = ev.direction === "LONG";
      const { entry, stop, takeProfit, rr } = ev as {
        entry: number;
        stop: number;
        takeProfit: number;
        rr: number;
      };
      let exitIdx = -1;
      let exit = 0;
      let win = false;
      for (let b = i + 1; b < m15.length; b++) {
        const c = m15[b];
        if (isLong) {
          if (c.low <= stop) { exitIdx = b; exit = stop; win = false; break; } // stop first (conservative)
          if (c.high >= takeProfit) { exitIdx = b; exit = takeProfit; win = true; break; }
        } else {
          if (c.high >= stop) { exitIdx = b; exit = stop; win = false; break; }
          if (c.low <= takeProfit) { exitIdx = b; exit = takeProfit; win = true; break; }
        }
      }
      if (exitIdx === -1) break; // open at end of data — don't count
      trades.push({
        symbol,
        direction: ev.direction,
        entry,
        stop,
        takeProfit,
        entryTime: m15[i].datetime,
        exitTime: m15[exitIdx].datetime,
        exit,
        r: win ? rr : -1,
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
    from: m15[0]?.datetime ?? null,
    to: m15[m15.length - 1]?.datetime ?? null,
  };
}

export async function backtestOte(symbols: string[], params: OteParams = OTE_DEFAULTS): Promise<OteBtResult> {
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
