-- Additive full-interface rehearsal. Existing trades and the original stage are preserved.
BEGIN;
DO $$ BEGIN IF to_regclass('poshkan_trade_test.profiles') IS NOT NULL THEN RAISE EXCEPTION 'Full app copy already exists'; END IF; IF NOT EXISTS (SELECT 1 FROM poshkan_stage.auth_links WHERE NOT application_access_enabled) THEN RAISE EXCEPTION 'Wrong migration state'; END IF; END $$;
CREATE TABLE poshkan_trade_test.profiles (LIKE poshkan_stage.profiles INCLUDING ALL);
INSERT INTO poshkan_trade_test.profiles SELECT * FROM poshkan_stage.profiles;
ALTER TABLE poshkan_trade_test.profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.watchlist (LIKE poshkan_stage.watchlist INCLUDING ALL);
INSERT INTO poshkan_trade_test.watchlist SELECT * FROM poshkan_stage.watchlist;
ALTER TABLE poshkan_trade_test.watchlist ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.alerts (LIKE poshkan_stage.alerts INCLUDING ALL);
INSERT INTO poshkan_trade_test.alerts SELECT * FROM poshkan_stage.alerts;
ALTER TABLE poshkan_trade_test.alerts ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.account_snapshots (LIKE poshkan_stage.account_snapshots INCLUDING ALL);
INSERT INTO poshkan_trade_test.account_snapshots SELECT * FROM poshkan_stage.account_snapshots;
ALTER TABLE poshkan_trade_test.account_snapshots ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.notifications (LIKE poshkan_stage.notifications INCLUDING ALL);
INSERT INTO poshkan_trade_test.notifications SELECT * FROM poshkan_stage.notifications;
ALTER TABLE poshkan_trade_test.notifications ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.custom_strategies (LIKE poshkan_stage.custom_strategies INCLUDING ALL);
INSERT INTO poshkan_trade_test.custom_strategies SELECT * FROM poshkan_stage.custom_strategies;
ALTER TABLE poshkan_trade_test.custom_strategies ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.custom_strategy_signals (LIKE poshkan_stage.custom_strategy_signals INCLUDING ALL);
INSERT INTO poshkan_trade_test.custom_strategy_signals SELECT * FROM poshkan_stage.custom_strategy_signals;
ALTER TABLE poshkan_trade_test.custom_strategy_signals ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.smc_settings (LIKE poshkan_stage.smc_settings INCLUDING ALL);
INSERT INTO poshkan_trade_test.smc_settings SELECT * FROM poshkan_stage.smc_settings;
ALTER TABLE poshkan_trade_test.smc_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.smc_signals (LIKE poshkan_stage.smc_signals INCLUDING ALL);
INSERT INTO poshkan_trade_test.smc_signals SELECT * FROM poshkan_stage.smc_signals;
ALTER TABLE poshkan_trade_test.smc_signals ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.ote_settings (LIKE poshkan_stage.ote_settings INCLUDING ALL);
INSERT INTO poshkan_trade_test.ote_settings SELECT * FROM poshkan_stage.ote_settings;
ALTER TABLE poshkan_trade_test.ote_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.ote_signals (LIKE poshkan_stage.ote_signals INCLUDING ALL);
INSERT INTO poshkan_trade_test.ote_signals SELECT * FROM poshkan_stage.ote_signals;
ALTER TABLE poshkan_trade_test.ote_signals ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.trend_settings (LIKE poshkan_stage.trend_settings INCLUDING ALL);
INSERT INTO poshkan_trade_test.trend_settings SELECT * FROM poshkan_stage.trend_settings;
ALTER TABLE poshkan_trade_test.trend_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.trend_signals (LIKE poshkan_stage.trend_signals INCLUDING ALL);
INSERT INTO poshkan_trade_test.trend_signals SELECT * FROM poshkan_stage.trend_signals;
ALTER TABLE poshkan_trade_test.trend_signals ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.meanrev_settings (LIKE poshkan_stage.meanrev_settings INCLUDING ALL);
INSERT INTO poshkan_trade_test.meanrev_settings SELECT * FROM poshkan_stage.meanrev_settings;
ALTER TABLE poshkan_trade_test.meanrev_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.meanrev_signals (LIKE poshkan_stage.meanrev_signals INCLUDING ALL);
INSERT INTO poshkan_trade_test.meanrev_signals SELECT * FROM poshkan_stage.meanrev_signals;
ALTER TABLE poshkan_trade_test.meanrev_signals ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.candlerange_settings (LIKE poshkan_stage.candlerange_settings INCLUDING ALL);
INSERT INTO poshkan_trade_test.candlerange_settings SELECT * FROM poshkan_stage.candlerange_settings;
ALTER TABLE poshkan_trade_test.candlerange_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.candlerange_signals (LIKE poshkan_stage.candlerange_signals INCLUDING ALL);
INSERT INTO poshkan_trade_test.candlerange_signals SELECT * FROM poshkan_stage.candlerange_signals;
ALTER TABLE poshkan_trade_test.candlerange_signals ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.api_tokens (LIKE poshkan_stage.api_tokens INCLUDING ALL);
INSERT INTO poshkan_trade_test.api_tokens SELECT * FROM poshkan_stage.api_tokens;
ALTER TABLE poshkan_trade_test.api_tokens ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.push_subscriptions (LIKE poshkan_stage.push_subscriptions INCLUDING ALL);
INSERT INTO poshkan_trade_test.push_subscriptions SELECT * FROM poshkan_stage.push_subscriptions;
ALTER TABLE poshkan_trade_test.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE TABLE poshkan_trade_test.email_prefs (LIKE poshkan_stage.email_prefs INCLUDING ALL);
INSERT INTO poshkan_trade_test.email_prefs SELECT * FROM poshkan_stage.email_prefs;
ALTER TABLE poshkan_trade_test.email_prefs ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION poshkan_trade_test.owns_account(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM poshkan_trade_test.accounts WHERE id=p_id AND user_id=poshkan_trade_test.actor()) $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.owns_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.owns_account(uuid) TO poshkan_trade_preview;
CREATE POLICY accounts_all_own ON poshkan_trade_test.accounts USING ((poshkan_trade_test.actor() = user_id)) WITH CHECK ((poshkan_trade_test.actor() = user_id));
CREATE POLICY alerts_all_own ON poshkan_trade_test.alerts USING ((poshkan_trade_test.actor() = user_id)) WITH CHECK ((poshkan_trade_test.actor() = user_id));
CREATE POLICY api_tokens_all_own ON poshkan_trade_test.api_tokens USING ((poshkan_trade_test.actor() = user_id)) WITH CHECK ((poshkan_trade_test.actor() = user_id));
CREATE POLICY custom_strategies_all_own ON poshkan_trade_test.custom_strategies USING (((poshkan_trade_test.actor() = user_id) AND poshkan_trade_test.owns_account(account_id))) WITH CHECK (((poshkan_trade_test.actor() = user_id) AND poshkan_trade_test.owns_account(account_id)));
CREATE POLICY custom_strategy_signals_read_own ON poshkan_trade_test.custom_strategy_signals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.custom_strategies strategy
  WHERE ((strategy.id = custom_strategy_signals.strategy_id) AND (strategy.user_id = poshkan_trade_test.actor())))));
CREATE POLICY fx_orders_all_own ON poshkan_trade_test.fx_orders USING (poshkan_trade_test.owns_account(account_id)) WITH CHECK (poshkan_trade_test.owns_account(account_id));
CREATE POLICY fx_select_own ON poshkan_trade_test.fx_positions FOR SELECT USING (poshkan_trade_test.owns_account(account_id));
CREATE POLICY fx_tp_select_own ON poshkan_trade_test.fx_tp_levels FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.fx_positions p
  WHERE ((p.id = fx_tp_levels.position_id) AND poshkan_trade_test.owns_account(p.account_id)))));
CREATE POLICY orders_all_own ON poshkan_trade_test.orders USING (poshkan_trade_test.owns_account(account_id)) WITH CHECK (poshkan_trade_test.owns_account(account_id));
CREATE POLICY "owner inserts candlerange_settings" ON poshkan_trade_test.candlerange_settings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = candlerange_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner inserts meanrev_settings" ON poshkan_trade_test.meanrev_settings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = meanrev_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner inserts ote_settings" ON poshkan_trade_test.ote_settings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = ote_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner inserts smc_settings" ON poshkan_trade_test.smc_settings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = smc_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner inserts trend_settings" ON poshkan_trade_test.trend_settings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = trend_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads candlerange_settings" ON poshkan_trade_test.candlerange_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = candlerange_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads candlerange_signals" ON poshkan_trade_test.candlerange_signals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = candlerange_signals.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads meanrev_settings" ON poshkan_trade_test.meanrev_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = meanrev_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads meanrev_signals" ON poshkan_trade_test.meanrev_signals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = meanrev_signals.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads notifications" ON poshkan_trade_test.notifications FOR SELECT USING ((user_id = poshkan_trade_test.actor()));
CREATE POLICY "owner reads ote_settings" ON poshkan_trade_test.ote_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = ote_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads ote_signals" ON poshkan_trade_test.ote_signals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = ote_signals.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads smc_settings" ON poshkan_trade_test.smc_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = smc_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads smc_signals" ON poshkan_trade_test.smc_signals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = smc_signals.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads trend_settings" ON poshkan_trade_test.trend_settings FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = trend_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner reads trend_signals" ON poshkan_trade_test.trend_signals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = trend_signals.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner updates candlerange_settings" ON poshkan_trade_test.candlerange_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = candlerange_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner updates meanrev_settings" ON poshkan_trade_test.meanrev_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = meanrev_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner updates notifications" ON poshkan_trade_test.notifications FOR UPDATE USING ((user_id = poshkan_trade_test.actor()));
CREATE POLICY "owner updates ote_settings" ON poshkan_trade_test.ote_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = ote_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner updates smc_settings" ON poshkan_trade_test.smc_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = smc_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY "owner updates trend_settings" ON poshkan_trade_test.trend_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM poshkan_trade_test.accounts a
  WHERE ((a.id = trend_settings.account_id) AND (a.user_id = poshkan_trade_test.actor())))));
CREATE POLICY positions_all_own ON poshkan_trade_test.positions USING (poshkan_trade_test.owns_account(account_id)) WITH CHECK (poshkan_trade_test.owns_account(account_id));
CREATE POLICY profiles_select_own ON poshkan_trade_test.profiles FOR SELECT USING ((poshkan_trade_test.actor() = id));
CREATE POLICY profiles_update_own ON poshkan_trade_test.profiles FOR UPDATE USING ((poshkan_trade_test.actor() = id));
CREATE POLICY push_subs_all_own ON poshkan_trade_test.push_subscriptions USING ((poshkan_trade_test.actor() = user_id)) WITH CHECK ((poshkan_trade_test.actor() = user_id));
CREATE POLICY snapshots_select_own ON poshkan_trade_test.account_snapshots FOR SELECT USING (poshkan_trade_test.owns_account(account_id));
CREATE POLICY transactions_select_own ON poshkan_trade_test.transactions FOR SELECT USING (poshkan_trade_test.owns_account(account_id));
CREATE POLICY watchlist_all_own ON poshkan_trade_test.watchlist USING (poshkan_trade_test.owns_account(account_id)) WITH CHECK (poshkan_trade_test.owns_account(account_id));
GRANT SELECT ON poshkan_trade_test.profiles TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.watchlist TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.alerts TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.account_snapshots TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.notifications TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.custom_strategies TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.custom_strategy_signals TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.smc_settings TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.smc_signals TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.ote_settings TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.ote_signals TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.trend_settings TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.trend_signals TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.meanrev_settings TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.meanrev_signals TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.candlerange_settings TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.candlerange_signals TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.api_tokens TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.push_subscriptions TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.email_prefs TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.accounts TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.positions TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.transactions TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.fx_positions TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.fx_orders TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.fx_tp_levels TO poshkan_trade_preview;
GRANT SELECT ON poshkan_trade_test.orders TO poshkan_trade_preview;
GRANT INSERT,UPDATE,DELETE ON poshkan_trade_test.watchlist TO poshkan_trade_preview;
GRANT INSERT,UPDATE,DELETE ON poshkan_trade_test.alerts TO poshkan_trade_preview;
GRANT INSERT,UPDATE,DELETE ON poshkan_trade_test.custom_strategies TO poshkan_trade_preview;
GRANT INSERT,UPDATE,DELETE ON poshkan_trade_test.api_tokens TO poshkan_trade_preview;
GRANT INSERT,UPDATE,DELETE ON poshkan_trade_test.push_subscriptions TO poshkan_trade_preview;
GRANT INSERT,UPDATE ON poshkan_trade_test.smc_settings TO poshkan_trade_preview;
GRANT INSERT,UPDATE ON poshkan_trade_test.ote_settings TO poshkan_trade_preview;
GRANT INSERT,UPDATE ON poshkan_trade_test.trend_settings TO poshkan_trade_preview;
GRANT INSERT,UPDATE ON poshkan_trade_test.meanrev_settings TO poshkan_trade_preview;
GRANT INSERT,UPDATE ON poshkan_trade_test.candlerange_settings TO poshkan_trade_preview;
GRANT UPDATE (name,leverage,ai_instruction,ai_symbols,auto_trade_enabled,auto_risk_pct,auto_max_open,auto_max_per_day,auto_daily_loss_pct,auto_min_minutes,auto_leverage,auto_max_position_pct,notify_enabled,hidden_from_leaderboard) ON poshkan_trade_test.accounts TO poshkan_trade_preview;
GRANT UPDATE(theme,username,avatar_url,anthropic_api_key) ON poshkan_trade_test.profiles TO poshkan_trade_preview;
GRANT UPDATE(read) ON poshkan_trade_test.notifications TO poshkan_trade_preview;
CREATE FUNCTION poshkan_trade_test.get_leaderboard() RETURNS TABLE(account_id uuid, user_id uuid, username text, account_name text, account_type text, total_value numeric, contributions numeric, return_pct numeric, as_of date, trades integer, open_positions integer, days_active integer, max_drawdown_pct numeric, trades_per_month numeric, style text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'poshkan_trade_test'
    AS $$
  with last_reset as (
    select t.account_id, max(t.created_at) as reset_at
    from poshkan_trade_test.transactions t
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
    from poshkan_trade_test.transactions t
    left join last_reset lr on lr.account_id = t.account_id
    where lr.reset_at is null or t.created_at >= lr.reset_at
    group by t.account_id
  ),
  -- Activity since the last reset: buys and sells, plus every leveraged
  -- position opened. Counts only, never what was traded.
  activity as (
    select a.id as account_id,
           (
             select count(*) from poshkan_trade_test.transactions t
             left join last_reset lr2 on lr2.account_id = t.account_id
             where t.account_id = a.id
               and t.side in ('BUY', 'SELL')
               and (lr2.reset_at is null or t.created_at >= lr2.reset_at)
           )
           + (
             select count(*) from poshkan_trade_test.fx_positions f
             left join last_reset lr3 on lr3.account_id = f.account_id
             where f.account_id = a.id
               and (lr3.reset_at is null or f.opened_at >= lr3.reset_at)
           ) as trades,
           (
             select count(*) from poshkan_trade_test.positions p where p.account_id = a.id
           )
           + (
             select count(*) from poshkan_trade_test.fx_positions f2
             where f2.account_id = a.id and f2.status = 'open'
           ) as open_positions,
           (
             select greatest(1, (current_date - min(t2.created_at)::date))
             from poshkan_trade_test.transactions t2
             left join last_reset lr4 on lr4.account_id = t2.account_id
             where t2.account_id = a.id
               and (lr4.reset_at is null or t2.created_at >= lr4.reset_at)
           ) as days_active
    from poshkan_trade_test.accounts a
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
      from poshkan_trade_test.account_snapshots s
    ) x
    group by x.account_id
  ),
  latest_snap as (
    select distinct on (s.account_id) s.account_id, s.total_value, s.snapshot_date
    from poshkan_trade_test.account_snapshots s
    order by s.account_id, s.snapshot_date desc
  ),
  fallback as (
    select a.id as account_id,
           a.cash_balance
           + coalesce((select sum(p.quantity * p.avg_cost) from poshkan_trade_test.positions p where p.account_id = a.id), 0)
           + coalesce((select sum(f.margin) from poshkan_trade_test.fx_positions f where f.account_id = a.id and f.status = 'open'), 0)
           as value
    from poshkan_trade_test.accounts a
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
  from poshkan_trade_test.accounts a
  join poshkan_trade_test.profiles pr on pr.id = a.user_id
  join contrib c on c.account_id = a.id and c.contributions > 0
    and a.hidden_from_leaderboard = false
  left join latest_snap ls on ls.account_id = a.id
  left join fallback fb on fb.account_id = a.id
  left join activity act on act.account_id = a.id
  left join drawdown dd on dd.account_id = a.id
  order by return_pct desc, total_value desc
$$;
REVOKE ALL ON FUNCTION poshkan_trade_test.get_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.get_leaderboard() TO poshkan_trade_preview;
COMMIT;
