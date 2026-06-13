"use client";

import { useEffect } from "react";

// Supabase's default password-recovery email redirects to the Site URL (the
// site root) with the recovery session in the URL hash. Without this, the user
// just sees the login page. Detect that case and forward to the dedicated
// reset page (carrying the hash/query) so they can actually set a new password.
export default function RecoveryRedirect() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/auth/reset")) return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const isRecovery =
      hash.get("type") === "recovery" ||
      query.get("type") === "recovery" ||
      (query.has("code") && query.get("type") === "recovery");
    if (isRecovery) {
      window.location.replace(
        `/auth/reset${window.location.search}${window.location.hash}`
      );
    }
  }, []);
  return null;
}
