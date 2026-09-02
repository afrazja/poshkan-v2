import { NextResponse } from "next/server";
import { requireUser } from "../_auth";
import { getFundamentals } from "@/lib/fundamentals";
import { getPriceContext } from "@/lib/price-context";

// The Owner's View, as data: what the holder owns and where its price sits in
// its own history. Gated like the other market-data proxies so it cannot be
// scraped anonymously.
export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });

  const [fundamentals, priceContext] = await Promise.all([
    getFundamentals(symbol),
    getPriceContext(symbol).catch(() => null),
  ]);
  return NextResponse.json({ fundamentals, priceContext });
}
