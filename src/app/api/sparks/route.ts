import { NextResponse } from "next/server";
import { getTimeSeries } from "@/lib/marketdata";
import { requireUser } from "../_auth";

// Batched 7-day close series for row sparklines: many symbols, one request.
// getTimeSeries caches per symbol, so repeat loads are cheap; a small
// concurrency pool keeps the first (cold) load polite to the data provider.
export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("symbols") ?? "";
  const symbols = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, 60);
  if (symbols.length === 0) return NextResponse.json({ sparks: {} });

  const sparks: Record<string, number[]> = {};
  let next = 0;
  const worker = async () => {
    while (next < symbols.length) {
      const sym = symbols[next++];
      try {
        const candles = await getTimeSeries(sym, "1day", 8);
        const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v));
        if (closes.length >= 2) sparks[sym] = closes;
      } catch {
        // symbol without history — row just renders without a sparkline
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, symbols.length) }, worker));

  return NextResponse.json({ sparks });
}
