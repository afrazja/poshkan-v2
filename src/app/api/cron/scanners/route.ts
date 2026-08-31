import { NextResponse } from "next/server";
import { GET as customScan } from "../custom-scan/route";
import { GET as aiScan } from "../scan-opportunities/route";
import { GET as marketCheck } from "../market-check/route";

export const maxDuration = 60;

// One cron entry that runs every scanner AND the position monitor in a single
// ping. Point the external pinger here (every ~1–5 min):
//   https://www.poshkan.com/api/cron/scanners?key=<CRON_SECRET>
// market-check closes positions on SL/TP, fills pending orders, and fires price
// alerts — so this single cron keeps everything moving. Auth (Bearer or ?key=)
// is enforced by each underlying handler.
export async function GET(request: Request) {
  const [customRes, aiRes, marketRes] = await Promise.all([
    customScan(request),
    aiScan(request),
    marketCheck(request),
  ]);

  // If any handler rejected the credential, surface that.
  if (customRes.status === 401 || aiRes.status === 401 || marketRes.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [custom, ai, market] = await Promise.all([
    customRes.json().catch(() => ({ error: "custom parse" })),
    aiRes.json().catch(() => ({ error: "ai parse" })),
    marketRes.json().catch(() => ({ error: "market parse" })),
  ]);
  return NextResponse.json({ custom, ai, market });
}
