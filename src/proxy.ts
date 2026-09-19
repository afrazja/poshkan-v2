import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { previewEnabled, fullAppEnabled } from "@/lib/neon-preview/config";

// Next.js 16 "proxy" convention (formerly "middleware"). Runs on every matched
// request to refresh the Supabase session and guard protected routes.
export default async function proxy(request: NextRequest) {
  if (previewEnabled()) {
    const { pathname } = request.nextUrl;
    if (fullAppEnabled()) {
      if(pathname==='/auth/reset') return NextResponse.redirect(new URL('/neon-preview/reset'+request.nextUrl.search,request.url));
      if(pathname==='/auth/callback'||pathname==='/auth/confirm') return new NextResponse('Use the email login in this local test',{status:404});
      if (pathname.startsWith('/api/cron/') || pathname.startsWith('/api/mcp/')) {
        if(process.env.POSHKAN_NEON_SERVICES!=='1') return new NextResponse('Local services are disabled',{status:404});
        if(pathname.startsWith('/api/cron/') && (!process.env.CRON_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)) return new NextResponse('Unauthorized',{status:401});
        return NextResponse.next();
      }
      if (pathname.startsWith('/admin') || pathname.startsWith('/s/') || pathname.startsWith('/api/digest/') || pathname === '/api/contact') return new NextResponse('This service is reserved for the next migration stage',{status:404});
      if (pathname === '/') return NextResponse.redirect(new URL('/dashboard',request.url));
      const response=NextResponse.next();
      response.headers.set('Cache-Control','private, no-store');
      response.headers.set('Referrer-Policy','no-referrer');
      return response;
    }
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
