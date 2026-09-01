import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordLogin } from "@/lib/login-stats";
import { safeNext } from "@/lib/safe-next";

// Supabase redirects the email-confirmation link here with token_hash + type.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Validated: `${origin}${next}` with next="@evil.com" would resolve to
  // https://poshkan.com@evil.com — userinfo, not a path — and walk the user
  // straight off the site.
  const next = safeNext(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      await recordLogin(data?.user?.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=confirm`);
}
