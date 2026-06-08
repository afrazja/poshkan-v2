# Poshkan — Paper Trading App: Design & Plan

> **v1 scope:** US stocks only. Crypto and Forex are designed for but deferred.
> **Stack:** Next.js (App Router) + Supabase (Auth + Postgres + RLS) + Twelve Data (market data).

---

## 1. Product Overview

Poshkan is a paper-trading platform where a user can hold multiple virtual
trading accounts, each starting with fake cash (and optionally seeded
positions). Users buy/sell US stocks at live-ish prices, track holdings and
unrealized P&L, and maintain a watchlist. No real money, no real orders.

**v1 deliberately excludes:** crypto, forex, limit orders, options, social
features. The data model is built so these slot in later without a rewrite.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | SSR for fast loads, API routes for the Twelve Data proxy, one deployable. |
| Auth | **Supabase Auth** | Email/password **with built-in email confirmation**, password reset, secure hashing — solves your "confirm email" + "change password" requirements for free. |
| Database | **Supabase Postgres** | Relational fits the ledger model; Row-Level Security keeps each user's data isolated. |
| Market data | **Twelve Data** | Single API; quotes, search, historical candles. Proxied through our backend so the API key is never exposed. |
| Styling | **Tailwind CSS** | Fast, and trivial dark-mode via `class` strategy. |
| State/data | **TanStack Query** | Caching + polling for live quotes. |
| Charts | **lightweight-charts** (TradingView) | Account value + price charts. |
| Hosting | **Vercel** (app) + Supabase cloud | Zero-config deploy. |

**Key security rule:** the Twelve Data API key lives only in server env vars.
The browser calls *our* `/api/...` routes, which call Twelve Data. The browser
never sees the key.

---

## 3. Information Architecture (Screens)

```
/                      Landing (logged out): login + create-account forms, hero
/auth/confirm          Email confirmation landing (Supabase redirect target)
/dashboard             Account list — the "+" to create a new account lives here
/dashboard/[accountId] Single account view (summary, search, holdings, watchlist)
/settings              Change password, theme toggle (modal or page)
```

### 3.1 Landing page (logged out)
- **Left:** tabbed card — **Log in** / **Create account**.
  - Create account fields: **email, username, password** (+ confirm password).
  - On submit → Supabase sends confirmation email → "Check your inbox" state.
  - User clicks email link → `/auth/confirm` → account activated → redirected in.
- **Right:** **Hero section** (see §8 for proposed copy/visual).

### 3.2 App shell (logged in) — top bar
Matches your spec exactly:
- **Left:** site name **"Poshkan"** (logo, links to `/dashboard`).
- **Right:** **user avatar** → click opens menu → **Sign out** (+ profile).
- **Left of the avatar:** **Settings** (gear) → change password, **dark/light toggle**.

### 3.3 Dashboard (account list)
- Grid/list of account cards: name, type badge, total value, day change, cash.
- A prominent **"+" card** → opens the **Create Account** form (§3.4).
- Click a card → enter that account (`/dashboard/[accountId]`).

### 3.4 Create Account form (modal)
Fields, in order:
1. **Account name** (text)
2. **Account type** (select — v1: `Stocks`; later: `Crypto`, `Forex`)
3. **Initial cash** (number)
4. **Initial holdings?** (optional, repeatable rows):
   - Symbol (autocomplete via Twelve Data search)
   - Quantity
   - **Average price** — this row's price field **appears only after a symbol +
     quantity is entered**, exactly as you described.
5. **Create** → seeds cash + positions + opening ledger entries → navigates into
   the new account.

> **Design note:** seeded holdings should generate `transaction` ledger rows of
> type `OPENING_BALANCE` so average-cost math has a single source of truth.

### 3.5 Account view (`/dashboard/[accountId]`)
Top → bottom, matching your spec:

1. **Account summary bar:** Total value · Buying power (cash) · Today's P&L ($/%)
   · Total unrealized P&L ($/%) · small account-value sparkline.
2. **Search bar:** type symbol or company name → autocomplete results.
3. **Symbol panel** (after selecting a result): current price, day change %,
   mini chart, and action buttons:
   - **Buy** (always)
   - **Sell** (only enabled if the account holds it)
   - **Add to watchlist**
4. **Holdings table** — one row per position:
   | Symbol | Shares | Avg cost | Current price | Day % | Mkt value | Unrealized P&L ($) | Unrealized P&L (%) |
5. **Watchlist table** — symbol, current price, day change %, quick "Buy".

---

## 4. Data Model (Postgres / Supabase)

```
profiles
  id            uuid  (PK, = auth.users.id)
  username      text  (unique)
  avatar_url    text
  theme         text  default 'light'        -- 'light' | 'dark'
  created_at    timestamptz

accounts
  id            uuid  (PK)
  user_id       uuid  (FK → profiles.id)
  name          text
  type          text  default 'stocks'       -- enum-like: stocks|crypto|forex
  cash_balance  numeric(20,8)                 -- buying power
  created_at    timestamptz

positions                                     -- current holdings (derived but cached)
  id            uuid (PK)
  account_id    uuid (FK → accounts.id)
  symbol        text
  quantity      numeric(20,8)
  avg_cost      numeric(20,8)                 -- weighted average entry price
  UNIQUE(account_id, symbol)

transactions                                  -- immutable ledger (source of truth)
  id            uuid (PK)
  account_id    uuid (FK → accounts.id)
  symbol        text
  side          text                          -- BUY | SELL | OPENING_BALANCE | DEPOSIT | RESET
  quantity      numeric(20,8)
  price         numeric(20,8)
  cash_delta    numeric(20,8)                 -- +/- effect on cash
  created_at    timestamptz

watchlist
  id            uuid (PK)
  account_id    uuid (FK → accounts.id)
  symbol        text
  UNIQUE(account_id, symbol)
```

**Row-Level Security:** every table filtered by `user_id` (directly or via the
account's owner) so a logged-in user can only ever read/write their own rows.

### 4.1 Buy / Sell logic (server-side, transactional)
A trade must update cash, position, and the ledger **atomically** (a Postgres
function / RPC), with validation:

- **BUY:** require `cash_balance >= qty * price`.
  - new cash = cash − qty*price
  - new avg_cost = `(old_qty*old_avg + qty*price) / (old_qty+qty)`
  - insert `BUY` transaction.
- **SELL:** require `position.quantity >= qty`.
  - new cash = cash + qty*price
  - avg_cost unchanged; if qty hits 0, delete the position row.
  - insert `SELL` transaction.

Price used = the live quote fetched server-side at execution time (don't trust a
price sent from the browser — re-fetch to prevent tampering).

---

## 5. Market Data Integration (Twelve Data)

All calls go through Next.js API routes (key hidden server-side):

| Our route | Twelve Data endpoint | Used by |
|---|---|---|
| `GET /api/search?q=` | `/symbol_search` | Search bar autocomplete |
| `GET /api/quote?symbol=` | `/quote` | Symbol panel, holdings, watchlist |
| `GET /api/quotes?symbols=a,b` | `/quote` (batch) | Refresh whole holdings/watchlist in one call |
| `GET /api/timeseries?symbol=` | `/time_series` | Price/account charts |

- **Polling:** TanStack Query refetches quotes every ~10–15s while a view is
  open (Twelve Data free tier is rate-limited — batch symbols, cache briefly).
- **Market hours:** show a "market closed" badge outside US trading hours;
  quotes go stale rather than live.
- **Caching:** short server-side cache (e.g. 10s) to stay under rate limits when
  multiple users request the same popular symbol.

---

## 6. Settings & Theming

- **Change password:** Supabase `updateUser({ password })` (requires recent
  login; otherwise re-auth).
- **Dark/light mode:** Tailwind `class` strategy. Persist choice on
  `profiles.theme` *and* in `localStorage` for instant load (no flash).
- Toggle lives in the Settings menu (gear, left of avatar) per your spec.

---

## 7. P&L Definitions (so numbers are unambiguous)

- **Market value** of a position = `quantity * current_price`.
- **Unrealized P&L ($)** = `(current_price − avg_cost) * quantity`.
- **Unrealized P&L (%)** = `(current_price − avg_cost) / avg_cost`.
- **Day change %** (your "% change from yesterday") = from Twelve Data's quote
  (`percent_change` field, vs previous close).
- **Account total value** = `cash_balance + Σ market_value`.
- **Today's P&L** = `Σ (current_price − prev_close) * quantity`.

---

## 8. Hero Section (proposed — my taste, easy to change)

**Headline:** "Trade fearlessly. Lose nothing."
**Sub:** "Poshkan is your risk-free playground for the US stock market. Start
with virtual cash, build real instincts — no money on the line."
**Visual:** a stylized portfolio card / animated ticker tape of green & red
quotes, or a clean candlestick chart illustration on a gradient.
**CTA:** points the eye to the Create-account form on the left.

*(Alt headlines if you prefer: "Practice the market, master your moves." /
"Your stock-market sandbox.")*

---

## 9. Build Plan (phased)

1. **Project setup** — Next.js + Tailwind + Supabase client, dark-mode config.
2. **Auth** — landing page, login/signup forms, email confirmation flow, app shell (top bar, avatar menu, settings).
3. **Database** — tables, RLS policies, the buy/sell RPC.
4. **Accounts** — dashboard list, "+" create-account modal (with the dynamic avg-price rows), open an account.
5. **Market data** — API proxy routes to Twelve Data, search + quote.
6. **Trading** — symbol panel, buy/sell/watchlist actions, holdings & watchlist tables with live P&L.
7. **Charts & polish** — account-value chart, market-hours handling, loading/empty/error states.
8. **Deferred (v2):** crypto, forex, limit orders, transaction-history view.

---

## 10. Resolved Decisions

- ✅ **Multiple accounts per user** — yes.
- ✅ **Cash reset / top-up** — users **can** add virtual cash to a running
  account **and** reset an account to start over. Both actions write a
  `transaction` ledger row (`DEPOSIT` / `RESET`) so history stays consistent.
- ✅ **Avatar** — **auto-generated initials/identicon** from the username in v1.
  No upload, no storage, no cropping UI.
- ✅ **Shorting / margin** — **disallowed**. Long-only: can't spend more cash
  than held, can't sell shares not held. (Enforced in the buy/sell RPC, §4.1.)

### Still to confirm (minor)
- **Username uniqueness** — required unique, or display-only? (Doc assumes unique.)
- **Hero copy** — keep "Trade fearlessly. Lose nothing." or a different vibe?

> **Note:** new ledger sides added by these decisions: `DEPOSIT`, `RESET`
> (alongside `BUY`, `SELL`, `OPENING_BALANCE`). The `transactions.side` field
> and §4.1 logic account for them.
```
