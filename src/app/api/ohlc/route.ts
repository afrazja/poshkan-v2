import { NextResponse } from "next/server";
import { getOhlc } from "@/lib/marketdata";
import { requireUser } from "../_auth";

// OHLC candles for candlestick charts (mirrors /api/timeseries, but keeps O/H/L/C).
export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.trim();
  const interval = params.get("interval")?.trim() || "1day";
  const outputsize = Math.min(Number(params.get("outputsize")) || 90, 500);
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    const candles = await getOhlc(symbol, interval, outputsize);
    return NextResponse.json({ candles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
