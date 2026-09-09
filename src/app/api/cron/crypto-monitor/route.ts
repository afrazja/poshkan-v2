import { NextResponse } from "next/server";
import { z } from "zod";
import { runCryptoMonitor } from "@/lib/crypto-monitor";

export const maxDuration = 60;
const input = z.object({ account_id: z.string().uuid(), mode: z.enum(["status", "preview", "run"]).default("status") }).strict();

// POST only and header authentication: credentials never appear in URLs.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid monitor request" }, { status: 400 });
  try {
    const result = await runCryptoMonitor(parsed.data.account_id, parsed.data.mode);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "failed", error: "Cloud monitor could not complete; inspect server logs and account state before retrying" }, { status: 500 });
  }
}
