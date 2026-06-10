-- ============================================================================
-- Forex engine (run in the Supabase SQL editor after schema.sql).
-- Separate from the stock engine: leveraged long/short pair positions with
-- margin reserved from cash. v1 trades USD-quoted majors only (EUR/USD, ...).
-- ============================================================================
create table if not exists public.fx_positions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  symbol      text not null,                 -- Yahoo symbol, e.g. 'EURUSD=X'
  direction   text not null check (direction in ('LONG', 'SHORT')),
  units       numeric(20, 2) not null check (units > 0),
  open_rate   numeric(20, 6) not null check (open_rate > 0),
  margin      numeric(20, 2) not null check (margin > 0),
  status      text not null default 'open' check (status in ('open', 'closed', 'stopped')),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  close_rate  numeric(20, 6),
  pnl         numeric(20, 2)
);
create index if not exists fx_positions_account_idx on public.fx_positions (account_id, status);

alter table public.fx_positions enable row level security;
drop policy if exists "fx_select_own" on public.fx_positions;
create policy "fx_select_own" on public.fx_positions
  for select using (public.owns_account(account_id));
-- All writes go through the RPCs below.

-- Open a leveraged position: reserve margin from cash.
create or replace function public.fx_open(
  p_account_id uuid, p_symbol text, p_direction text, p_units numeric,
  p_rate numeric, p_margin numeric
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cash numeric;
  v_id uuid;
begin
  -- Callable by the owner, or by the service role (auth.uid() is null).
  if auth.uid() is not null and not public.owns_account(p_account_id) then
    raise exception 'Account not found';
  end if;
  if p_units is null or p_units <= 0 then raise exception 'Units must be positive'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Invalid rate'; end if;
  if p_margin is null or p_margin <= 0 then raise exception 'Invalid margin'; end if;
  if p_direction not in ('LONG', 'SHORT') then raise exception 'Invalid direction'; end if;

  select cash_balance into v_cash from public.accounts where id = p_account_id for update;
  if v_cash < p_margin then
    raise exception 'Insufficient free cash for margin: need %, have %', p_margin, v_cash;
  end if;

  update public.accounts set cash_balance = cash_balance - p_margin where id = p_account_id;
  insert into public.fx_positions (account_id, symbol, direction, units, open_rate, margin)
  values (p_account_id, upper(trim(p_symbol)), p_direction, p_units, p_rate, p_margin)
  returning id into v_id;
  return v_id;
end;
$$;

-- Close (or stop-out) a position at p_rate: release margin +/- P&L to cash.
-- Loss is capped at the reserved margin so cash can never go negative.
create or replace function public.fx_close(
  p_position_id uuid, p_rate numeric, p_stopped boolean default false
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  pos public.fx_positions%rowtype;
  v_pnl numeric;
begin
  select * into pos from public.fx_positions
    where id = p_position_id and status = 'open' for update;
  if not found then return null; end if;
  if auth.uid() is not null and not public.owns_account(pos.account_id) then
    raise exception 'Position not found';
  end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Invalid rate'; end if;

  v_pnl := (p_rate - pos.open_rate) * pos.units;
  if pos.direction = 'SHORT' then v_pnl := -v_pnl; end if;
  v_pnl := greatest(v_pnl, -pos.margin);  -- stop-out floor

  update public.accounts
    set cash_balance = cash_balance + pos.margin + v_pnl
    where id = pos.account_id;

  update public.fx_positions
    set status = case when p_stopped then 'stopped' else 'closed' end,
        closed_at = now(), close_rate = p_rate, pnl = v_pnl
    where id = pos.id;
  return v_pnl;
end;
$$;
