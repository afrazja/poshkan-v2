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
three entry points, with no direct table access. RLS is enabled on every test
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
- Saving validated stop-loss/take-profit prices. These levels are **not executed
  automatically** until the worker migration is completed.

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

The owner has verified Neon login and read-only portfolios in their own browser.
An interactive trade from that signed-in browser remains to be confirmed; tests
do not impersonate the owner or manufacture an authenticated session.

## Still required for complete migration

Pending/limit order placement and atomic fills; automatic SL/TP, scaled exits and
timed closes; scanners, market caches, background jobs and MCP authorization;
conversion of the original full app routes; restricted production credentials;
trusted auth domain `https://poshkan.com`; fresh final data reconciliation and
production deployment. Do not pause Supabase yet.
