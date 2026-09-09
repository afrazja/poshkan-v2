-- Run AFTER mcp-crypto-risk.sql. Durable claims and atomic cloud-trade receipts.
begin;
alter table public.fx_positions add column if not exists source text;

create table if not exists public.crypto_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  slot timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','blocked','failed','opened')),
  report jsonb not null default '{}'::jsonb,
  position_id uuid references public.fx_positions(id) on delete set null,
  unique(account_id, slot)
);
alter table public.crypto_monitor_runs enable row level security;
drop policy if exists "Owner can read crypto monitor runs" on public.crypto_monitor_runs;
create policy "Owner can read crypto monitor runs" on public.crypto_monitor_runs
  for select to authenticated using (public.owns_account(account_id));
revoke all on public.crypto_monitor_runs from public, anon, authenticated;
grant select on public.crypto_monitor_runs to authenticated;
grant all on public.crypto_monitor_runs to service_role;

create or replace function public.claim_crypto_monitor(p_account_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slot timestamptz;
begin
  perform 1 from public.accounts where id=p_account_id and type='crypto' for update;
  if not found then raise exception 'Crypto account not found'; end if;
  v_slot := date_bin(interval '30 minutes', now(), timestamptz '2020-01-01');
  -- A delayed prior-slot worker cannot overlap a new claim while it can execute.
  if exists (select 1 from public.crypto_monitor_runs where account_id=p_account_id
             and status='running' and started_at > now()-interval '5 minutes') then return null; end if;
  insert into public.crypto_monitor_runs(account_id,slot) values(p_account_id,v_slot)
    on conflict(account_id,slot) do nothing returning id into v_id;
  return v_id;
end; $$;

create or replace function public.open_cloud_crypto(
  p_run_id uuid, p_symbol text, p_direction text, p_units numeric,
  p_rate numeric, p_stop_loss numeric, p_take_profit numeric, p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run public.crypto_monitor_runs%rowtype; v_result jsonb;
begin
  -- Match the account -> run lock order used by claims to avoid deadlocks.
  perform 1 from public.accounts where id=(select account_id from public.crypto_monitor_runs where id=p_run_id) for update;
  select * into v_run from public.crypto_monitor_runs where id=p_run_id for update;
  if not found then raise exception 'Cloud run not found'; end if;
  -- A retry receives its original receipt, even if that position has since closed.
  if v_run.status='opened' then return v_run.report->'fill'; end if;
  if v_run.status!='running' or v_run.started_at < now()-interval '5 minutes' then raise exception 'Cloud run expired or already settled'; end if;
  if exists (select 1 from public.accounts where id=v_run.account_id and auto_trade_enabled) then
    raise exception 'Disable legacy AI auto-trading before cloud entries';
  end if;
  if p_symbol not in ('BTC-USD','ETH-USD','SOL-USD') then raise exception 'Unsupported cloud crypto symbol'; end if;
  v_result := public.mcp_open_crypto_position(v_run.account_id,p_symbol,p_direction,p_units,p_rate,2,p_stop_loss,p_take_profit,4320,coalesce(p_dry_run,true));
  if not coalesce(p_dry_run,true) then
    update public.fx_positions set source='cloud_crypto' where id=(v_result->>'position_id')::uuid;
    update public.crypto_monitor_runs set status='opened', finished_at=now(),
      position_id=(v_result->>'position_id')::uuid, report=jsonb_build_object('fill',v_result) where id=p_run_id;
  end if;
  return v_result;
end; $$;

revoke execute on function public.claim_crypto_monitor(uuid) from public, anon, authenticated;
grant execute on function public.claim_crypto_monitor(uuid) to service_role;
revoke execute on function public.open_cloud_crypto(uuid,text,text,numeric,numeric,numeric,numeric,boolean) from public, anon, authenticated;
grant execute on function public.open_cloud_crypto(uuid,text,text,numeric,numeric,numeric,numeric,boolean) to service_role;
commit;
