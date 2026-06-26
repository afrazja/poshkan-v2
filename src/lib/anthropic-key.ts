import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto";

// The decrypted Anthropic API key a user has saved, or undefined.
// Works with either the user client (RLS) or the admin client.
export async function getUserAnthropicKey(
  db: SupabaseClient,
  userId: string
): Promise<string | undefined> {
  const { data } = await db
    .from("profiles")
    .select("anthropic_api_key")
    .eq("id", userId)
    .maybeSingle();
  const enc = (data as { anthropic_api_key?: string | null } | null)?.anthropic_api_key;
  if (!enc) return undefined;
  return decryptSecret(enc) ?? undefined;
}
