import "server-only";

// ── Private-feature gating ───────────────────────────────────────────────────
// The SMC scanner is a private tool. Only emails listed in SMC_ALLOWLIST
// (comma-separated, case-insensitive) ever see its UI or have it run for them.
// Empty/unset list = feature is fully off for everyone (privacy by default), so
// new users never see a trace of it and it stays out of the main app.

export function smcAllowlist(): string[] {
  return (process.env.SMC_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSmcAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return smcAllowlist().includes(email.trim().toLowerCase());
}
