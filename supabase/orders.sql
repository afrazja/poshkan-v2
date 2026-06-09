-- ============================================================================
-- Limit orders  (run this in the Supabase SQL editor, after schema.sql)
-- ============================================================================
create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  symbol       text not null,
  side         text not null check (side in ('BUY', 'SELL')),
  quantity     numeric(20, 8) not null check (quantity > 0),
  limit_price  numeric(20, 8) not null check (limit_price > 0),
  status       text not null default 'pending' check (status in ('pending', 'filled', 'canceled')),
  created_at   timestamptz not null default now(),
  filled_at    timestamptz,
  filled_price numeric(20, 8)
);

create index if not exists orders_account_status_idx on public.orders (account_id, status);

alter table public.orders enable row level security;

-- Owners can read/insert/update/delete their own account's orders.
-- (owns_account() is defined in schema.sql.)
drop policy if exists "orders_all_own" on public.orders;
create policy "orders_all_own" on public.orders
  for all using (public.owns_account(account_id)) with check (public.owns_account(account_id));
