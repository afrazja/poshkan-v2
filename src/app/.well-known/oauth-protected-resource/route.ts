import { protectedResourceMetadata } from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  });
}
