import { NextResponse } from "next/server";
import { getOhlc } from "@/lib/marketdata";
import { realBars } from "@/lib/smc";
import { requireUser } from "../_auth";

const INTERVAL_MIN: Record<string, number> = { "5min": 5, "15min": 15, "1h": 60, "1day": 1440 };

// OHLC candles for candlestick charts (mirrors /api/timeseries, but keeps O/H/L/C).
// With `around=<ISO time>`: returns a ~60-bar window centred on that moment plus
// `signalIndex` (the bar in force then) — used by the scanner signal mini-charts,
// where the interesting bars are around the signal, not the most recent ones.
export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.trim();
  const interval = params.get("interval")?.trim() || "1day";
  const outputsize = Math.min(Number(params.get("outputsize")) || 90, 500);
  const around = params.get("around");
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    if (around) {
      const t = new Date(around).getTime();
      if (isNaN(t)) return NextResponse.json({ error: "Bad 'around' timestamp" }, { status: 400 });
      const stepMin = INTERVAL_MIN[interval] ?? 1440;
      // Fetch just deep enough to reach the timestamp (Yahoo caps 5/15-min at ~58d).
      const ageDays = Math.max(1, Math.ceil((Date.now() - t) / 86_400_000));
      const days = Math.min(stepMin >= 60 ? 365 : 58, ageDays + 3);
      const bars = realBars(await getOhlc(symbol, interval, 20_000, days), stepMin);
      let idx = -1;
      for (let i = 0; i < bars.length; i++) {
        if (new Date(bars[i].datetime).getTime() <= t) idx = i;
        else break;
      }
      if (idx < 0) return NextResponse.json({ candles: [], signalIndex: -1 });
      const start = Math.max(0, idx - 42);
      return NextResponse.json({
        candles: bars.slice(start, Math.min(bars.length, idx + 19)),
        signalIndex: idx - start,
      });
    }

    const candles = await getOhlc(symbol, interval, outputsize);
    return NextResponse.json({ candles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
