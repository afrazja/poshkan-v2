import "server-only";
import { previewEnabled } from '../neon-preview/config';
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for cron jobs. Bypasses RLS — NEVER import from client code.
export function createAdminClient() {
  if (previewEnabled()) throw new Error('Production services are unavailable in the local Neon test');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
