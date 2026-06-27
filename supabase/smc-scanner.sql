-- SMC PRO MTF scanner — private feature (gated by SMC_ALLOWLIST at the app layer).
-- Run once in the Supabase SQL editor. The app degrades gracefully if it hasn't run.

-- Per-account scanner config. One row per crypto account that has opted in.
create table if not exists public.smc_settings (
  account_id     uuid primary key references public.accounts (id) on delete cascade,
  enabled        boolean       not null default false,
  mode           text          not null default 'alert' check (mode in ('alert', 'auto')),
  symbols        text[]        not null default array['BTC-USD','ETH-USD','SOL-USD'],
  risk_pct       numeric(6, 4) not null default 0.02,   -- 2% of cash per trade
  tp_rr          numeric(4, 2) not null default 2,      -- take-profit reward:risk
  sl_mode        text          not null default 'swing' check (sl_mode in ('swing', 'fvg')),
  max_open       int           not null default 2,
  max_per_day    int           not null default 5,
  daily_loss_pct numeric(6, 4) not null default 0.04,   -- halt after -4% realized today
  last_run_at    timestamptz,
  last_status    jsonb,                                  -- latest per-symbol read (live feed)
  updated_at     timestamptz   not null default now()
);

alter table public.smc_settings enable row level security;

-- Owner (account holder) may read & manage their own settings; the cron uses the
-- service role (bypasses RLS) to write last_run_at / last_status.
drop policy if exists "owner reads smc_settings" on public.smc_settings;
create policy "owner reads smc_settings" on public.smc_settings for select
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists "owner inserts smc_settings" on public.smc_settings;
create policy "owner inserts smc_settings" on public.smc_settings for insert
  with check (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists "owner updates smc_settings" on public.smc_settings;
create policy "owner updates smc_settings" on public.smc_settings for update
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

-- Append-only signal feed: every alert / auto-trade the scanner emits.
create table if not exists public.smc_signals (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  symbol       text not null,
  direction    text not null check (direction in ('LONG', 'SHORT')),
  entry        numeric,
  stop         numeric,
  take_profit  numeric,
  rr           numeric,
  reason       text,
  executed     boolean not null default false,   -- true = auto-traded, false = alert only
  created_at   timestamptz not null default now()
);
create index if not exists smc_signals_lookup_idx
  on public.smc_signals (account_id, symbol, direction, created_at desc);

alter table public.smc_signals enable row level security;

-- Owner may read their signals; only the service role (cron) inserts (no insert
-- policy → RLS denies anon/authenticated writes, service role bypasses).
drop policy if exists "owner reads smc_signals" on public.smc_signals;
create policy "owner reads smc_signals" on public.smc_signals for select
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));
