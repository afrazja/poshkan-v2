import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { previewEnabled } from "@/lib/neon-preview/config";

// Next.js 16 "proxy" convention (formerly "middleware"). Runs on every matched
// request to refresh the Supabase session and guard protected routes.
export default async function proxy(request: NextRequest) {
  if (previewEnabled()) {
    const { pathname } = request.nextUrl;
    if (pathname === "/") return NextResponse.redirect(new URL("/neon-preview", request.url));
    if (pathname === "/neon-preview" || pathname.startsWith("/neon-preview/")) {
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
    return new NextResponse("Unavailable in the local migration preview", { status: 404 });
  }
  if (request.nextUrl.pathname.startsWith("/neon-preview")) return new NextResponse(null, { status: 404 });
  if (request.nextUrl.pathname.startsWith("/api/cron/") || request.nextUrl.pathname.startsWith("/api/mcp/")) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Include machine endpoints so preview mode can block them before execution.
    // Normal mode still skips Supabase session refresh for cron and MCP above.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
