# Neon service rehearsal (step 2)

This is local migration work for https://poshkan.com. It does not switch the live
site, deploy a worker, or pause Supabase. The original `poshkan_stage` snapshot is
unchanged. Private service writes target `poshkan_trade_test` and only the mapped
owner is admitted. This is not a completed production migration.

## Working locally

- Shared quote/candle caches and public technical scans use Neon cache tables.
- Market checks, custom strategy scans, daily snapshots and weekly digests use
  owner-scoped Neon queries. Market alerts compare the current quote with the
  threshold; they do not replay an intraday high/low crossing.
- Email and push requests are saved in `delivery_captures`. In-app notifications
  are also saved. No email or push provider is contacted in this configuration.
- MCP uses the real HTTP protocol at `/api/mcp/mcp`, with a bearer API token.
  Each database transaction checks the token hash, ownership, mapping and bans.
  Revocation blocks the next call. Private tokens are not accepted in URLs.
- MCP reads accounts, history and prices; paper-trade tools use the existing
  atomic trading/order engines. Mutations require a UUID `request_id`, reused for
  retries of the same request. Different parameters need a new UUID. Forex tools
  require explicit leverage. Guarded crypto defaults to dry-run.
- The crypto guard preserves leverage, stop-risk, margin, reward/risk, exposure
  and deadline limits. Durable receipts prevent duplicate entries on retries.

The service role cannot write cash, holdings, ledger or raw order status. The
cache role has no access to private accounts. Transactions set restricted roles
and transaction-local identity; the old unrestricted Supabase service client
still fails closed locally for endpoints that have not been migrated.

## Installation and execution

The adjacent migration directory contains `install-neon-services.ps1`, using the
existing Windows-encrypted Neon credential. It applies these files in one
transaction: `services-engine.sql`, `service-guards.sql`, `mcp-guard.sql`, and
`services-schedule.sql`. `install-full-app.ps1` now includes these files after the
core engines, so their grants are restored after a core engine update.

`start-neon-preview.ps1` enables `POSHKAN_NEON_SERVICES=1`, creates/reuses a locally
encrypted cron secret, and keeps `AUTO_TRADE_ENABLED=false`. The local application
must remain running on port 3025. `start-service-checks.ps1 -Once` runs one pass;
without `-Once` it starts a hidden Node process that checks every minute. This is
not a Windows startup task. It uses a fixed loopback address and a secret header,
never a token in a URL. Only job statuses are logged.

Database leases prevent overlapping runs. Market checks run every minute,
custom and AI scans every five minutes, snapshots daily, and digests on Monday.
The AI job currently records `blocked`. A failure returns an unsuccessful HTTP
status and is eligible for retry after five minutes. Order execution remains
controlled by the separate background worker's Start/Stop setting; it was left
stopped after verification.

## Verification

`scripts/check-neon-trading.mjs` includes `check-neon-services.mjs` in a disposable
local PostgreSQL cluster. Checks cover restricted roles, owner isolation, cache
JSON, recipient-scoped capture, job leases, API token revocation, crypto limits,
durable retry receipts and banned owners, alongside the full existing trade,
pending-order, concurrency, worker and interface regression suite.

`start-neon-preview.ps1 -CheckServices` runs `check-neon-services-live.mjs` against
the local app and Neon. It initializes the real MCP client, checks account scope,
places/retries/cancels a pending paper order without changing cash, revokes its
temporary token and verifies rejection. It deletes only its temporary token,
account, orders and request receipts. It also runs market/custom/digest jobs and
reports aggregate cache, capture, scan and snapshot counts without credentials.

The live checks passed with four daily owner snapshots, six public scans, and
successful market/custom/snapshot jobs. The digest was captured locally. These
checks do not establish external email/push delivery or external Claude access.

The final Next.js build (including TypeScript) and targeted lint passed. In the
authenticated browser, the owner account loaded after restart, a one-share AAPL
limit order at $1 appeared and was cancelled, and available cash remained
$9,684.08. The notification button reported local capture without device delivery.
The independent local services runner was started and returned successful
market/custom checks, with AI explicitly blocked and snapshots not yet due again.

## Still required

1. The AI entry path is now implemented and database-tested; see
   `neon-ai-scanner.md`. The user has no Anthropic API key, so the optional scanner
   stays off. A single preview can verify external analysis if a key is added.
2. The user-supplied original encryption key is stored locally with Windows
   encryption. The copied owner has no API key to use for a decryption check.
   No Vercel secret or other production setting was changed.
3. Verify provider delivery and automatic order-fill notification integration;
   capture tests alone do not prove devices receive notifications.
4. Verify external MCP clients and production scheduling/worker hosting. A cloud
   client cannot reach localhost. The local MCP setup uses bearer headers.
5. Configure production authentication for https://poshkan.com, refresh the stale
   source snapshot during a controlled write pause, and verify the deployed app
   before stopping Supabase. The other imported users' logins are not migrated.
