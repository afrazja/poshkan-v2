import { NextResponse } from "next/server";
import { requireUser } from "../_auth";
import { getSymbolReport } from "@/lib/symbol-report";

// The Owner's View, as data. Gated so it cannot be scraped in bulk; the same
// report is rendered publicly, one symbol at a time, at /symbol/[symbol].
export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

  return NextResponse.json(await getSymbolReport(symbol));
}
