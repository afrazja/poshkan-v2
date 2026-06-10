-- ============================================================================
-- Time-in-force for stock/crypto limit orders + forex pending entry orders.
-- Run in the Supabase SQL editor AFTER forex-sltp.sql (additive).
-- ============================================================================

-- 1) DAY/GTC on existing limit orders; 'expired' outcome.
alter table public.orders add column if not exists time_in_force text not null default 'GTC';
alter table public.orders drop constraint if exists orders_time_in_force_check;
alter table public.orders add constraint orders_time_in_force_check
  check (time_in_force in ('DAY', 'GTC'));
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'filled', 'canceled', 'expired'));

-- 2) Forex pending entry orders: open a position when the rate reaches a level.
--    trigger_when is fixed at placement from the current rate (limit vs stop entry).
create table if not exists public.fx_orders (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  symbol       text not null,
  direction    text not null check (direction in ('LONG', 'SHORT')),
  units        numeric(20, 2) not null check (units > 0),
  entry_rate   numeric(20, 6) not null check (entry_rate > 0),
  trigger_when text not null check (trigger_when in ('AT_OR_BELOW', 'AT_OR_ABOVE')),
  stop_loss    numeric(20, 6),
  take_profit  numeric(20, 6),
  expires_at   timestamptz,            -- null = good-til-canceled
  status       text not null default 'pending'
               check (status in ('pending', 'filled', 'canceled', 'expired')),
  created_at   timestamptz not null default now(),
  filled_at    timestamptz,
  filled_rate  numeric(20, 6)
);
create index if not exists fx_orders_account_status_idx on public.fx_orders (account_id, status);

alter table public.fx_orders enable row level security;
drop policy if exists "fx_orders_all_own" on public.fx_orders;
create policy "fx_orders_all_own" on public.fx_orders
  for all using (public.owns_account(account_id)) with check (public.owns_account(account_id));
