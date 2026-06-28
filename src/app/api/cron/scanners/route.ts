import { NextResponse } from "next/server";
import { GET as smcScan } from "../smc-scan/route";
import { GET as oteScan } from "../ote-scan/route";
import { GET as aiScan } from "../scan-opportunities/route";

export const maxDuration = 60;

// One cron entry that runs ALL scanners in a single ping. Point the external
// pinger here (every ~5 min) instead of hitting each route separately:
//   https://www.poshkan.com/api/cron/scanners?key=<CRON_SECRET>
// Auth (Bearer or ?key=) is enforced by each underlying handler.
export async function GET(request: Request) {
  const [smcRes, oteRes, aiRes] = await Promise.all([smcScan(request), oteScan(request), aiScan(request)]);

  // If any handler rejected the credential, surface that.
  if (smcRes.status === 401 || oteRes.status === 401 || aiRes.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [smc, ote, ai] = await Promise.all([
    smcRes.json().catch(() => ({ error: "smc parse" })),
    oteRes.json().catch(() => ({ error: "ote parse" })),
    aiRes.json().catch(() => ({ error: "ai parse" })),
  ]);
  return NextResponse.json({ smc, ote, ai });
}
