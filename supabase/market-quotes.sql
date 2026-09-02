-- Shared live-quote cache. Safe to re-run.
--
-- Before this, every page load asked the provider for every symbol it showed,
-- and the only cache was in-memory per serverless instance — near-zero hit
-- rate on Vercel. Now the provider is asked once per symbol per TTL and every
-- instance and every user reads the same row.
--
-- Only the service-role client reads or writes this table (same rule as the
-- candle cache in market-data-cache.sql). Quotes are public market data, not
-- user data, so there is nothing to scope per user.

create table if not exists public.market_quotes (
  symbol      text primary key,
  provider    text not null,
  price       double precision not null check (price > 0),
  quote       jsonb not null,
  fetched_at  timestamptz not null default now()
);

create index if not exists market_quotes_fetched_idx
  on public.market_quotes (fetched_at);

-- RLS on with no policies: anon and authenticated get nothing; the service
-- role bypasses RLS, and it is the only thing that touches this table.
alter table public.market_quotes enable row level security;

comment on table public.market_quotes is
  'Shared quote cache: one row per symbol, the full Quote as jsonb. Server-only.';
