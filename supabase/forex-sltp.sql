-- ============================================================================
-- Stop-loss / take-profit for forex positions.
-- Run in the Supabase SQL editor AFTER forex.sql (additive — safe on live data).
-- ============================================================================
alter table public.fx_positions add column if not exists stop_loss   numeric(20, 6);
alter table public.fx_positions add column if not exists take_profit numeric(20, 6);

-- Allow the two new auto-close outcomes.
alter table public.fx_positions drop constraint if exists fx_positions_status_check;
alter table public.fx_positions add constraint fx_positions_status_check
  check (status in ('open', 'closed', 'stopped', 'sl', 'tp'));

-- fx_open now accepts optional SL/TP (validated against the open rate).
drop function if exists public.fx_open(uuid, text, text, numeric, numeric, numeric);
create or replace function public.fx_open(
  p_account_id uuid, p_symbol text, p_direction text, p_units numeric,
  p_rate numeric, p_margin numeric,
  p_stop_loss numeric default null, p_take_profit numeric default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cash numeric;
  v_id uuid;
begin
  if auth.uid() is not null and not public.owns_account(p_account_id) then
    raise exception 'Account not found';
  end if;
  if p_units is null or p_units <= 0 then raise exception 'Units must be positive'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Invalid rate'; end if;
  if p_margin is null or p_margin <= 0 then raise exception 'Invalid margin'; end if;
  if p_direction not in ('LONG', 'SHORT') then raise exception 'Invalid direction'; end if;

  -- SL/TP must sit on the losing/winning side of the open rate respectively.
  if p_direction = 'LONG' then
    if p_stop_loss is not null and p_stop_loss >= p_rate then
      raise exception 'Stop-loss must be below the current rate for a long';
    end if;
    if p_take_profit is not null and p_take_profit <= p_rate then
      raise exception 'Take-profit must be above the current rate for a long';
    end if;
  else
    if p_stop_loss is not null and p_stop_loss <= p_rate then
      raise exception 'Stop-loss must be above the current rate for a short';
    end if;
    if p_take_profit is not null and p_take_profit >= p_rate then
      raise exception 'Take-profit must be below the current rate for a short';
    end if;
  end if;

  select cash_balance into v_cash from public.accounts where id = p_account_id for update;
  if v_cash < p_margin then
    raise exception 'Insufficient free cash for margin: need %, have %', p_margin, v_cash;
  end if;

  update public.accounts set cash_balance = cash_balance - p_margin where id = p_account_id;
  insert into public.fx_positions
    (account_id, symbol, direction, units, open_rate, margin, stop_loss, take_profit)
  values
    (p_account_id, upper(trim(p_symbol)), p_direction, p_units, p_rate, p_margin,
     p_stop_loss, p_take_profit)
  returning id into v_id;
  return v_id;
end;
$$;

-- fx_close now records WHY it closed: 'closed' (manual) | 'stopped' | 'sl' | 'tp'.
drop function if exists public.fx_close(uuid, numeric, boolean);
create or replace function public.fx_close(
  p_position_id uuid, p_rate numeric, p_reason text default 'closed'
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
  if p_reason not in ('closed', 'stopped', 'sl', 'tp') then p_reason := 'closed'; end if;

  v_pnl := (p_rate - pos.open_rate) * pos.units;
  if pos.direction = 'SHORT' then v_pnl := -v_pnl; end if;
  v_pnl := greatest(v_pnl, -pos.margin);  -- stop-out floor

  update public.accounts
    set cash_balance = cash_balance + pos.margin + v_pnl
    where id = pos.account_id;

  update public.fx_positions
    set status = p_reason, closed_at = now(), close_rate = p_rate, pnl = v_pnl
    where id = pos.id;
  return v_pnl;
end;
$$;

-- Set/clear SL/TP on an open position (validated against the live rate the
-- server fetched). Null clears the level.
create or replace function public.fx_set_sltp(
  p_position_id uuid, p_rate numeric, p_stop_loss numeric, p_take_profit numeric
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  pos public.fx_positions%rowtype;
begin
  select * into pos from public.fx_positions
    where id = p_position_id and status = 'open' for update;
  if not found then raise exception 'Position not found'; end if;
  if auth.uid() is not null and not public.owns_account(pos.account_id) then
    raise exception 'Position not found';
  end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Invalid rate'; end if;

  if pos.direction = 'LONG' then
    if p_stop_loss is not null and p_stop_loss >= p_rate then
      raise exception 'Stop-loss must be below the current rate for a long';
    end if;
    if p_take_profit is not null and p_take_profit <= p_rate then
      raise exception 'Take-profit must be above the current rate for a long';
    end if;
  else
    if p_stop_loss is not null and p_stop_loss <= p_rate then
      raise exception 'Stop-loss must be above the current rate for a short';
    end if;
    if p_take_profit is not null and p_take_profit >= p_rate then
      raise exception 'Take-profit must be below the current rate for a short';
    end if;
  end if;

  update public.fx_positions
    set stop_loss = p_stop_loss, take_profit = p_take_profit
    where id = pos.id;
end;
$$;
