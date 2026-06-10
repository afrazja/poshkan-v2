-- ============================================================================
-- Security & correctness hardening (run AFTER all previous migrations).
-- 1) fx RPCs were callable by the anon role; their service-role bypass
--    (auth.uid() IS NULL) was therefore reachable by unauthenticated callers.
-- 2) fx_open now derives margin server-side instead of trusting the caller.
-- 3) RESET now also closes forex state (positions deleted, margin not
--    refundable into the fresh balance) and cancels all pending orders.
-- ============================================================================

-- 1) Lock down the forex RPCs.
revoke execute on function public.fx_open(uuid, text, text, numeric, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.fx_open(uuid, text, text, numeric, numeric, numeric, numeric, numeric)
  to authenticated, service_role;

revoke execute on function public.fx_close(uuid, numeric, text) from public, anon;
grant execute on function public.fx_close(uuid, numeric, text) to authenticated, service_role;

revoke execute on function public.fx_set_sltp(uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.fx_set_sltp(uuid, numeric, numeric, numeric) to authenticated, service_role;

-- 2) fx_open: margin is now computed in-database (30:1) — p_margin is ignored.
create or replace function public.fx_open(
  p_account_id uuid, p_symbol text, p_direction text, p_units numeric,
  p_rate numeric, p_margin numeric,
  p_stop_loss numeric default null, p_take_profit numeric default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cash numeric;
  v_margin numeric;
  v_id uuid;
begin
  if auth.uid() is not null and not public.owns_account(p_account_id) then
    raise exception 'Account not found';
  end if;
  if p_units is null or p_units <= 0 then raise exception 'Units must be positive'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Invalid rate'; end if;
  if p_direction not in ('LONG', 'SHORT') then raise exception 'Invalid direction'; end if;

  -- Server-derived margin (matches lib/forex.ts marginFor: notional / 30, cents).
  v_margin := round((p_units * p_rate) / 30.0, 2);
  if v_margin <= 0 then raise exception 'Position too small'; end if;

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
  if v_cash < v_margin then
    raise exception 'Insufficient free cash for margin: need %, have %', v_margin, v_cash;
  end if;

  update public.accounts set cash_balance = cash_balance - v_margin where id = p_account_id;
  insert into public.fx_positions
    (account_id, symbol, direction, units, open_rate, margin, stop_loss, take_profit)
  values
    (p_account_id, upper(trim(p_symbol)), p_direction, p_units, p_rate, v_margin,
     p_stop_loss, p_take_profit)
  returning id into v_id;
  return v_id;
end;
$$;

-- 3) RESET starts the account truly flat: forex positions deleted (their margin
--    is NOT carried into the new balance) and every pending order canceled.
create or replace function public.adjust_cash(
  p_account_id uuid,
  p_mode text,
  p_amount numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.owns_account(p_account_id) then
    raise exception 'Account not found';
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception 'Amount cannot be negative';
  end if;

  if p_mode = 'DEPOSIT' then
    update public.accounts set cash_balance = cash_balance + p_amount
      where id = p_account_id;
    insert into public.transactions (account_id, side, cash_delta)
    values (p_account_id, 'DEPOSIT', p_amount);

  elsif p_mode = 'RESET' then
    delete from public.positions where account_id = p_account_id;
    delete from public.fx_positions where account_id = p_account_id;
    update public.orders set status = 'canceled'
      where account_id = p_account_id and status = 'pending';
    update public.fx_orders set status = 'canceled'
      where account_id = p_account_id and status = 'pending';
    update public.accounts set cash_balance = p_amount where id = p_account_id;
    insert into public.transactions (account_id, side, cash_delta)
    values (p_account_id, 'RESET', p_amount);

  else
    raise exception 'Invalid mode: %', p_mode;
  end if;
end;
$$;
