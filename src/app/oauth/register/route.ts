import { registerClient } from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  try {
    const { clientId, registration } = registerClient(body);
    return Response.json(
      {
        client_id: clientId,
        client_id_issued_at: registration.issuedAt,
        client_name: registration.clientName,
        redirect_uris: registration.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_client_metadata";
    return Response.json({ error: code }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
