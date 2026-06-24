import { NextResponse } from "next/server";
import { requireUser } from "../../_auth";
import { explainPosition, type PositionContext } from "@/lib/forex-scan";

export const maxDuration = 60;

// On-demand AI explanation of a single forex position (the strategy + outlook).
export async function POST(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Partial<PositionContext>;
    if (!body?.pair || !body?.direction || !body?.entry) {
      return NextResponse.json({ error: "Missing position fields" }, { status: 400 });
    }
    const text = await explainPosition({
      pair: body.pair,
      direction: body.direction,
      units: Number(body.units) || 0,
      entry: Number(body.entry),
      stopLoss: body.stopLoss ?? null,
      takeProfit: body.takeProfit ?? null,
      status: body.status ?? "open",
      closeRate: body.closeRate ?? null,
    });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
