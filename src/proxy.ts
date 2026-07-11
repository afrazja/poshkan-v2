import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (formerly "middleware"). Runs on every matched
// request to refresh the Supabase session and guard protected routes.
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all paths except static assets, image optimization files, and
    // self-authenticated machine endpoints (cron + MCP use their own tokens —
    // refreshing a browser session there is pure wasted CPU at high volume).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|api/cron/|api/mcp/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
