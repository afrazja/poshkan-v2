import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appUser } from "@/lib/neon-app/server";
import {
  createAuthorizationCode,
  OAUTH_ISSUER,
  readAuthorizationRequest,
  storeAuthorizationCode,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

const CSRF_COOKIE = "poshkan_mcp_oauth_csrf";
const REQUEST_COOKIE = "poshkan_mcp_oauth_request";
const COOKIE_PATH = "/oauth/authorize";

function invalid(message: string, status = 400) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function sameValue(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function oauthRedirect(redirectUri: string, values: Record<string, string | undefined>) {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) if (value) target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

function clearConsentCookies(response: NextResponse, secure: boolean) {
  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: COOKIE_PATH, maxAge: 0 };
  response.cookies.set(CSRF_COOKIE, "", options);
  response.cookies.set(REQUEST_COOKIE, "", options);
}

export async function GET(request: NextRequest) {
  const decision = request.nextUrl.searchParams.get("decision");
  const csrf = request.nextUrl.searchParams.get("csrf") ?? "";
  const cookieCsrf = request.cookies.get(CSRF_COOKIE)?.value ?? "";
  const requestToken = request.cookies.get(REQUEST_COOKIE)?.value ?? "";
  const authorization = readAuthorizationRequest(requestToken);
  if (!authorization || !csrf || !cookieCsrf || !sameValue(csrf, cookieCsrf)) {
    return invalid("This authorization request is invalid or expired.");
  }
  const user = await appUser();
  if (!user || user.id !== authorization.userId) return invalid("Sign in again to continue.", 401);

  if (decision !== "allow") {
    const response = oauthRedirect(authorization.redirectUri, {
      error: "access_denied",
      state: authorization.state,
      iss: OAUTH_ISSUER,
    });
    clearConsentCookies(response, request.nextUrl.protocol === "https:");
    return response;
  }

  const code = createAuthorizationCode(authorization);
  await storeAuthorizationCode(code);
  const response = oauthRedirect(authorization.redirectUri, {
    code,
    state: authorization.state,
    iss: OAUTH_ISSUER,
  });
  clearConsentCookies(response, request.nextUrl.protocol === "https:");
  return response;
}
