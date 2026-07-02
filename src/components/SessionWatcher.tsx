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
      // A healthy refresh means any earlier recovery attempt succeeded.
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        try {
          sessionStorage.removeItem("poshkan-session-retry");
        } catch {}
        return;
      }
      if (event !== "SIGNED_OUT") return;
      let intentional = false;
      try {
        intentional = sessionStorage.getItem("poshkan-signing-out") === "1";
        sessionStorage.removeItem("poshkan-signing-out");
      } catch {}
      if (intentional) return; // TopBar handles its own navigation

      // SIGNED_OUT often means this tab lost a refresh-token race (another
      // tab or the middleware rotated the token first) while the shared
      // cookies still hold a valid session. One reload re-hydrates from
      // cookies and recovers invisibly; if the session is truly gone, the
      // middleware bounces the reload to login, or we fall through here a
      // second time and show the "expired" notice.
      try {
        if (sessionStorage.getItem("poshkan-session-retry") !== "1") {
          sessionStorage.setItem("poshkan-session-retry", "1");
          window.location.reload();
          return;
        }
        sessionStorage.removeItem("poshkan-session-retry");
      } catch {}
      router.replace("/?expired=1");
      router.refresh();
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
