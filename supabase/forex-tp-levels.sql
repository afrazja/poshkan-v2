-- Scaled take-profit ("scale out") for forex positions: multiple TP levels, each
-- closing a portion of the position when its price is hit. Run AFTER forex-sltp.sql
-- and forex-pairs.sql.

create table if not exists public.fx_tp_levels (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.fx_positions (id) on delete cascade,
  price       numeric(20, 6) not null check (price > 0),
  close_units numeric(20, 2) not null check (close_units > 0),
  status      text not null default 'pending' check (status in ('pending', 'filled')),
  created_at  timestamptz not null default now(),
  filled_at   timestamptz
);
create index if not exists fx_tp_levels_pos_idx on public.fx_tp_levels (position_id, status);

alter table public.fx_tp_levels enable row level security;
drop policy if exists "fx_tp_select_own" on public.fx_tp_levels;
create policy "fx_tp_select_own" on public.fx_tp_levels
  for select using (exists (
    select 1 from public.fx_positions p
    where p.id = position_id and public.owns_account(p.account_id)
  ));
-- All writes go through the security-definer RPCs below.

-- Replace the pending TP levels for a position. p_levels = [{price, units}, ...].
-- Setting levels clears any single take_profit (scaled TP supersedes it).
create or replace function public.fx_set_tp_levels(
  p_position_id uuid, p_levels jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  pos public.fx_positions%rowtype;
  lvl jsonb;
  v_price numeric;
  v_units numeric;
  v_total numeric := 0;
begin
  select * into pos from public.fx_positions
    where id = p_position_id and status = 'open' for update;
  if not found then raise exception 'Position not found'; end if;
  if auth.uid() is not null and not public.owns_account(pos.account_id) then
    raise exception 'Position not found';
  end if;

  delete from public.fx_tp_levels where position_id = p_position_id and status = 'pending';

  for lvl in select * from jsonb_array_elements(coalesce(p_levels, '[]'::jsonb)) loop
    v_price := (lvl->>'price')::numeric;
    v_units := (lvl->>'units')::numeric;
    if v_price is null or v_price <= 0 or v_units is null or v_units <= 0 then continue; end if;
    if pos.direction = 'LONG' and v_price <= pos.open_rate then
      raise exception 'Take-profit levels must be above the open rate for a long';
    end if;
    if pos.direction = 'SHORT' and v_price >= pos.open_rate then
      raise exception 'Take-profit levels must be below the open rate for a short';
    end if;
    v_total := v_total + v_units;
    insert into public.fx_tp_levels (position_id, price, close_units)
      values (p_position_id, v_price, v_units);
  end loop;

  if v_total > pos.units then
    raise exception 'Take-profit amounts exceed the position size';
  end if;

  -- Scaled TP supersedes the single take_profit.
  if v_total > 0 then
    update public.fx_positions set take_profit = null where id = p_position_id;
  end if;
end;
$$;

-- Close p_close_units of a position at p_rate (partial scale-out). Realizes
-- proportional P&L (currency-aware) + releases proportional margin to cash, then
-- shrinks the position (recording the closed slice as its own history row). If
-- the slice is the whole remaining position, closes it outright.
create or replace function public.fx_close_partial(
  p_position_id uuid, p_close_units numeric, p_rate numeric, p_reason text default 'tp'
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  pos public.fx_positions%rowtype;
  v_pnl numeric;
  v_units numeric;
  v_margin numeric;
begin
  select * into pos from public.fx_positions
    where id = p_position_id and status = 'open' for update;
  if not found then return null; end if;
  if auth.uid() is not null and not public.owns_account(pos.account_id) then
    raise exception 'Position not found';
  end if;
  if p_rate is null or p_rate <= 0 then raise exception 'Invalid rate'; end if;
  if p_reason not in ('closed', 'stopped', 'sl', 'tp') then p_reason := 'tp'; end if;

  v_units := least(p_close_units, pos.units);
  if v_units <= 0 then return 0; end if;

  v_pnl := (p_rate - pos.open_rate) * v_units;            -- quote currency
  if left(upper(pos.symbol), 3) = 'USD' then v_pnl := v_pnl / p_rate; end if;
  if pos.direction = 'SHORT' then v_pnl := -v_pnl; end if;
  v_margin := round(pos.margin * v_units / pos.units, 2);
  v_pnl := greatest(v_pnl, -v_margin);                   -- stop-out floor

  update public.accounts
    set cash_balance = cash_balance + v_margin + v_pnl
    where id = pos.account_id;

  if v_units >= pos.units then
    update public.fx_positions
      set status = p_reason, closed_at = now(), close_rate = p_rate, pnl = v_pnl
      where id = pos.id;
  else
    insert into public.fx_positions
      (account_id, symbol, direction, units, open_rate, margin, status, opened_at, closed_at, close_rate, pnl)
      values (pos.account_id, pos.symbol, pos.direction, v_units, pos.open_rate, v_margin,
              p_reason, pos.opened_at, now(), p_rate, v_pnl);
    update public.fx_positions
      set units = units - v_units, margin = margin - v_margin
      where id = pos.id;
  end if;
  return v_pnl;
end;
$$;
