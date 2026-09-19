import { createBrowserClient } from "@supabase/ssr";
import { neonBrowser } from '../neon-app/browser';

// Browser-side Supabase client (uses the public anon key).
export function createClient() {
  if (process.env.NEXT_PUBLIC_POSHKAN_NEON === '1') return neonBrowser();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
