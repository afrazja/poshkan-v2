-- Optional timed auto-close on a forex position: the worker closes it at market
-- once auto_close_at passes. Run after forex-sltp.sql.

alter table public.fx_positions add column if not exists auto_close_at timestamptz;

-- Set (or clear) the auto-close timer on an open position. p_minutes null/<=0 clears.
create or replace function public.fx_set_auto_close(p_position_id uuid, p_minutes integer)
returns void
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
  update public.fx_positions
    set auto_close_at = case
      when p_minutes is null or p_minutes <= 0 then null
      else now() + make_interval(mins => p_minutes)
    end
    where id = p_position_id;
end;
$$;
