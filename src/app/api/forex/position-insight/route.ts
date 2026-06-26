import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAnthropicKey } from "@/lib/anthropic-key";
import { explainPosition, type PositionContext } from "@/lib/forex-scan";

export const maxDuration = 60;

// On-demand AI explanation of a single forex position (the strategy + outlook).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Partial<PositionContext>;
    if (!body?.pair || !body?.direction || !body?.entry) {
      return NextResponse.json({ error: "Missing position fields" }, { status: 400 });
    }
    const apiKey = await getUserAnthropicKey(supabase, user.id);
    const text = await explainPosition(
      {
        pair: body.pair,
        direction: body.direction,
        units: Number(body.units) || 0,
        entry: Number(body.entry),
        stopLoss: body.stopLoss ?? null,
        takeProfit: body.takeProfit ?? null,
        status: body.status ?? "open",
        closeRate: body.closeRate ?? null,
      },
      apiKey
    );
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
