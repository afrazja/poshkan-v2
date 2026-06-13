-- Expand forex to the 7 majors. The only money-math change is on close:
-- USD-base pairs (USD/JPY, USD/CHF, USD/CAD) realize P&L in the quote currency,
-- so convert it to USD at the close rate. XXX/USD pairs are unchanged.
-- (Margin is computed app-side in marginFor() and already passed in, so fx_open
-- needs no change.)

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

  v_pnl := (p_rate - pos.open_rate) * pos.units;  -- in the quote currency
  -- USD/XXX pairs: P&L is in the quote currency — convert to USD at the rate.
  if left(upper(pos.symbol), 3) = 'USD' then
    v_pnl := v_pnl / p_rate;
  end if;
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
