-- ============================================================================
-- Upgrades: daily snapshots, price alerts, server-side limit-order fills.
-- Run this in the Supabase SQL editor (after schema.sql and orders.sql).
-- ============================================================================

-- Daily account-value snapshots (written by the snapshot cron via service role).
create table if not exists public.account_snapshots (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts (id) on delete cascade,
  snapshot_date  date not null,
  total_value    numeric(20, 8) not null,
  cash           numeric(20, 8) not null,
  holdings_value numeric(20, 8) not null,
  created_at     timestamptz not null default now(),
  unique (account_id, snapshot_date)
);
create index if not exists snapshots_account_idx
  on public.account_snapshots (account_id, snapshot_date);

alter table public.account_snapshots enable row level security;
drop policy if exists "snapshots_select_own" on public.account_snapshots;
create policy "snapshots_select_own" on public.account_snapshots
  for select using (public.owns_account(account_id));
-- No insert/update policies: only the service role (cron) writes snapshots.

-- Price alerts (per user).
create table if not exists public.alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  symbol          text not null,
  condition       text not null check (condition in ('ABOVE', 'BELOW')),
  target_price    numeric(20, 8) not null check (target_price > 0),
  status          text not null default 'active' check (status in ('active', 'triggered')),
  created_at      timestamptz not null default now(),
  triggered_at    timestamptz,
  triggered_price numeric(20, 8)
);
create index if not exists alerts_user_idx on public.alerts (user_id, status);

alter table public.alerts enable row level security;
drop policy if exists "alerts_all_own" on public.alerts;
create policy "alerts_all_own" on public.alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- system_fill_order: atomically fill a pending limit order at p_price.
-- Mirrors execute_trade but skips the owns_account check — it is ONLY callable
-- by the service role (cron); execute is revoked from client roles below.
-- ============================================================================
create or replace function public.system_fill_order(p_order_id uuid, p_price numeric)
returns text  -- 'filled' | 'canceled' | 'skipped'
language plpgsql
security definer set search_path = public
as $$
declare
  o          public.orders%rowtype;
  v_cash     numeric;
  v_pos_qty  numeric;
  v_pos_avg  numeric;
  v_cost     numeric;
begin
  select * into o from public.orders
    where id = p_order_id and status = 'pending' for update;
  if not found then return 'skipped'; end if;
  if p_price is null or p_price <= 0 then return 'skipped'; end if;

  -- Re-check the limit condition with the price the server fetched.
  if o.side = 'BUY'  and p_price > o.limit_price then return 'skipped'; end if;
  if o.side = 'SELL' and p_price < o.limit_price then return 'skipped'; end if;

  select cash_balance into v_cash from public.accounts where id = o.account_id for update;
  select quantity, avg_cost into v_pos_qty, v_pos_avg from public.positions
    where account_id = o.account_id and symbol = o.symbol for update;

  v_cost := o.quantity * p_price;

  if o.side = 'BUY' then
    if v_cash < v_cost then
      update public.orders set status = 'canceled' where id = o.id;
      return 'canceled';
    end if;
    update public.accounts set cash_balance = cash_balance - v_cost where id = o.account_id;
    if v_pos_qty is null then
      insert into public.positions (account_id, symbol, quantity, avg_cost)
      values (o.account_id, o.symbol, o.quantity, p_price);
    else
      update public.positions
        set quantity = v_pos_qty + o.quantity,
            avg_cost = ((v_pos_qty * v_pos_avg) + v_cost) / (v_pos_qty + o.quantity)
        where account_id = o.account_id and symbol = o.symbol;
    end if;
    insert into public.transactions (account_id, symbol, side, quantity, price, cash_delta)
    values (o.account_id, o.symbol, 'BUY', o.quantity, p_price, -v_cost);
  else
    if v_pos_qty is null or v_pos_qty < o.quantity then
      update public.orders set status = 'canceled' where id = o.id;
      return 'canceled';
    end if;
    update public.accounts set cash_balance = cash_balance + v_cost where id = o.account_id;
    if v_pos_qty = o.quantity then
      delete from public.positions where account_id = o.account_id and symbol = o.symbol;
    else
      update public.positions set quantity = v_pos_qty - o.quantity
        where account_id = o.account_id and symbol = o.symbol;
    end if;
    insert into public.transactions (account_id, symbol, side, quantity, price, cash_delta)
    values (o.account_id, o.symbol, 'SELL', o.quantity, p_price, v_cost);
  end if;

  update public.orders
    set status = 'filled', filled_at = now(), filled_price = p_price
    where id = o.id;
  return 'filled';
end;
$$;

-- Only the service role may call it.
revoke execute on function public.system_fill_order(uuid, numeric) from public, anon, authenticated;
