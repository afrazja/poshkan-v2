-- ============================================================================
-- Leaderboard: rank all accounts by % return.
-- Run in the Supabase SQL editor (after the other migrations).
--
-- Return % = (current value − contributions) / contributions, where
-- contributions = opening cash + opening holdings at cost + deposits,
-- counted since the most recent RESET (a reset starts the account fresh).
-- Value = latest daily snapshot; falls back to cash + holdings at cost
-- (+ open forex margin) for accounts without a snapshot yet.
-- Security definer so users can see each other's standings — it exposes ONLY
-- username, account name/type, value, and return.
-- ============================================================================
create or replace function public.get_leaderboard()
returns table (
  account_id uuid,
  user_id uuid,
  username text,
  account_name text,
  account_type text,
  total_value numeric,
  contributions numeric,
  return_pct numeric,
  as_of date
)
language sql
security definer set search_path = public
stable
as $$
  with last_reset as (
    select t.account_id, max(t.created_at) as reset_at
    from public.transactions t
    where t.side = 'RESET'
    group by t.account_id
  ),
  contrib as (
    select t.account_id,
           sum(
             case
               when t.side = 'RESET' then t.cash_delta
               when t.side = 'DEPOSIT' then t.cash_delta
               when t.side = 'OPENING_BALANCE' and t.symbol is null then t.cash_delta
               when t.side = 'OPENING_BALANCE' then t.quantity * t.price
               else 0
             end
           ) as contributions
    from public.transactions t
    left join last_reset lr on lr.account_id = t.account_id
    where lr.reset_at is null or t.created_at >= lr.reset_at
    group by t.account_id
  ),
  latest_snap as (
    select distinct on (s.account_id) s.account_id, s.total_value, s.snapshot_date
    from public.account_snapshots s
    order by s.account_id, s.snapshot_date desc
  ),
  fallback as (
    select a.id as account_id,
           a.cash_balance
           + coalesce((select sum(p.quantity * p.avg_cost) from public.positions p where p.account_id = a.id), 0)
           + coalesce((select sum(f.margin) from public.fx_positions f where f.account_id = a.id and f.status = 'open'), 0)
           as value
    from public.accounts a
  )
  select
    a.id as account_id,
    a.user_id,
    pr.username,
    a.name as account_name,
    a.type as account_type,
    round(coalesce(
      case when a.type = 'forex' then fb.value else coalesce(ls.total_value, fb.value) end, 0
    ), 2) as total_value,
    round(c.contributions, 2) as contributions,
    round(
      (coalesce(
        case when a.type = 'forex' then fb.value else coalesce(ls.total_value, fb.value) end, 0
      ) - c.contributions) / c.contributions * 100, 2
    ) as return_pct,
    coalesce(ls.snapshot_date, current_date) as as_of
  from public.accounts a
  join public.profiles pr on pr.id = a.user_id
  join contrib c on c.account_id = a.id and c.contributions > 0
  left join latest_snap ls on ls.account_id = a.id
  left join fallback fb on fb.account_id = a.id
  order by return_pct desc, total_value desc
$$;

revoke all on function public.get_leaderboard() from public, anon;
grant execute on function public.get_leaderboard() to authenticated;
