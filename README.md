# Poshkan — Paper Trading

Risk-free US stock paper trading. Start with virtual cash, practice the market,
track holdings and P&L — no real money on the line.

> See [DESIGN.md](DESIGN.md) for the full product/architecture design.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase** — auth (with email confirmation), Postgres, Row-Level Security
- **Twelve Data** — live market quotes & search (proxied server-side)
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
3. In **Authentication → Providers → Email**, keep "Confirm email" enabled.
4. In **Authentication → URL Configuration**, add your site URL
   (`http://localhost:3000` for dev) to the redirect allow-list.

### 3. Get a Twelve Data API key

Sign up at [twelvedata.com](https://twelvedata.com) and copy your API key from
the dashboard. The free tier is rate-limited (~8 requests/min) — fine for dev.

### 4. Configure environment

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
TWELVE_DATA_API_KEY=your-twelve-data-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> The Twelve Data key is **server-only** — never prefix it with `NEXT_PUBLIC_`.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- **Auth** — email/password sign-up sends a confirmation email; the link lands
  on `/auth/confirm` which verifies the token and signs you in.
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
