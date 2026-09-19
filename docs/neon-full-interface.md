# Full Poshkan interface on the Neon rehearsal database

The local launcher now serves the original `/dashboard`, account pages, history,
leaderboard, charts, watchlists and settings through Neon. `/signup?tab=login`
uses the owner's existing Neon email/password account. The compact
`/neon-preview` pages remain available for diagnostics. Nothing is deployed.

## Isolation and access

`POSHKAN_NEON_PREVIEW=1`, `POSHKAN_NEON_FULL_APP=1` and the browser build flag
`NEXT_PUBLIC_POSHKAN_NEON=1` select this local configuration. Vercel disables the
preview. Do not deploy this local build. The original Supabase mode is retained
for production until a later cutover.

The server maps the verified, approved Neon identity to the original account ID.
Existing server-side query builders use an internal SQL adapter; there is no
browser-facing SQL endpoint. Identifiers are validated, values parameterized,
and each transaction assumes the restricted `poshkan_trade_preview` role with
transaction-local identity. PostgreSQL policies enforce ownership and bans.
Authentication is cached only within a render request; execution-price requests
recheck authentication before committing trades.

The extra interface tables are copied once from `poshkan_stage` to
`poshkan_trade_test`. The original snapshot and existing rehearsal trades are
preserved. Direct balance, position, ledger and order-status writes are denied.
Manual trades and automatic checks use the previously verified atomic engine.
The original order forms retain request IDs across retries. Account creation,
cash changes, reset and deletion use locked server functions. Alerts and
notifications belong to the user and survive deletion of an individual account.

Order edits are owner-scoped and locked against filling. Entry expiry supports
minutes as well as the preview's 24-hour choice. DAY stock orders retain the
original New York calendar-day expiry rule. Timed exits are saved atomically
with opening a position.

The browser performs authentication only. Theme changes use a server action;
Neon password changes require the current password and at least eight characters.
This rehearsal admits only the already mapped owner. Signup, social login, other
users' identity migration and production recovery redirects remain cutover work.

## Installation and checks

The adjacent `poshkan-neon-migration/install-full-app.ps1` script uses the existing
Windows-encrypted credential. First installation adds the interface tables;
`-UpdateOnly` updates functions without copying data again. It combines the SQL
into one transaction. Reapplying `trading-engine.sql` revokes function grants,
so always follow it with orders, worker and app engines as the installer does.

`scripts/check-neon-trading.mjs` uses a disposable local PostgreSQL instance and
the original private snapshot. It includes the trading, order and worker suite,
plus `check-neon-app.mjs` for real query-builder behavior, ownership, profiles,
watchlists, dates/numbers, pagination/counts, joined exits, denied raw mutations,
SQL injection, edited/expiring entries, timers, reset and deletion.

The launcher `-CheckApp` performs the interface smoke check against Neon and
rolls back all test writes. Full Next.js build and TypeScript validation passed.
New adapter/auth code passed targeted lint. The existing ThemeToggle hydration
effect still triggers the pre-existing `set-state-in-effect` lint rule.
The login page passed mobile layout/error checks and unsigned dashboard requests
redirected to login. After an initially rejected attempt, the owner signed in
successfully. A fresh browser reload after restarting the app retained the real
session and displayed all four portfolios, refreshed quotes, and the connected
worker with execution stopped. Broader authenticated feature review remains.
The initial error was not recorded; its exact cause is unknown. Login errors now
distinguish rejected credentials, rate limits, origin configuration, and service
failures, with only allowlisted codes and HTTP status logged. Error classification
and privacy checks, targeted lint, TypeScript, and the full build passed.
No owner password was read or changed, and no session was fabricated.

## Remaining migration scope

Scheduled scanners, shared market-data caches, email/push delivery, MCP and cloud
worker hosting remain step 2 and production preparation work. Their production
service client fails closed locally. The dashboard can read imported settings,
signals and notifications, but this does not mean their background services have
been migrated. The local order worker can run while this computer stays awake.

Keep the existing `ENCRYPTION_KEY` when moving saved encrypted user API keys.
Configure authentication for `https://poshkan.com`, refresh the source data and
verify the entire live site before pausing Supabase. A copied database and a
working local dashboard do not constitute a completed production migration.
