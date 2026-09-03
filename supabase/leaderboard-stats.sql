-- ============================================================================
-- Leaderboard, second pass: HOW a return was made, not just how big it is.
-- Run in the Supabase SQL editor after leaderboard.sql.
--
-- A return on its own rewards recklessness. Someone who put everything into
-- one leveraged position and got lucky outranks someone who ground out half
-- as much without ever risking the account — and a beginner reading the board
-- learns exactly the wrong lesson from it. These columns give the context that
-- makes a number judgeable:
--
--   trades         how much they actually did (a patient holder vs a churner)
--   open_positions how concentrated they are right now
--   days_active    +40% in three days is not +40% over six months
--   max_drawdown   how far down they went to get there — the price of the rank
--
-- NONE of it exposes a position: no symbol, no price, no size, no direction.
-- You learn how someone plays, never what they hold. That is the whole point —
-- the board should teach method without giving away anyone's homework.
--
-- The return type changes, so the old function must be dropped first; Postgres
-- cannot CREATE OR REPLACE a function into a different RETURNS TABLE.
-- ============================================================================

-- Opting out. Not every account is a contestant: some exist to watch over
-- someone else's, or to try something out. An account nobody is competing with
-- should not sit at the top of a public board pretending to.
alter table public.accounts
  add column if not exists hidden_from_leaderboard boolean not null default false;

drop function if exists public.get_leaderboard();

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
  as_of date,
  trades integer,
  open_positions integer,
  days_active integer,
  max_drawdown_pct numeric,
  trades_per_month numeric,
  style text
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
  -- Activity since the last reset: buys and sells, plus every leveraged
  -- position opened. Counts only, never what was traded.
  activity as (
    select a.id as account_id,
           (
             select count(*) from public.transactions t
             left join last_reset lr2 on lr2.account_id = t.account_id
             where t.account_id = a.id
               and t.side in ('BUY', 'SELL')
               and (lr2.reset_at is null or t.created_at >= lr2.reset_at)
           )
           + (
             select count(*) from public.fx_positions f
             left join last_reset lr3 on lr3.account_id = f.account_id
             where f.account_id = a.id
               and (lr3.reset_at is null or f.opened_at >= lr3.reset_at)
           ) as trades,
           (
             select count(*) from public.positions p where p.account_id = a.id
           )
           + (
             select count(*) from public.fx_positions f2
             where f2.account_id = a.id and f2.status = 'open'
           ) as open_positions,
           (
             select greatest(1, (current_date - min(t2.created_at)::date))
             from public.transactions t2
             left join last_reset lr4 on lr4.account_id = t2.account_id
             where t2.account_id = a.id
               and (lr4.reset_at is null or t2.created_at >= lr4.reset_at)
           ) as days_active
    from public.accounts a
  ),
  -- Worst peak-to-trough dip across the nightly snapshots: the drop a holder
  -- actually lived through on the way to the number in the Return column.
  drawdown as (
    select x.account_id, min(x.dip) as worst
    from (
      select s.account_id,
             s.total_value / nullif(
               max(s.total_value) over (
                 partition by s.account_id
                 order by s.snapshot_date
                 rows between unbounded preceding and current row
               ), 0
             ) - 1 as dip
      from public.account_snapshots s
    ) x
    group by x.account_id
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
    coalesce(ls.snapshot_date, current_date) as as_of,
    coalesce(act.trades, 0)::integer as trades,
    coalesce(act.open_positions, 0)::integer as open_positions,
    coalesce(act.days_active, 1)::integer as days_active,
    round(coalesce(dd.worst, 0) * 100, 2) as max_drawdown_pct,
    -- Turnover is the honest way to tell an investor from a trader: it is
    -- measured from what they did, not chosen by them. Anyone allowed to
    -- declare their own style picks whichever league they are winning.
    round(
      coalesce(act.trades, 0)::numeric
        / greatest(coalesce(act.days_active, 1)::numeric / 30.44, 0.25),
      1
    ) as trades_per_month,
    case
      when coalesce(act.trades, 0)::numeric
             / greatest(coalesce(act.days_active, 1)::numeric / 30.44, 0.25) < 2
      then 'investor'
      else 'trader'
    end as style
  from public.accounts a
  join public.profiles pr on pr.id = a.user_id
  join contrib c on c.account_id = a.id and c.contributions > 0
    and a.hidden_from_leaderboard = false
  left join latest_snap ls on ls.account_id = a.id
  left join fallback fb on fb.account_id = a.id
  left join activity act on act.account_id = a.id
  left join drawdown dd on dd.account_id = a.id
  order by return_pct desc, total_value desc
$$;

revoke all on function public.get_leaderboard() from public, anon;
grant execute on function public.get_leaderboard() to authenticated;
