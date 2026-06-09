import { NextResponse } from "next/server";
import { getQuotes } from "@/lib/marketdata";
import { requireUser } from "../_auth";

export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("symbols")?.trim();
  if (!raw) return NextResponse.json({ quotes: {} });

  const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const quotes = await getQuotes(symbols);
    return NextResponse.json({ quotes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
