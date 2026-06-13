"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// When the auth session ends while the user is in the app (token expiry, a
// revoked session, etc.), send them to login with a friendly notice instead of
// a silent failure or bare redirect. Intentional sign-out is flagged by TopBar
// so we don't show the "expired" message in that case.
export default function SessionWatcher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      let intentional = false;
      try {
        intentional = sessionStorage.getItem("poshkan-signing-out") === "1";
        sessionStorage.removeItem("poshkan-signing-out");
      } catch {}
      if (intentional) return; // TopBar handles its own navigation
      router.replace("/?expired=1");
      router.refresh();
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
