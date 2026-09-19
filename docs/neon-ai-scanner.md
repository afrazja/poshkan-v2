# Neon AI scanner rehearsal

The local scanner now uses `ai-scanner.sql`, not the legacy Supabase `fx_open`
call. Signal claims serialize on the account and deduplicate a symbol/direction
for twelve hours. Entry rechecks identity, account opt-in, worker pause, daily
count, cooldown, exposure and daily losses under the account lock used by trades.
Fresh server quotes are required for both entry and existing leveraged exposure.
Floating losses count individually without being offset by open profits.

Sizing uses current cash, configured leverage, risk and margin caps, rounding
down for the asset class. Stops and targets preserve proposal distances and at
least 2:1 reward/risk at the actual quote. USD-base stop risk uses conversion at
the stop. Limit proposals produce alerts, never immediate entries. Position,
protective levels, AI source tag, execution timestamp and durable receipt commit
together. Concurrent retries return the same receipt. Lost responses are
reconciled before reporting an outcome. The local scanner ignores force mode.

## Current configuration

The user supplied the original `ENCRYPTION_KEY`. Its 32-byte format was validated
and it was saved with Windows encryption outside Git. Vercel marks the setting
Sensitive and did not return its value; no Vercel setting was changed. The older
local export contained no usable key. The copied owner profile exists but has
no Anthropic API key, so decryption of an existing secret could not be verified.
The user confirmed they do not have an Anthropic API key. No paid call was made.

The launcher keeps `POSHKAN_NEON_AI_SCANS=0` and `AUTO_TRADE_ENABLED=false`.
Repeated scans and automatic entries stay off. Non-AI local service checks have
been restarted. Claude desktop MCP is a separate integration that does not need
the app's Anthropic API key.

If a key is added through the local Settings form later, a cron-authenticated
`/api/cron/scan-opportunities?preview=1&account=<owned UUID>` can run one analysis
without claiming signals, sending notifications or placing a trade. Repeated
paid scans require a separate opt-in. External AI analysis remains unverified.

## Validation

- Full disposable database suite passed, including concurrent AI claims/entries,
  retry receipts, wrong identity, pause, stale/missing quotes, protective levels,
  daily count, cooldown, floating loss, and limit-proposal rejection.
- `start-neon-preview.ps1 -CheckAi` passed on Neon PostgreSQL 18: synthetic entry,
  cash and retry checks inside a transaction that rolled back completely.
- `check-neon-ai-endpoint.mjs` passed: unsigned requests rejected, scheduled scans
  disabled, and missing key reported without calling Claude.
- TypeScript, targeted lint and full Next.js build passed. The authenticated
  dashboard and API-key dialog loaded after restart.

The services and full-app installers include `ai-scanner.sql` last. The original
stage, owner balances and worker pause were preserved. Real email/device delivery,
order-fill notifications, cloud hosting and production data/auth cutover remain
separate work. The optional unconfigured AI scanner can stay off during migration.
