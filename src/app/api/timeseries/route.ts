import { NextResponse } from "next/server";
import { getTimeSeries } from "@/lib/twelvedata";
import { requireUser } from "../_auth";

export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.trim();
  const interval = params.get("interval")?.trim() || "1day";
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    const candles = await getTimeSeries(symbol, interval);
    return NextResponse.json({ candles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
