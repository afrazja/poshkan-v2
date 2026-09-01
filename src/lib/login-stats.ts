import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Record a completed sign-in for the admin dashboard's per-user login count.
 *
 * Called from the server the moment a session is established, with the service
 * role — a browser can never call record_login itself, so the number cannot be
 * inflated by the user it describes.
 *
 * Best-effort by design: a failure here must never block someone from logging
 * in, and the app still works if login-stats.sql has not been run yet.
 */
export async function recordLogin(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    const admin = createAdminClient();
    await admin.rpc("record_login", { p_user_id: userId });
  } catch {
    // migration not run, or the counter update failed — never fail a login
  }
}
