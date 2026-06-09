import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/marketdata";
import { requireUser } from "../_auth";

export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  try {
    const results = await searchSymbols(q);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
