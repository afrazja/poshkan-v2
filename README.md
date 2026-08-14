# Poshkan — Paper Trading

Risk-free US stock paper trading. Start with virtual cash, practice the market,
track holdings and P&L — no real money on the line.

> See [DESIGN.md](DESIGN.md) for the full product/architecture design.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase** — auth (with email confirmation), Postgres, Row-Level Security
- **Twelve Data** — primary quotes and OHLC history, proxied server-side
- **Yahoo Finance** — symbol discovery, news, quote enrichment, and automatic fallback
- **TanStack Query** — live quote polling

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql).
   This creates the tables, RLS policies, the auto-profile trigger, and the
   trading RPC functions.
3. Run [`supabase/market-data-cache.sql`](supabase/market-data-cache.sql) to enable the shared,
   service-role-only Twelve Data candle cache.
4. In **Authentication → Providers → Email**, keep "Confirm email" enabled.
5. In **Authentication → URL Configuration**, set the production Site URL and add these exact
   redirect URLs (plus the equivalent URL for any other production hostname you serve):
   - `https://www.poshkan.com/auth/callback`
   - `http://localhost:3000/auth/callback`
6. Run [`supabase/google-auth.sql`](supabase/google-auth.sql) in the SQL Editor. This updates the
   profile trigger so social-auth users receive a non-email, collision-safe username.

### 2a. Enable Google sign-in

1. In the Google Auth Platform console, configure the OAuth consent screen and create an OAuth
   client with application type **Web application**.
2. Add your app origins under **Authorized JavaScript origins**, for example
   `https://www.poshkan.com` and `http://localhost:3000`.
3. Under **Authorized redirect URIs**, add the Supabase callback URL shown on the Supabase
   **Authentication → Providers → Google** page. It has this form:
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
   This is the Supabase URL, not Poshkan's `/auth/callback` URL.
4. Copy the Google Client ID and Client Secret into Supabase's Google provider settings and enable
   the provider.

### 3. Get a Twelve Data API key

Sign up at [twelvedata.com](https://twelvedata.com) and copy your API key from
the dashboard. The free tier is rate-limited (~8 requests/min) — fine for dev.

### 4. Configure environment

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
TWELVE_DATA_API_KEY=your-twelve-data-key
TWELVE_DATA_CREDITS_PER_MINUTE=8
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> The Twelve Data key is **server-only** — never prefix it with `NEXT_PUBLIC_`.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- **Auth** — users can continue with Google, or use email/password with email confirmation. Google
  returns through `/auth/callback`; email confirmation returns through `/auth/confirm`.
- **Accounts** — create multiple paper portfolios with starting cash and
  optional seeded holdings. Top up or reset cash anytime.
- **Trading** — search a symbol, then Buy / Sell / add to Watchlist. Trades fill
  at the live price (fetched server-side at execution) via an atomic Postgres
  RPC that validates cash and share balances (long-only, no margin).
- **P&L** — holdings show shares, avg cost, live price, day %, market value, and
  unrealized P&L in $ and %.

## Roadmap (v2)

Crypto & Forex asset classes, limit orders, transaction-history view,
account-value charts.
