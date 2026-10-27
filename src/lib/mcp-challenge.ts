import { appOrigin } from "@/lib/neon-preview/config";

// The MCP bearer-token shape and the 401 challenge, kept free of database
// imports so src/proxy.ts can reject token-less requests before a function
// is invoked. mcp-oauth.ts re-exports these.

export const MCP_SCOPE = "mcp:tools";
export const PROTECTED_RESOURCE_METADATA_URL = `${appOrigin()}/.well-known/oauth-protected-resource/api/mcp/mcp`;

export function mcpBearerToken(headers: Headers): string | null {
  const token = headers.get("authorization")?.match(/^Bearer (pk_\S+)$/i)?.[1];
  return token && token.length <= 512 ? token : null;
}

export function oauthChallenge() {
  return `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}", scope="${MCP_SCOPE}"`;
}

export function unauthorizedMcpResponse() {
  return Response.json(
    { error: "unauthorized", error_description: "Connect with Poshkan OAuth or provide a Poshkan API token." },
    {
      status: 401,
      headers: { "Cache-Control": "no-store", "WWW-Authenticate": oauthChallenge() },
    },
  );
}
