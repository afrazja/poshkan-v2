import { NextResponse } from "next/server";
import { GET as smcScan } from "../smc-scan/route";
import { GET as oteScan } from "../ote-scan/route";
import { GET as trendScan } from "../trend-scan/route";
import { GET as meanrevScan } from "../meanrev-scan/route";
import { GET as candlerangeScan } from "../candlerange-scan/route";
import { GET as aiScan } from "../scan-opportunities/route";

export const maxDuration = 60;

// One cron entry that runs ALL scanners in a single ping. Point the external
// pinger here (every ~5 min) instead of hitting each route separately:
//   https://www.poshkan.com/api/cron/scanners?key=<CRON_SECRET>
// Auth (Bearer or ?key=) is enforced by each underlying handler.
export async function GET(request: Request) {
  const [smcRes, oteRes, trendRes, meanrevRes, candlerangeRes, aiRes] = await Promise.all([
    smcScan(request),
    oteScan(request),
    trendScan(request),
    meanrevScan(request),
    candlerangeScan(request),
    aiScan(request),
  ]);

  // If any handler rejected the credential, surface that.
  if (
    smcRes.status === 401 ||
    oteRes.status === 401 ||
    trendRes.status === 401 ||
    meanrevRes.status === 401 ||
    candlerangeRes.status === 401 ||
    aiRes.status === 401
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [smc, ote, trend, meanrev, candlerange, ai] = await Promise.all([
    smcRes.json().catch(() => ({ error: "smc parse" })),
    oteRes.json().catch(() => ({ error: "ote parse" })),
    trendRes.json().catch(() => ({ error: "trend parse" })),
    meanrevRes.json().catch(() => ({ error: "meanrev parse" })),
    candlerangeRes.json().catch(() => ({ error: "candlerange parse" })),
    aiRes.json().catch(() => ({ error: "ai parse" })),
  ]);
  return NextResponse.json({ smc, ote, trend, meanrev, candlerange, ai });
}
