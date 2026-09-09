-- Guarded MCP crypto positions. Run after the existing forex/hardening/timed-close migrations.
-- A dedicated service-role RPC avoids the legacy fx_open implementation's fixed 30x margin.
-- The account lock serializes cash reservation and the one-position check.
begin;

-- Preserve the old integer capacity while supporting fractional crypto quantities.
alter table public.fx_positions alter column units type numeric(28, 8);

create or replace function public.mcp_open_crypto_position(
  p_account_id uuid, p_symbol text, p_direction text, p_units numeric,
  p_rate numeric, p_leverage integer, p_stop_loss numeric, p_take_profit numeric,
  p_auto_close_minutes integer default 4320, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_account public.accounts%rowtype;
  v_rate numeric := round(p_rate, 6);
  v_sl numeric := round(p_stop_loss, 6);
  v_tp numeric := round(p_take_profit, 6);
  v_margin numeric;
  v_risk numeric;
  v_rr numeric;
  v_id uuid;
  v_deadline timestamptz := now() + make_interval(mins => p_auto_close_minutes);
begin
  if p_units is null or p_units <= 0 or p_units >= 1e18 or p_units != round(p_units, 8) then
    raise exception 'Units must be positive with at most 8 decimal places';
  end if;
  if v_rate is null or v_rate <= 0 or v_rate >= 1e14 or
     v_sl is null or v_sl <= 0 or v_sl >= 1e14 or
     v_tp is null or v_tp <= 0 or v_tp >= 1e14 then
    raise exception 'Valid entry, stop-loss and take-profit prices are required';
  end if;
  if p_direction is null or p_direction not in ('LONG', 'SHORT') then
    raise exception 'Direction must be LONG or SHORT';
  end if;
  if p_leverage is null or p_leverage not in (1, 2) then
    raise exception 'Leverage must be 1x or 2x';
  end if;
  if p_auto_close_minutes is null or p_auto_close_minutes < 1 or p_auto_close_minutes > 8640 then
    raise exception 'Holding time must be between 1 minute and 6 days';
  end if;
  if p_symbol is null or upper(trim(p_symbol)) !~ '^[A-Z0-9]+-USD$' then
    raise exception 'Use a USD-quoted crypto symbol';
  end if;
  if (p_direction = 'LONG' and (v_sl >= v_rate or v_tp <= v_rate)) or
     (p_direction = 'SHORT' and (v_sl <= v_rate or v_tp >= v_rate)) then
    raise exception 'Stop and target must bracket the entry in the trade direction';
  end if;

  select * into v_account from public.accounts where id = p_account_id for update;
  if not found or v_account.type != 'crypto' then raise exception 'Crypto account not found'; end if;
  if exists (select 1 from public.fx_positions where account_id = p_account_id and status = 'open') or
     exists (select 1 from public.fx_orders where account_id = p_account_id and status = 'pending') then
    raise exception 'An open leveraged position or pending entry already exists';
  end if;

  v_margin := round(p_units * v_rate / p_leverage, 2);
  v_risk := p_units * abs(v_rate - v_sl);
  v_rr := abs(v_tp - v_rate) / abs(v_rate - v_sl);
  if v_margin <= 0 or v_margin > v_account.cash_balance * 0.25 then
    raise exception 'Margin must be positive and no more than 25%% of available cash';
  end if;
  if v_risk > v_account.cash_balance * 0.005 then
    raise exception 'Planned stop-loss risk exceeds 0.5%% of available cash';
  end if;
  if v_rr < 3 then raise exception 'Planned reward/risk must be at least 3:1'; end if;

  if not coalesce(p_dry_run, false) then
    update public.accounts set cash_balance = cash_balance - v_margin where id = p_account_id;
    insert into public.fx_positions
      (account_id, symbol, direction, units, open_rate, margin, stop_loss, take_profit, auto_close_at)
    values
      (p_account_id, upper(trim(p_symbol)), p_direction, p_units, v_rate, v_margin, v_sl, v_tp, v_deadline)
    returning id into v_id;
  end if;
  return jsonb_build_object(
    'opened', not coalesce(p_dry_run, false), 'dry_run', coalesce(p_dry_run, false),
    'position_id', v_id, 'symbol', upper(trim(p_symbol)), 'direction', p_direction,
    'units', p_units, 'open_rate', v_rate, 'margin', v_margin, 'leverage', p_leverage,
    'stop_loss', v_sl, 'take_profit', v_tp, 'planned_risk_usd', v_risk,
    'reward_risk', v_rr, 'auto_close_at', v_deadline
  );
end;
$$;

-- MCP authenticates the token and checks account ownership before invoking this RPC.
-- Only the service role may supply an execution price, fetched by the MCP server.
revoke execute on function public.mcp_open_crypto_position(uuid, text, text, numeric, numeric, integer, numeric, numeric, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.mcp_open_crypto_position(uuid, text, text, numeric, numeric, integer, numeric, numeric, integer, boolean)
  to service_role;

commit;
