import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordLogin } from "@/lib/login-stats";

// Completes the PKCE OAuth flow and stores the Supabase session in cookies.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      await recordLogin(data?.user?.id);
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
  }

  const errorUrl = new URL("/", request.nextUrl.origin);
  errorUrl.searchParams.set("error", "oauth");
  return NextResponse.redirect(errorUrl);
}
