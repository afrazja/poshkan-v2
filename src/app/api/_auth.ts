import { createClient } from "@/lib/supabase/server";

// Returns the logged-in user or null. Used to gate the market-data proxy routes
// so they can't be abused by anonymous traffic.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
