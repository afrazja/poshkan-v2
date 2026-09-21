import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { approvedUserId, appOrigin } from "@/lib/neon-preview/config";
import { transaction } from "@/lib/neon-preview/trading";
import { databaseSchema } from "@/lib/neon-app/schema.mjs";

export const MCP_SCOPE = "mcp:tools";
export const MCP_RESOURCE = `${appOrigin()}/api/mcp/mcp`;
export const OAUTH_ISSUER = appOrigin();
export const PROTECTED_RESOURCE_METADATA_URL = `${appOrigin()}/.well-known/oauth-protected-resource/api/mcp/mcp`;

type ClientRegistration = {
  clientName: string;
  redirectUris: string[];
  issuedAt: number;
  expiresAt: number;
};

export type AuthorizationRequest = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state?: string;
  scope: string;
  resource: string;
  codeChallenge: string;
  userId: string;
  expiresAt: number;
};

type AuthorizationCode = Omit<AuthorizationRequest, "clientName" | "state"> & {
  codeId: string;
};

function signingSecret() {
  const source = process.env.MCP_OAUTH_SECRET || process.env.NEON_AUTH_COOKIE_SECRET;
  if (!source || source.length < 32) throw new Error("MCP OAuth signing is not configured");
  return createHmac("sha256", source).update("poshkan-mcp-oauth-v1").digest();
}

function sign(kind: string, body: string) {
  return createHmac("sha256", signingSecret()).update(`${kind}.${body}`).digest("base64url");
}

function encodeSigned(kind: string, value: unknown) {
  const body = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${kind}.${body}.${sign(kind, body)}`;
}

function decodeSigned<T>(value: string, kind: string): T | null {
  const [actualKind, body, signature, extra] = value.split(".");
  if (actualKind !== kind || !body || !signature || extra) return null;
  const expected = Buffer.from(sign(kind, body), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function safeRedirectUri(value: string) {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")
    );
  } catch {
    return false;
  }
}

export function registerClient(input: unknown) {
  const value = input as Record<string, unknown>;
  const redirectUris = Array.isArray(value.redirect_uris)
    ? value.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];
  if (!redirectUris.length || redirectUris.length > 10 || redirectUris.some((uri) => !safeRedirectUri(uri))) {
    throw new Error("invalid_redirect_uri");
  }
  const method = value.token_endpoint_auth_method;
  if (method != null && method !== "none") throw new Error("invalid_client_metadata");
  const grantTypes = Array.isArray(value.grant_types) ? value.grant_types : ["authorization_code"];
  const responseTypes = Array.isArray(value.response_types) ? value.response_types : ["code"];
  if (!grantTypes.includes("authorization_code") || !responseTypes.includes("code")) {
    throw new Error("invalid_client_metadata");
  }
  const now = Math.floor(Date.now() / 1000);
  const registration: ClientRegistration = {
    clientName:
      typeof value.client_name === "string" && value.client_name.trim()
        ? value.client_name.trim().slice(0, 80)
        : "Claude",
    redirectUris: [...new Set(redirectUris)],
    issuedAt: now,
    expiresAt: now + 365 * 24 * 60 * 60,
  };
  return { clientId: encodeSigned("pcid", registration), registration };
}

export function readClient(clientId: string) {
  const client = decodeSigned<ClientRegistration>(clientId, "pcid");
  if (!client || client.expiresAt < Math.floor(Date.now() / 1000)) return null;
  if (!client.redirectUris.length || client.redirectUris.some((uri) => !safeRedirectUri(uri))) return null;
  return client;
}

export function createAuthorizationRequest(value: AuthorizationRequest) {
  return encodeSigned("pareq", value);
}

export function readAuthorizationRequest(value: string) {
  const request = decodeSigned<AuthorizationRequest>(value, "pareq");
  if (!request || request.expiresAt < Math.floor(Date.now() / 1000)) return null;
  const client = readClient(request.clientId);
  if (!client || !client.redirectUris.includes(request.redirectUri)) return null;
  return request;
}

export function createAuthorizationCode(request: AuthorizationRequest) {
  const code: AuthorizationCode = {
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    scope: request.scope,
    resource: request.resource,
    codeChallenge: request.codeChallenge,
    userId: request.userId,
    expiresAt: Math.floor(Date.now() / 1000) + 5 * 60,
    codeId: randomBytes(24).toString("base64url"),
  };
  return encodeSigned("pacode", code);
}

export function readAuthorizationCode(value: string) {
  const code = decodeSigned<AuthorizationCode>(value, "pacode");
  if (!code || code.expiresAt < Math.floor(Date.now() / 1000)) return null;
  return code;
}

export function validCodeVerifier(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = createHash("sha256").update(verifier).digest("base64url");
  const expectedBuffer = Buffer.from(challenge);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function oauthUserId() {
  const id = approvedUserId();
  if (!id) throw new Error("OAuth database identity is not configured");
  return id;
}

export async function storeAuthorizationCode(code: string) {
  const hash = hashToken(code);
  await transaction(oauthUserId(), async (client) => {
    await client.query(
      `DELETE FROM ${databaseSchema()}.api_tokens
        WHERE name='Claude OAuth authorization'
          AND created_at < now() - interval '15 minutes'`,
    );
    await client.query(
      `INSERT INTO ${databaseSchema()}.api_tokens(user_id,name,token_hash)
       VALUES (${databaseSchema()}.actor(),'Claude OAuth authorization',$1)`,
      [hash],
    );
  });
}

export async function exchangeAuthorizationCode(code: string, label: string) {
  const codeHash = hashToken(code);
  const accessToken = `pk_${randomBytes(24).toString("hex")}`;
  const accessHash = hashToken(accessToken);
  const inserted = await transaction(oauthUserId(), async (client) =>
    client.query(
      `WITH consumed AS (
         DELETE FROM ${databaseSchema()}.api_tokens
          WHERE token_hash=$1 AND name='Claude OAuth authorization'
          RETURNING user_id
       )
       INSERT INTO ${databaseSchema()}.api_tokens(user_id,name,token_hash)
       SELECT user_id,$2,$3 FROM consumed
       RETURNING id`,
      [codeHash, label.slice(0, 60), accessHash],
    ),
  );
  if (inserted.rowCount !== 1) return null;
  return accessToken;
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

export function protectedResourceMetadata() {
  return {
    resource: MCP_RESOURCE,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${appOrigin()}/mcp`,
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: OAUTH_ISSUER,
    authorization_endpoint: `${appOrigin()}/oauth/authorize`,
    token_endpoint: `${appOrigin()}/oauth/token`,
    registration_endpoint: `${appOrigin()}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}
