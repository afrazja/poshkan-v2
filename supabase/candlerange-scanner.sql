-- CANDLE RANGE (box / support-resistance bounce) scanner. Run once in the Supabase SQL editor.
-- The app degrades gracefully (no scanner) if it hasn't been run.

create table if not exists public.candlerange_settings (
  account_id     uuid primary key references public.accounts (id) on delete cascade,
  enabled        boolean       not null default false,
  mode           text          not null default 'alert' check (mode in ('alert', 'auto')),
  symbols        text[]        not null default array['BTC-USD','ETH-USD','SOL-USD'],
  risk_pct       numeric(6, 4) not null default 0.02,   -- 2% of cash per trade
  range_period   int           not null default 20,     -- bars that define the box
  edge_zone      numeric(4, 2) not null default 0.25,   -- enter within this fraction of an edge
  sl_atr_mult    numeric(4, 2) not null default 0.5,    -- stop buffer beyond the edge (× ATR)
  confirm_candle boolean       not null default true,   -- require a reversal candle
  max_open       int           not null default 2,
  max_per_day    int           not null default 5,
  daily_loss_pct numeric(6, 4) not null default 0.04,   -- halt after -4% realized today
  last_run_at    timestamptz,
  last_status    jsonb,                                  -- latest per-symbol read (live feed)
  updated_at     timestamptz   not null default now()
);

alter table public.candlerange_settings enable row level security;

drop policy if exists "owner reads candlerange_settings" on public.candlerange_settings;
create policy "owner reads candlerange_settings" on public.candlerange_settings for select
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists "owner inserts candlerange_settings" on public.candlerange_settings;
create policy "owner inserts candlerange_settings" on public.candlerange_settings for insert
  with check (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

drop policy if exists "owner updates candlerange_settings" on public.candlerange_settings;
create policy "owner updates candlerange_settings" on public.candlerange_settings for update
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

create table if not exists public.candlerange_signals (
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
create index if not exists candlerange_signals_lookup_idx
  on public.candlerange_signals (account_id, symbol, direction, created_at desc);

alter table public.candlerange_signals enable row level security;

drop policy if exists "owner reads candlerange_signals" on public.candlerange_signals;
create policy "owner reads candlerange_signals" on public.candlerange_signals for select
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));
