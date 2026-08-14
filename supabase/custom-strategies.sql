-- User-built scanner experiments. Safe to re-run in the Supabase SQL editor.

create table if not exists public.custom_strategies (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  account_id         uuid not null references public.accounts (id) on delete cascade,
  name               text not null check (char_length(name) between 3 and 80),
  description        text not null default '' check (char_length(description) <= 280),
  timeframe          text not null check (timeframe in ('15min', '1h', '1day')),
  symbols            text[] not null,
  direction          text not null check (direction in ('LONG', 'SHORT')),
  match_mode         text not null default 'all' check (match_mode in ('all', 'any')),
  rules              jsonb not null,
  stop_atr           numeric(5, 2) not null default 1.5,
  take_profit_rr     numeric(5, 2) not null default 2,
  max_hold_bars      int not null default 24,
  status             text not null default 'draft' check (status in ('draft', 'backtested', 'live', 'paused')),
  version            int not null default 1,
  last_backtest      jsonb,
  last_backtested_at timestamptz,
  last_run_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (cardinality(symbols) between 1 and 5),
  check (jsonb_typeof(rules) = 'array'),
  check (stop_atr between 0.25 and 10),
  check (take_profit_rr between 0.5 and 10),
  check (max_hold_bars between 1 and 500)
);

create index if not exists custom_strategies_user_idx
  on public.custom_strategies (user_id, updated_at desc);
create index if not exists custom_strategies_live_idx
  on public.custom_strategies (status, last_run_at) where status = 'live';

alter table public.custom_strategies enable row level security;

drop policy if exists "custom_strategies_all_own" on public.custom_strategies;
create policy "custom_strategies_all_own" on public.custom_strategies
  for all
  using (auth.uid() = user_id and public.owns_account(account_id))
  with check (auth.uid() = user_id and public.owns_account(account_id));

create table if not exists public.custom_strategy_signals (
  id             uuid primary key default gen_random_uuid(),
  strategy_id    uuid not null references public.custom_strategies (id) on delete cascade,
  account_id     uuid not null references public.accounts (id) on delete cascade,
  symbol         text not null,
  direction      text not null check (direction in ('LONG', 'SHORT')),
  bar_time       timestamptz not null,
  entry          numeric not null,
  stop           numeric not null,
  take_profit    numeric not null,
  rr             numeric not null,
  reason         text,
  created_at     timestamptz not null default now(),
  unique (strategy_id, symbol, direction, bar_time)
);

create index if not exists custom_strategy_signals_lookup_idx
  on public.custom_strategy_signals (strategy_id, created_at desc);

alter table public.custom_strategy_signals enable row level security;

drop policy if exists "custom_strategy_signals_read_own" on public.custom_strategy_signals;
create policy "custom_strategy_signals_read_own" on public.custom_strategy_signals
  for select using (
    exists (
      select 1 from public.custom_strategies strategy
      where strategy.id = strategy_id and strategy.user_id = auth.uid()
    )
  );
