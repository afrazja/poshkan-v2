# Isolated trading rehearsal

The live domain is **https://poshkan.com**, as confirmed by its owner. It continues
to use Supabase. This feature is local-only at `/neon-preview/trading` and requires
both `POSHKAN_NEON_PREVIEW=1` and `NEON_TRADING_PREVIEW=1`; Vercel is excluded by the
existing preview guard. No production environment or deployment was changed.

## Database boundary

`neon/trading-preview-setup.sql` creates `poshkan_trade_test`, copying only the
identity mapping, accounts, holdings, ledger and leveraged positions needed for
the rehearsal. It refuses existing objects/roles rather than overwriting them.
`poshkan_stage` is unchanged, including its disabled application-access flag.
The copied mapping enables only the private trading test. The owner can compare
the immutable imported snapshot against independently changing test balances.

The `poshkan_trade_preview` role has schema usage and execute permission for the
explicit trading/order entry points, with no direct table access. RLS is enabled on every test
table; SECURITY DEFINER functions check the explicit Neon-to-legacy mapping,
bans, and account ownership. Public execution is revoked. The Next.js server
verifies the Neon session and sets an identity inside a transaction after
`SET LOCAL ROLE`. Connections never retain the identity/role between requests.
Missing identity is rejected; there is no null-user service bypass.

Only server code can fetch execution quotes and call the trading functions.
The trusted server connection is a security boundary: do not expose it as a
browser Data API or distribute its credential. The local launcher still uses
the encrypted owner credential and drops to the restricted role per transaction.
A dedicated login role/credential remains required before production cutover.

## Supported operations

- Spot buy and sell, weighted average cost, balance checks, atomic ledger writes.
- Leveraged long/short positions for the account's supported market.
- 1×, 2×, 5× and 10× leverage, matching the current app's choices.
- Full/partial closing, proportional margin release, USD-base forex conversion,
  realized P&L rounded consistently to cents, loss capped at reserved margin.
- Saving validated stop-loss/take-profit prices, evaluated by the test checks
  described below.

The source backup's `fx_open` ignored its margin argument and forced 30× leverage;
this conflicts with the current UI. The new test engine calculates margin itself
from the selected allowed leverage. It also rejects nonfinite numeric input,
subprecision trades and mismatched account markets. Eight-decimal position units
are retained. USD-base conversion recognizes forex symbols specifically rather
than any stock symbol beginning with `USD`.

Each command has an actor-scoped request UUID and its original payload/result.
Concurrent retries serialize and return the first result; reusing a UUID for a
different command fails. Completed results can be retrieved before requesting a
new quote, including after a position has closed. Account-before-position lock
ordering prevents concurrent balance changes from overspending.

The server fetches uncached Yahoo quotes without importing Supabase cache code.
It rejects stale (>5 minutes), missing, future, nonfinite or mismatched quotes;
stocks/forex require an open market and supported quote type. Non-forex prices
must be USD. Server Actions reject browser-supplied price fields.

## Verification performed

- Disposable PostgreSQL 17: `node scripts/check-neon-trading.mjs` restores the
  source snapshot into an isolated loopback cluster and stops it in `finally`.
  Exercises accounting, retries, failed-operation rollback, overspending races,
  full/partial FX closes, concurrent close, leverage, conversions, bans, ownership,
  missing identities and direct-table denial.
- `node scripts/check-neon-trade-input.mjs`: strict payloads and trusted quote
  validation, including NaN, stale dates, wrong symbols/currencies and closed markets.
- Actual Neon PostgreSQL 18: `start-neon-preview.ps1 -CheckTrading` performs a
  test command in a transaction and rolls it all back; checks result lookup,
  role privileges and absence of test rows afterward.
- Live market feed returned a fresh valid BTC-USD quote from this computer.
- TypeScript, targeted ESLint and full Next.js production build.
- Browser signed-out guard, plus synthetic rendering of the actual form. The
  synthetic fixture cannot call any trading action and is not an app route.

The owner verified Neon login and read-only portfolios in their own browser and
confirmed the manual trade test on September 19, 2026. Tests do not impersonate
the owner or manufacture an authenticated session.

## Pending orders and exits

`neon/orders-preview-setup.sql` is a one-time additive migration. It copies all
source `orders`, `fx_orders`, and `fx_tp_levels` into the trading test schema,
preserving their identifiers and values. It enables RLS and adds only scoped
foreign keys, expiry/failure fields and eight-decimal units support. It refuses
existing tables. `neon/orders-engine.sql` contains replaceable functions.
The external `install-orders-preview.ps1 -UpdateOnly` refreshes functions without
recreating the copied tables. Reapplying the core trading engine revokes order
grants, so apply the order engine afterward.

The local page provides limit buy/sell orders, leveraged entries with explicit
above/below triggers, cancellation, optional 24-hour expiry, timed full closes
(0 clears the timer), and up to three scaled take-profit levels in the form
(the validated API accepts ten). New expiries are calculated in the database;
retries retain the same payload and request ID. Legacy DAY orders expire when
their New York calendar date has passed. Cash/holdings are checked at fill time,
not reserved at placement.

**Check now** runs one pass using the signed-in user. The earlier page-only timer
has been replaced by the explicit background controls described below. Manual
checks and background checks share the same atomic execution function and may
safely overlap. Both recheck the configured owner under database locks.

Fills lock the account before the order/position. The order status change and
trade are one transaction. Concurrent checks/cancellation serialize; terminal
orders cannot fill again. Insufficient funds/holdings or gap-invalidated entry
protection roll back all trade writes and mark the order canceled with a domain
reason. Unexpected database failures roll back that item's check and are reported
as failed in the summary, without preventing other items from being checked.

The web server and background process share one quote validator. The database rechecks quote age
after acquiring locks. A closed market or unavailable quote prevents execution;
orders can still expire. Timed closes defer until an executable price exists.
Priority is margin stop, stop-loss, single take-profit, timer, then scaled levels.
Stops and timed/margin exits use the observed price (including adverse gaps);
take-profit levels fill conservatively at the stored target. This changes the
old source stop behavior, which filled at the stop even after a gap. These checks
use sampled quotes, not candle highs/lows, so an intraperiod touch may be missed.
Scaled fills and partial closes commit together, nearest target first; invalid
replacement levels roll back without removing the existing ones.

Additional verification: all three copied tables compare exactly with the source
values in the disposable database; concurrent placement/fill/cancel, failed-fill
accounting, quote age/identity/symbol guards, offline expiry, both entry triggers,
gap handling, long/short partial exits, timers and privilege denial are exercised
by `scripts/check-neon-orders.mjs` through the main trading test runner. The live
Neon check places/fills an order and verifies the balance/retry result inside a
transaction that is fully rolled back. Synthetic UI rendering covers all four
order forms; it never submits real trades. The owner's interactive confirmation
so far covers the preceding manual-trade step, not these new order controls.

## Background execution on this PC

`neon/worker-preview-setup.sql` creates a separate `poshkan_preview_worker`
NOINHERIT role and an RLS-protected control row bound to the approved Neon user.
The one-time provisioner sets a random login password. The external
`install-background-worker.ps1` saves it with Windows DPAPI in the ignored
`secrets/neon-worker-credential.xml`. An encrypted pending file is retained if
provisioning is interrupted; do not overwrite it or rerun the one-time setup.

The worker login can execute only claim, poll, check and report functions. It
cannot read account tables, place trades, change its owner, enable itself or
assume the web runtime role. Entry points validate PostgreSQL SESSION_USER before
establishing the configured owner's identity internally. They then reuse the
existing ownership and ban checks. Setting a role or identity variable cannot
impersonate the worker. Its trusted credential must never reach a browser or Data
API; the process supplies server-validated execution quotes.

The signed-in owner controls **Start background checks** / **Stop background
checks**. Installation starts stopped. Enabling requires a recent heartbeat.
Enabled passes repeat approximately every 15 seconds plus execution time; paused
processes check settings every 30 seconds without fetching prices or trading.
These heartbeats still use Neon compute. Stop the process when this local
rehearsal is no longer needed; hosted scheduling and its cost controls remain
part of production migration.

Worker fills hold a shared lock on the control row. Stopping takes the exclusive
lock, waiting for an active fill to finish before confirming stopped. Subsequent
worker fills return paused, even if they fetched a quote earlier. Manual Check
now remains available. The app displays a heartbeat and counts-only last-pass
summary, marks the process offline after 90 seconds without contact, and refreshes
balances when a completed check changes.

`scripts/neon-order-worker.mjs` is a separate Node process, independent of Next.js,
the browser and browser sessions. It uses a direct TLS-verified restricted login,
retries connection failures and applies quote/database timeouts. A connection-
scoped advisory lease prevents duplicate processes from polling; connection loss
releases it. Missing prices permit expiration only.

`start-background-worker.ps1` launches the process in a hidden window, stripping
owner-database and authentication secrets from its inherited environment. Logs
under ignored `generated/` contain status messages, not credentials or account
records. The local preview launcher also starts the worker; duplicate launches
exit after failing to acquire the lease. This is not a Windows startup task or
cloud deployment. It stops at PC shutdown and pauses during sleep; restarting the
local preview reconnects it.

Tests use a real restricted login in the disposable database to verify fills
without a browser, privilege denial, SESSION_USER impersonation, singleton lease,
page/worker races, pause during a price request, bans, unavailable prices, expiry
and reconnect with pause retained. `check-background-worker.ps1` verified the
installed login on Neon using only one temporary account/order, then removed its
records and restored paused settings. The actual hidden process was observed
online with exactly one restricted database session while Next.js was stopped.
Synthetic UI fixtures cover start and stop states with inactive controls.

## Still required for complete migration

Hosted scheduling for the tested worker; scanners, market caches, other
background jobs and MCP authorization;
conversion of the original full app routes; restricted production credentials;
trusted auth domain `https://poshkan.com`; fresh final data reconciliation and
production deployment. Do not pause Supabase yet.
