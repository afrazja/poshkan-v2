-- TREND BREAKOUT (Donchian) scanner. Run once in the Supabase SQL editor.
-- The app degrades gracefully (no scanner) if it hasn't been run.

create table if not exists public.trend_settings (
  account_id     uuid primary key references public.accounts (id) on delete cascade,
  enabled        boolean       not null default false,
  mode           text          not null default 'alert' check (mode in ('alert', 'auto')),
  symbols        text[]        not null default array['BTC-USD','ETH-USD','SOL-USD'],
  risk_pct       numeric(6, 4) not null default 0.02,   -- 2% of cash per trade
  donchian_n     int           not null default 20,     -- breakout lookback (bars)
  tp_rr          numeric(4, 2) not null default 3,       -- take-profit reward:risk
  max_open       int           not null default 2,
  max_per_day    int           not null default 5,
  daily_loss_pct numeric(6, 4) not null default 0.04,   -- halt after -4% realized today
  last_run_at    timestamptz,
  last_status    jsonb,                                  -- latest per-symbol read (live feed)
  updated_at     timestamptz   not null default now()
);

-- Trend-quality gates (added later — run these if you created the table earlier).
alter table public.trend_settings add column if not exists adx_min       int           not null default 20;   -- require ADX ≥ this (0 = off)
alter table public.trend_settings add column if not exists ma_slope      boolean       not null default true; -- MA must slope in the trade direction
alter table public.trend_settings add column if not exists max_chase_atr numeric(4, 2) not null default 1.5;  -- skip if breakout ran > this ×ATR past the level (0 = off)

alter table public.trend_settings enable row level security;

drop policy if exists "owner reads trend_settings" on public.trend_settings;
create policy "owner reads trend_settings" on public.trend_settings for select
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists "owner inserts trend_settings" on public.trend_settings;
create policy "owner inserts trend_settings" on public.trend_settings for insert
  with check (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists "owner updates trend_settings" on public.trend_settings;
create policy "owner updates trend_settings" on public.trend_settings for update
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

create table if not exists public.trend_signals (
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
create index if not exists trend_signals_lookup_idx
  on public.trend_signals (account_id, symbol, direction, created_at desc);

alter table public.trend_signals enable row level security;

drop policy if exists "owner reads trend_signals" on public.trend_signals;
create policy "owner reads trend_signals" on public.trend_signals for select
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));
