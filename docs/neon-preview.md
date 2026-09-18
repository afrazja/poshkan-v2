# Local Neon migration rehearsal

This branch adds `/neon-preview` for password recovery, sign-in and a read-only
portfolio summary. It is not a replacement for the existing Supabase application.
No production deployment or trading/job cutover is included.

## Configuration

The preview is off unless `POSHKAN_NEON_PREVIEW=1`, and is always off on Vercel.
Use the companion `poshkan-neon-migration/start-neon-preview.ps1` launcher on the
owner's Windows computer. It decrypts the saved DPAPI credential into the child
process environment; it never writes a plaintext `.env` or prints the connection.
`-Build` builds the application, `-Check` runs the read-only database checks, and
no switch starts the built app at `http://localhost:3025` bound to loopback.

Server-only variables:

- `NEON_AUTH_BASE_URL`: the project's Managed Better Auth URL.
- `NEON_AUTH_COOKIE_SECRET`: random per-launch signing secret, at least 32 characters.
- `NEON_PREVIEW_DATABASE_URL`: database connection with certificate verification.
- `NEON_PREVIEW_USER_ID`: the explicitly approved Neon identity for this local test.

The local app allows only preview pages. Other app routes, including cron and MCP,
return 404. Analytics is disabled. No service-role Supabase key is required.

## Identity and access

The official `@neondatabase/auth/next/server` SDK performs sign-in, password-reset
requests and token-based password resets. Server Actions use Next.js origin checks.
Recovery links return to `/neon-preview/reset` on localhost:3025. Open them on the
same computer while the preview runs. No admin role is needed. Email delivery and
the owner's successful sign-in still require the user's interactive verification.

The data layer obtains the Neon session server-side, requires the configured
preview user ID, then joins `poshkan_stage.auth_links` by that UUID. Email addresses
and browser-supplied account IDs are never used to authorize portfolio queries.
It rejects banned identities and scopes every portfolio statistic through owned
accounts. PostgreSQL numeric values remain strings until display formatting.

This separate local, read-only allowlist does not enable full application access:
`auth_links.application_access_enabled` remains false. All SQL uses read-only
transactions and parameterized values. The current preview uses the encrypted
owner credential; deployment requires a dedicated restricted database role and
the complete RLS/RPC migration. Do not deploy this rehearsal as production.

The snapshot is from September 18, 2026. A fresh snapshot and reconciliation will
be required at cutover because Supabase remains live.

## Checks

- `npx tsc --noEmit`
- `npx eslint src/app/neon-preview src/lib/neon-preview src/proxy.ts src/app/layout.tsx`
- `npm run build` with preview configuration
- `node scripts/check-neon-preview.mjs` with the launcher's environment: read-only
  connection, exact owner-account set, unknown/missing identity rejection, disabled
  application-access flag. This deliberately does not simulate a real login.
- Browser checks: password form and sign-in navigation; unauthenticated portfolio
  redirect; missing reset token; cron, MCP and normal dashboard blocked.

Official API references reviewed September 18, 2026:

- https://neon.com/docs/auth/quick-start/nextjs-api-only
- https://neon.com/docs/auth/reference/nextjs-server
- https://neon.com/docs/auth/guides/password-reset

The installed SDK exposes Better Auth `requestPasswordReset` and `resetPassword`.
These are distinct from the unsupported Supabase-adapter `resetPasswordForEmail`.
