import {
  exchangeAuthorizationCode,
  MCP_RESOURCE,
  readAuthorizationCode,
  readClient,
  validCodeVerifier,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

function error(code: string, description: string, status = 400) {
  return Response.json(
    { error: code, error_description: description },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("invalid_request", "Expected a form-encoded token request.");
  }
  if (form.get("grant_type") !== "authorization_code") {
    return error("unsupported_grant_type", "Only authorization_code is supported.");
  }
  const codeValue = String(form.get("code") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const verifier = String(form.get("code_verifier") ?? "");
  const resource = String(form.get("resource") ?? MCP_RESOURCE);
  const code = readAuthorizationCode(codeValue);
  const client = readClient(clientId);
  if (
    !code ||
    !client ||
    code.clientId !== clientId ||
    code.redirectUri !== redirectUri ||
    !client.redirectUris.includes(redirectUri) ||
    code.resource !== resource ||
    resource !== MCP_RESOURCE ||
    !validCodeVerifier(verifier, code.codeChallenge)
  ) {
    return error("invalid_grant", "The authorization code is invalid, expired, or already used.");
  }
  const accessToken = await exchangeAuthorizationCode(codeValue, `${client.clientName} OAuth`);
  if (!accessToken) return error("invalid_grant", "The authorization code is invalid, expired, or already used.");
  return Response.json(
    { access_token: accessToken, token_type: "Bearer", scope: code.scope },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
