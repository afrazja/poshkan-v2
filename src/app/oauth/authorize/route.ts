import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appUser } from "@/lib/neon-app/server";
import {
  createAuthorizationCode,
  createAuthorizationRequest,
  MCP_RESOURCE,
  MCP_SCOPE,
  OAUTH_ISSUER,
  readAuthorizationRequest,
  readClient,
  storeAuthorizationCode,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

const CSRF_COOKIE = "poshkan_mcp_oauth_csrf";

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function oauthRedirect(redirectUri: string, values: Record<string, string | undefined>) {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) if (value) target.searchParams.set(key, value);
  return NextResponse.redirect(target);
}

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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const responseType = params.get("response_type");
  const codeChallenge = params.get("code_challenge") ?? "";
  const challengeMethod = params.get("code_challenge_method");
  const state = params.get("state") ?? undefined;
  const scope = params.get("scope") || MCP_SCOPE;
  const resource = params.get("resource") || MCP_RESOURCE;
  const client = readClient(clientId);

  if (!client || !client.redirectUris.includes(redirectUri)) return invalid("Invalid OAuth client or redirect URI.");
  if (responseType !== "code") {
    return oauthRedirect(redirectUri, { error: "unsupported_response_type", state });
  }
  if (challengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    return oauthRedirect(redirectUri, { error: "invalid_request", state });
  }
  if (scope !== MCP_SCOPE || resource !== MCP_RESOURCE) {
    return oauthRedirect(redirectUri, { error: "invalid_scope", state });
  }

  const user = await appUser();
  if (!user) {
    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(`/signup?tab=login&next=${encodeURIComponent(returnTo)}`, request.url));
  }

  const csrf = randomBytes(24).toString("base64url");
  const authorizationRequest = createAuthorizationRequest({
    clientId,
    clientName: client.clientName,
    redirectUri,
    state,
    scope,
    resource,
    codeChallenge,
    userId: user.id,
    expiresAt: Math.floor(Date.now() / 1000) + 10 * 60,
  });
  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect Claude to Poshkan</title>
<style>body{margin:0;background:#161826;color:#e9e9ed;font:16px system-ui,-apple-system,sans-serif}.card{max-width:520px;margin:10vh auto;padding:32px;border:1px solid #393b4d;border-radius:16px;background:#202231;box-shadow:0 18px 55px #0006}.brand{display:flex;align-items:center;gap:10px;font-weight:700}.dot{width:28px;height:28px;border-radius:8px;background:#9184d9}h1{font-size:26px;margin:28px 0 12px}p{color:#c9cad3;line-height:1.55}.notice{padding:14px;border-radius:10px;background:#9184d91a;border:1px solid #9184d944}.actions{display:flex;gap:12px;margin-top:26px}button{border:0;border-radius:9px;padding:11px 17px;font-weight:700;cursor:pointer}.allow{background:#9184d9;color:#171827}.deny{background:#333546;color:#e9e9ed}</style></head>
<body><main class="card"><div class="brand"><span class="dot"></span>Poshkan</div>
<h1>Connect ${htmlEscape(client.clientName)}?</h1>
<p>This gives Claude access to your Poshkan paper-trading accounts through MCP.</p>
<div class="notice"><strong>Claude will be able to:</strong><p>Read your virtual portfolio and place, change, or close virtual trades when you ask it to. No real money or brokerage account is involved.</p></div>
<form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="${htmlEscape(authorizationRequest)}"><input type="hidden" name="csrf" value="${csrf}"><div class="actions"><button class="allow" name="decision" value="allow">Allow access</button><button class="deny" name="decision" value="deny">Cancel</button></div></form>
</main></body></html>`;
  const response = new NextResponse(page, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://www.poshkan.com; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
  response.cookies.set(CSRF_COOKIE, csrf, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/oauth/authorize",
    maxAge: 10 * 60,
  });
  return response;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const requestToken = String(form.get("request") ?? "");
  const csrf = String(form.get("csrf") ?? "");
  const cookieCsrf = request.cookies.get(CSRF_COOKIE)?.value ?? "";
  const authorization = readAuthorizationRequest(requestToken);
  if (!authorization || !csrf || !cookieCsrf || !sameValue(csrf, cookieCsrf)) {
    return invalid("This authorization request is invalid or expired.");
  }
  const user = await appUser();
  if (!user || user.id !== authorization.userId) return invalid("Sign in again to continue.", 401);
  if (form.get("decision") !== "allow") {
    return oauthRedirect(authorization.redirectUri, {
      error: "access_denied",
      state: authorization.state,
      iss: OAUTH_ISSUER,
    });
  }
  const code = createAuthorizationCode(authorization);
  await storeAuthorizationCode(code);
  const response = oauthRedirect(authorization.redirectUri, {
    code,
    state: authorization.state,
    iss: OAUTH_ISSUER,
  });
  response.cookies.delete(CSRF_COOKIE);
  return response;
}
