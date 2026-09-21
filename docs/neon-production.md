# Neon production release

The full app can now run against a separate production schema with `POSHKAN_DATABASE_MODE=neon`. The local rehearsal flag does not activate on Vercel and cannot select test tables when production mode is enabled. Supabase remains the default when the production flag is absent, allowing the previous deployment to remain a rollback option before accepting new Neon writes.

## Configuration

Set `NEXT_PUBLIC_POSHKAN_NEON=1`, `NEXT_PUBLIC_POSHKAN_DATABASE_MODE=neon`, `POSHKAN_NEON_SERVICES=1`, `NEON_USER_ID`, `NEON_AUTH_BASE_URL`, a stable `NEON_AUTH_COOKIE_SECRET`, and `NEON_DATABASE_URL` using the restricted `poshkan_live_runtime` login. Keep the existing `CRON_SECRET` and notification provider settings. Never deploy with the Neon owner credential.

`poshkan_live` contains production application data. `poshkan_live_stage` retains the checked source snapshot. Neither replaces `poshkan_stage` or `poshkan_trade_test`. The runtime has no access to those snapshots or rehearsal tables. Runtime SQL switches between fixed schema identifiers; user values stay parameterized. Each transaction selects the appropriate restricted role and verifies the mapped identity through database policies/functions.

Only the existing owner is enabled in Neon Auth. All 51 legacy identities and their application data are retained; this release does not migrate their login passwords or enable new signups. The owner-scoped MCP endpoint is enabled in production with hashed personal bearer tokens and restricted Neon roles. Optional scanner endpoints remain disabled, automatic AI entries are disabled, and snapshots no longer invoke scanners. No Anthropic key is required.

Password resets return to `https://www.poshkan.com/auth/reset`, matching Vercel's existing canonical-domain redirect. Neon must trust both `https://poshkan.com` and `https://www.poshkan.com` before promotion.

## Background orders

The existing GitHub `market-check-cron.yml` calls the canonical market-check endpoint with the existing cron secret. GitHub's schedule is not a timing guarantee: recent observed successful runs on September 19 were hours apart despite a five-minute schedule. Vercel also retains its daily market check and snapshot jobs. Do not describe these as guaranteed five-minute executions.

The market-check handler records server contact in `worker_control`. An enabled job can execute even if its preceding heartbeat is old; the UI marks contact older than ten minutes offline, and Start requires recent contact. Stop locks against active fills. The production copy begins paused. Page-initiated checks and manual trading remain separate from the background pause setting. The old local worker cannot reach production tables.

## Verification and cutover

The fresh September 19 snapshot contains 33 application tables, 63,545 rows, and 51 legacy users. The import generator rewrites schema definitions, never COPY data. Private snapshots, credentials, and generated import files stay outside this repository.

The core PostgreSQL fixture tests pass, including an isolated production install, role-denial checks, production query adapter, atomic trade retry, pause/resume, and rollback. Read-only checks on Neon confirm source equality for portfolios, positions, ledger, orders, profiles, snapshots, watchlists, alerts, notifications, email preferences, and push subscriptions. The runtime sees four owned portfolios and cannot access the test schema. The production-mode build, TypeScript and targeted lint checks pass; the local browser shows four portfolios, prices, and settings without API controls.

Before promotion: verify trusted login domains and the staged deployment, stop source-side writes/background jobs for the final comparison or refresh, then promote and verify login/data through the public domain. Keep Supabase available until these pass. A rollback after accepting Neon writes requires reconciling those writes; do not simply point back to stale Supabase data. Do not pause/delete Supabase while the migration remains staged.

## Hosted verification, September 19

Commit `4d2f6c7` is staged as deployment `dpl_w6ABNwWj55mDXSN67b3GdnH82zDq` at `https://poshkan-v2-nhr9tqivc-afzjavan-7827s-projects.vercel.app`. Its Vercel build is READY. The protected, cron-authenticated `market-check?status=1` probe returns HTTP 200, database Neon, four portfolios, and background execution disabled. This probe never trades or sends notifications. Vercel preview access uses the existing account's CLI-generated protection bypass; deployment protection remains on.

The public `www.poshkan.com` alias was verified to remain on `dpl_F7YpSomMNALC9JQVa3UcVTExEbaz`, the original Supabase deployment. Production environment variables are prepared for the staged release; existing deployment variables and notification/cron credentials are preserved. Do not push main before the cutover is ready, because automatic production deployments would use the new settings.

Neon Auth now trusts `https://poshkan.com` and `https://www.poshkan.com`, added and visibly verified with the owner's approval. The pre-existing trade subdomain and other authentication settings are unchanged.

The final source comparison on September 19 passed for all 29 non-cache application tables. Three revoked API tokens were removed from the destination to match current source state; the immutable snapshot retains the original backup. The unused, empty `trade_watch_state` table was also preserved in the live schema with RLS enabled and no application grants. No portfolio, balance, trade, order, profile, notification, or preference differed. The four shared market cache tables are rebuilt by the app. Optional Forex opportunity and Crypto cloud monitor GitHub schedules are disabled; the core market-check schedule remains active.

The owner explicitly approved the source write block, which was applied after another passing 29-table comparison. All 33 old Supabase application tables now reject writes through reversible triggers; all records remain intact. Supabase has not been paused or deleted. The local production preview was stopped before the final check.

The verified deployment was promoted successfully to the existing public domains. The canonical `www.poshkan.com` readiness probe returns Neon and four portfolios. Unsigned cron requests return 401; the excluded scanner endpoint returns 404. The owner signed in successfully through the public domain, and browser verification shows all four portfolios with current prices. Core background execution was enabled and an actual cloud check completed successfully; the dashboard shows it running and connected.

The private migration helper has an `unfreeze` mode for the old source, but it must not be used as a blind rollback now that Neon accepts writes. Reconcile any new Neon changes before restoring Supabase as the live database. Keep the preserved source until the migration is accepted; pausing/deleting the Supabase project is a separate action.

The real GitHub market-check workflow was dispatched after promotion and succeeded: run `35463942130`. The 22 isolated core/production database checks passed again after adding the final legacy table preservation; these checks never modify the live database.
