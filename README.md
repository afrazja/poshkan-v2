# Poshkan — Paper Trading

Practice trading US stocks, ETFs, crypto, and forex with virtual money. Poshkan combines
paper accounts, research beside each trade, performance tracking, and a Strategy Lab for
building and testing your own trading rules.

All balances, trades, and returns are simulated. The app uses market data to price paper trades.

Live app: [www.poshkan.com](https://www.poshkan.com).

## Features

- **Accounts for each market** — independent portfolios, configurable virtual starting cash,
  watchlists, and cash adjustments.
- **Beginner onboarding** — create a paper account, research a company, make a paper trade,
  and review the decision in History. Account/trade completion is automatic; research and review
  are self-confirmed, with progress saved per user in the current browser. Strategy Lab lives
  under **Advanced** in dashboard navigation.
- **Spot and leveraged trading** — stock/crypto market and limit orders, plus leveraged
  long/short positions across all three markets with per-trade leverage and stop-loss/take-profit.
  Forex covers seven major pairs, pending entry orders, scaled exits, and timed auto-close.
  Pending orders support DAY/GTC time in force.
- **Research before buying** — company fundamentals, historical price context, charts, news,
  stock discovery, and a crypto market map. Public research pages, market scans, trading
  explainers, and calculators are available without an account.
- **Performance and leaderboard** — realized/unrealized P&L, allocation, account-value history,
  transaction history, and account rankings by percentage return with activity and drawdown stats.
- **Strategy Lab** — combine entry rules, choose symbols and timeframes, define stops/targets
  and holding limits, then backtest against completed candles with estimated trading costs.
  Backtested strategies can run live paper alerts; custom strategies currently do not place trades.
- **Optional AI tools** — an AI Scanner with custom instructions, optional automatic paper
  trading within account risk limits, and position analysis, using each user's own Anthropic
  API key. Keys are encrypted before storage.
- **Notifications and mobile access** — in-app notifications, Web Push, email alerts, a weekly
  digest endpoint, and an installable PWA with light/dark themes.
- **Claude/MCP access** — personal tokens let compatible MCP clients inspect accounts and
  market data, place spot trades, and manage forex positions and pending orders.

The old SMC, OTE, trend, mean-reversion, and candle-range scanner switches have been retired.
Their strategy explainers remain as educational content; the current tools are user-built
strategies and the AI Scanner.

## Stack and architecture

| Area | Implementation |
| --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, Lucide icons, custom SVG/candlestick charts, TradingView widgets |
| Auth and database | Supabase Auth, Postgres, Row-Level Security, SQL RPCs for trade execution |
| Client data | TanStack Query for quote polling and cache management |
| Market data | Yahoo Finance via `yahoo-finance2`; optional Twelve Data integration |
| AI | Anthropic SDK with encrypted user-provided keys |
| Integrations | MCP server, Resend email, Web Push/VAPID |
| Hosting | Vercel, with scheduled jobs and an external frequent cron pinger |

**Quotes are Yahoo-first:** a batched request resolves multiple symbols, with Twelve Data
filling unresolved quotes when configured. Quotes are cached in memory and in the shared
`market_quotes` table. **Candles are Twelve Data-first when configured**, with Yahoo fallback;
Yahoo also supplies discovery and news. The app can run on Yahoo alone, without a market-data key.
Historical coverage and quote freshness depend on the provider and available cache.

Trade actions obtain prices on the server. Postgres RPCs validate balances and update trading
state atomically; pending-order execution uses a `status = 'pending'` claim. The leveraged
position engine is shared by stocks, crypto, and forex, despite its `fx_*` database names.

## Local setup

### 1. Install dependencies

Use Node.js **20.9 or newer**, npm, and a Supabase project.

```bash
git clone https://github.com/afrazja/poshkan-v2.git
cd poshkan-v2
npm ci
```

### 2. Configure the environment

Copy [`.env.local.example`](.env.local.example) to `.env.local` and replace the placeholders.
For PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required public Supabase client key; database access is constrained by RLS. |
| `NEXT_PUBLIC_SITE_URL` | App origin for email confirmation and password recovery; use `http://localhost:3000` locally. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access for username login, cron jobs, MCP authentication, shared caches, and notifications. Set this for the full app. |
| `CRON_SECRET` | Secret used to authenticate scheduled jobs and sign digest unsubscribe links. |

Optional settings can be added to `.env.local`; the example file contains only the basic setup:

| Variable | Enables / behavior |
| --- | --- |
| `TWELVE_DATA_API_KEY` | Optional candle provider and quote fallback. Leave blank to use Yahoo alone. |
| `TWELVE_DATA_CREDITS_PER_MINUTE` | Local Twelve Data request budget; defaults to `8`. Match it to your provider allowance. |
| `ENCRYPTION_KEY` | Required to save/use user-provided Anthropic keys: 32 random bytes, base64-encoded. |
| `RESEND_API_KEY` | App email delivery. |
| `EMAIL_FROM` | Sender identity for app emails; configure a sender allowed by your Resend account. |
| `CONTACT_EMAIL` | Recipient for the public contact form. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public Web Push key. |
| `VAPID_PRIVATE_KEY` | Matching server-side Web Push private key. |
| `ADMIN_EMAILS` | Comma-separated admin allowlist; the first address receives signup notifications when email is configured. |
| `AUTO_TRADE_ENABLED` | Set to `false` to disable AI Scanner automatic trades globally. User-built strategies produce alerts only. |

Generate an encryption key locally with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep `.env.local` private. Only variables intended for the browser should use `NEXT_PUBLIC_`;
service-role, cron, encryption, provider, and private push keys must stay server-side.
AI features use keys saved by users in the app; there is no shared operator Anthropic-key fallback.
The AI Scanner currently also requires the user to have a push subscription.

### 3. Apply the database scripts

SQL lives in [`supabase/`](supabase/) and is applied manually through the Supabase SQL editor.
There is no automatic migration step in `npm run dev` or `npm run build`.

For a fresh database, apply this base sequence in order (each name is a `.sql` file):

```text
schema → orders → upgrades → forex → forex-sltp → orders-tif
→ leaderboard → hardening → mcp → push-journal → ai-limits
→ login-stats → market-quotes → leaderboard-stats
```

Then apply the remaining scripts in the order below, left to right within each row:

| Order | Files in `supabase/` | Adds |
| --- | --- | --- |
| 1 | `username-login.sql` → `google-auth.sql` | Username login and social-auth profile support. |
| 2 | `market-data-cache.sql` | Shared candle cache and history-sync metadata. |
| 3 | `fx-leverage.sql` → `forex-pairs.sql` → `forex-timed-close.sql` → `forex-tp-levels.sql` → `fx-position-source.sql` | Account leverage, currency conversion, timed/scaled exits, and position origin tracking. |
| 4 | `forex-scan-alerts.sql` → `forex-scan-auto.sql` → `forex-auto-settings.sql` → `forex-ai-instruction.sql` → `ai-scanner-symbols.sql` → `byok-anthropic-key.sql` | AI Scanner history, risk settings, instructions, symbols, and encrypted keys. |
| 5 | `smc-scanner.sql` → `ote-scanner.sql` → `trend-scanner.sql` → `meanrev-scanner.sql` → `candlerange-scanner.sql` | Legacy tables still referenced by later schema scripts. |
| 6 | `scanner-auto-close.sql` → `scanner-position-cap.sql` → `per-trade-leverage.sql` | Holding limits, position caps, and per-trade leverage. |
| 7 | `custom-strategies.sql` | Current Strategy Lab configurations, backtests, and signals. |
| 8 | `notifications.sql` → `account-notify.sql` → `scans.sql` | Notification center, account notification preferences, and public daily scans. |

The legacy scanner tables are included because `scanner-position-cap.sql` and
`per-trade-leverage.sql` alter them **and** add fields used by current features. Applying those
scripts without the legacy tables can fail. On an existing database, inspect what has already
been applied and the prerequisites in each file before running outstanding scripts. Some
optional features hide or show an unavailable state until their migrations are present.

### 4. Configure authentication

Enable email/password authentication with email confirmation in Supabase. Set the Supabase
Auth Site URL to your app origin and allow the following local redirect URLs, plus the
equivalent URLs for each deployed origin:

```text
http://localhost:3000/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/reset
```

The email-confirmation handler expects `token_hash` and `type` query parameters. Configure the
confirmation email link to target `/auth/confirm`, for example:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

The signup form supplies `/auth/confirm` as `RedirectTo`. Google sign-in uses the separate
`/auth/callback` route to exchange the authorization code; password recovery uses `/auth/reset`.

For Google sign-in, apply `google-auth.sql`, configure a Google OAuth web client with your app
origins, and register the **Supabase provider callback** as its authorized redirect URI:

```text
https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
```

Add the Google client ID and secret to the Supabase Google provider and enable it. The Google
provider callback and the app's `/auth/callback` are different steps of the same flow.

### 5. Start the app

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000), create an account, and create a paper portfolio.
Background scans, order monitoring, and daily history require the scheduled jobs below.

## Scheduled jobs and deployment

The project deploys on Vercel from `main`. Configure the environment variables there and set
`NEXT_PUBLIC_SITE_URL` and Supabase Auth redirects to the deployed origin. Database scripts
are applied separately from app deployments.

[`vercel.json`](vercel.json) currently schedules two jobs (UTC):

| Endpoint | Schedule | Work |
| --- | --- | --- |
| `/api/cron/market-check` | Weekdays at 15:30 | Pending orders, price alerts, and leveraged-position exits. |
| `/api/cron/snapshots` | Daily at 22:15 | Account-value snapshots, DAY-order expiry, and public daily scans. |

For ongoing order monitoring and strategy scans, configure an external scheduler to call
`GET /api/cron/scanners` every **1–5 minutes**, with the header:

```text
Authorization: Bearer <CRON_SECRET>
```

This endpoint bundles `custom-scan`, `scan-opportunities` (AI), and `market-check`.
The two schedules in `vercel.json` alone do not provide frequent monitoring. The old
`smc-scan`, `ote-scan`, `trend-scan`, `meanrev-scan`, and `candlerange-scan` routes no longer exist.

`/api/cron/weekly-digest` is available but is not scheduled in `vercel.json`; add a weekly
external schedule if email digests are wanted. `/api/cron/daily-scans` can also be invoked
separately, although snapshots already call it. Scheduled routes require `CRON_SECRET` and
server-side Supabase access.

## MCP integration

Create a personal token in the app's **Claude API access** dialog. Connect an MCP client to
`https://<your-app-host>/api/mcp/mcp` using `Authorization: Bearer <token>`.
The dialog provides connection details; tokens are shown once, stored as hashes, and revocable.

The server scopes tools to the token owner's accounts. It supports account/holding reads,
quotes, price history and indicators, symbol search, transactions, spot trades, and limit orders.
Dedicated forex tools open/list/close positions and place/list/cancel pending entry orders.

## Development reference

| Location | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Public landing page. |
| `src/app/dashboard/` | Accounts, leaderboard, history, and Strategy Lab routes. |
| `src/app/dashboard/actions.ts` | Account creation and demo setup. |
| `src/app/dashboard/[accountId]/actions.ts` | Trading, orders, account settings, tokens, and alerts. |
| `src/app/dashboard/scanners/` | Strategy persistence, backtests, activation, and scanner health. |
| `src/lib/marketdata.ts` | Provider routing and market-data retrieval. |
| `src/lib/market-quote-cache.ts`, `src/lib/market-candle-cache.ts` | Shared market-data caches. |
| `src/lib/pnl.ts`, `src/lib/forex.ts`, `src/lib/assets.ts` | P&L, margin/position math, and asset-class enforcement. |
| `src/lib/custom-strategy.ts`, `src/lib/custom-strategy-backtest.ts`, `src/lib/trading-costs.ts` | Rule evaluation, backtesting, and estimated execution costs. |
| `src/app/api/cron/`, `src/app/api/mcp/[transport]/` | Background jobs and token-authenticated MCP tools. |
| `src/lib/supabase/`, `src/proxy.ts` | Database clients, auth sessions, and route protection. |
| `src/lib/email.ts`, `src/lib/push.ts`, `public/sw.js` | Email, push delivery, and service worker. |
| `supabase/` | Manually applied schema and RPC migrations. |

Useful commands:

```bash
npm run dev          # Development server
npx tsc --noEmit      # Type check
npm run lint         # ESLint
npm run build        # Production build
npm start            # Serve a completed production build
```

Before shipping, run the type check and production build and browser-check public pages.
Do not delete `.next` while a dev server is running. For Next.js changes, read the relevant
guide in `node_modules/next/dist/docs/`; this repository uses Next.js 16 conventions.

See [AGENTS.md](AGENTS.md) for contribution rules and [docs/ROADMAP.md](docs/ROADMAP.md) for
planned work. [DESIGN.md](DESIGN.md) and [docs/OVERVIEW.md](docs/OVERVIEW.md) provide historical
context and may describe earlier versions; current behavior is defined by the code.
