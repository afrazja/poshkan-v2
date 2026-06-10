import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/marketdata";
import { requireUser } from "../_auth";

export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const type = params.get("type")?.trim(); // 'stocks' | 'crypto' — filters by asset class
  if (!q) return NextResponse.json({ results: [] });

  try {
    let results = await searchSymbols(q);
    if (type === "crypto") {
      results = results.filter((r) => r.instrumentType === "CRYPTOCURRENCY");
    } else if (type === "stocks") {
      results = results.filter((r) => r.instrumentType !== "CRYPTOCURRENCY");
    }
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
