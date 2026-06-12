<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Poshkan — project guide for AI agents

Poshkan is a **launched paper-trading platform** (virtual money only): US stocks, crypto, and
leveraged forex, with an AI trade coach, leaderboard, and an MCP server so Claude can act on
accounts. Live at **https://trade.poshkan.com** (Vercel, auto-deploys from `main`).

## Architecture in one breath
Next.js 16 App Router + TypeScript + Tailwind v4 (class dark mode) · Supabase (auth +
Postgres + RLS; all money mutations go through security-definer SQL RPCs) · market data from
Yahoo via `yahoo-finance2` v3 class API in `src/lib/marketdata.ts` (cached, no key) · crons in
`src/app/api/cron/*` secured by `CRON_SECRET` (Vercel cron daily + external 5-min pinger) ·
MCP server at `src/app/api/mcp/[transport]` (token auth, user-scoped tools).

## Key locations
- Server actions (all of them): `src/app/dashboard/[accountId]/actions.ts`
- Domain math: `src/lib/pnl.ts` (realized P&L), `src/lib/forex.ts` (lots/margin/pips/auto-close),
  `src/lib/assets.ts` (account-type ↔ asset-class enforcement)
- SQL migrations: `supabase/*.sql` — run manually in the Supabase SQL editor, in this order:
  `schema → orders → upgrades → forex → forex-sltp → orders-tif → leaderboard → hardening → mcp → push-journal → ai-limits` (all already applied in prod)
- Hand-rolled SVG charts: `src/components/account/AreaChart.tsx` (+ `PriceChart`)
- Notifications: `src/lib/email.ts` (Resend), `src/lib/push.ts` + `public/sw.js` (web push)

## House rules
- Verify before claiming done: `npx tsc --noEmit` + `npm run build`; browser-check public pages.
- Never `rm -rf .next` while a dev server is running (corrupts its cache).
- Trades must fetch prices server-side (never trust client prices); order fills must claim
  atomically (`status = 'pending'` guard) before executing.
- New tables: enable RLS with owner policies; anything callable by the service role must have
  `execute` revoked from `anon`/`public` (see `supabase/hardening.sql` for the pattern).
- The app must degrade gracefully when a migration hasn't been run (feature hides, no crash).
- Commit per feature with a descriptive body; push to `main` (auto-deploys).
