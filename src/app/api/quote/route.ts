import { NextResponse } from "next/server";
import { getQuote } from "@/lib/twelvedata";
import { requireUser } from "../_auth";

export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    const quote = await getQuote(symbol);
    return NextResponse.json({ quote });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
