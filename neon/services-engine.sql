BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='poshkan_preview_services') THEN CREATE ROLE poshkan_preview_services NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='poshkan_preview_cache') THEN CREATE ROLE poshkan_preview_cache NOLOGIN; END IF;
END $$;
GRANT poshkan_preview_services,poshkan_preview_cache TO CURRENT_USER;
GRANT USAGE ON SCHEMA poshkan_trade_test TO poshkan_preview_services,poshkan_preview_cache;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['market_quotes','market_candles','market_data_syncs','market_scans','fx_scan_alerts'] LOOP
    IF to_regclass('poshkan_trade_test.'||t) IS NULL THEN
      EXECUTE format('CREATE TABLE poshkan_trade_test.%I (LIKE poshkan_stage.%I INCLUDING ALL)',t,t);
      IF t='fx_scan_alerts' THEN EXECUTE format('INSERT INTO poshkan_trade_test.%I SELECT * FROM poshkan_stage.%I',t,t); END IF;
      EXECUTE format('ALTER TABLE poshkan_trade_test.%I ENABLE ROW LEVEL SECURITY',t);
    END IF;
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS poshkan_trade_test.crypto_monitor_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES poshkan_trade_test.accounts(id) ON DELETE CASCADE,
 slot timestamptz NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 status text NOT NULL DEFAULT 'running' CHECK(status IN('running','completed','blocked','failed','opened')),
 report jsonb NOT NULL DEFAULT '{}'::jsonb,position_id uuid REFERENCES poshkan_trade_test.fx_positions(id) ON DELETE SET NULL,UNIQUE(account_id,slot)
);
ALTER TABLE poshkan_trade_test.crypto_monitor_runs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS poshkan_trade_test.delivery_captures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN('email','push')),payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'captured' CHECK(status='captured')
);
ALTER TABLE poshkan_trade_test.delivery_captures ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['market_quotes','market_candles','market_data_syncs','market_scans'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS service_cache ON poshkan_trade_test.%I',t);
  EXECUTE format('CREATE POLICY service_cache ON poshkan_trade_test.%I TO poshkan_preview_cache,poshkan_preview_services USING(true) WITH CHECK(true)',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON poshkan_trade_test.%I TO poshkan_preview_cache,poshkan_preview_services',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['fx_scan_alerts','crypto_monitor_runs','account_snapshots','smc_signals','ote_signals','trend_signals','meanrev_signals','candlerange_signals'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS service_owned ON poshkan_trade_test.%I',t);
  EXECUTE format('CREATE POLICY service_owned ON poshkan_trade_test.%I TO poshkan_preview_services USING(poshkan_trade_test.owns_account(account_id)) WITH CHECK(poshkan_trade_test.owns_account(account_id))',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON poshkan_trade_test.%I TO poshkan_preview_services',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS service_signals ON poshkan_trade_test.custom_strategy_signals;
CREATE POLICY service_signals ON poshkan_trade_test.custom_strategy_signals TO poshkan_preview_services
 USING(EXISTS(SELECT 1 FROM poshkan_trade_test.custom_strategies s WHERE s.id=strategy_id AND s.user_id=poshkan_trade_test.actor()))
 WITH CHECK(EXISTS(SELECT 1 FROM poshkan_trade_test.custom_strategies s WHERE s.id=strategy_id AND s.user_id=poshkan_trade_test.actor()));
DROP POLICY IF EXISTS service_notifications ON poshkan_trade_test.notifications;
CREATE POLICY service_notifications ON poshkan_trade_test.notifications TO poshkan_preview_services USING(user_id=poshkan_trade_test.actor()) WITH CHECK(user_id=poshkan_trade_test.actor());
DROP POLICY IF EXISTS captured_owner ON poshkan_trade_test.delivery_captures;
CREATE POLICY captured_owner ON poshkan_trade_test.delivery_captures FOR SELECT USING(user_id=poshkan_trade_test.actor());
GRANT SELECT ON poshkan_trade_test.accounts,poshkan_trade_test.positions,poshkan_trade_test.transactions,poshkan_trade_test.fx_positions,poshkan_trade_test.orders,poshkan_trade_test.fx_orders,poshkan_trade_test.fx_tp_levels,poshkan_trade_test.profiles,poshkan_trade_test.alerts,poshkan_trade_test.custom_strategies,poshkan_trade_test.push_subscriptions,poshkan_trade_test.email_prefs,poshkan_trade_test.notifications,poshkan_trade_test.delivery_captures TO poshkan_preview_services;
GRANT INSERT ON poshkan_trade_test.notifications TO poshkan_preview_services;
GRANT SELECT,INSERT,UPDATE,DELETE ON poshkan_trade_test.custom_strategy_signals TO poshkan_preview_services;
GRANT UPDATE(last_run_at,status,updated_at) ON poshkan_trade_test.custom_strategies TO poshkan_preview_services;
GRANT UPDATE(status,triggered_at,triggered_price) ON poshkan_trade_test.alerts TO poshkan_preview_services;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.actor(),poshkan_trade_test.owns_account(uuid) TO poshkan_preview_services;

CREATE OR REPLACE FUNCTION poshkan_trade_test.service_user() RETURNS TABLE(id uuid,email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT l.legacy_user_id,u.email FROM poshkan_trade_test.auth_links l JOIN neon_auth."user" u ON u.id=l.neon_user_id
 WHERE l.legacy_user_id=poshkan_trade_test.actor()
$$;
CREATE OR REPLACE FUNCTION poshkan_trade_test.capture_delivery(p_channel text,p_recipient text,p_payload jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=poshkan_trade_test.actor(); approved text;
BEGIN
 SELECT CASE WHEN p_channel='email' THEN u.email ELSE u.id::text END INTO approved FROM poshkan_trade_test.service_user() u;
 IF p_recipient IS DISTINCT FROM approved OR p_channel NOT IN('email','push') THEN RAISE EXCEPTION 'Recipient outside test account' USING ERRCODE='42501'; END IF;
 INSERT INTO poshkan_trade_test.delivery_captures(user_id,channel,payload) VALUES(owner_id,p_channel,p_payload);
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.service_user(),poshkan_trade_test.capture_delivery(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.service_user(),poshkan_trade_test.capture_delivery(text,text,jsonb) TO poshkan_preview_services;
CREATE OR REPLACE FUNCTION poshkan_trade_test.service_check(p_kind text,p_id uuid,p_account uuid,p_symbol text,p_quote numeric,p_quote_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM poshkan_trade_test.actor();
 PERFORM 1 FROM poshkan_trade_test.worker_control WHERE id=1 AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','paused'); END IF;
 RETURN poshkan_trade_test.check_order(p_kind,p_id,p_account,p_symbol,p_quote,p_quote_at);
END $$;
CREATE OR REPLACE FUNCTION poshkan_trade_test.verify_api_token(p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=poshkan_trade_test.actor(); token_id uuid;
BEGIN
 SELECT id INTO token_id FROM poshkan_trade_test.api_tokens WHERE token_hash=p_hash AND user_id=owner_id;
 IF token_id IS NULL THEN RAISE EXCEPTION 'Invalid API token' USING ERRCODE='42501'; END IF;
 UPDATE poshkan_trade_test.api_tokens SET last_used_at=now() WHERE id=token_id;
 RETURN owner_id;
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.service_check(text,uuid,uuid,text,numeric,timestamptz),poshkan_trade_test.verify_api_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.service_check(text,uuid,uuid,text,numeric,timestamptz),poshkan_trade_test.order_candidates() TO poshkan_preview_services;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.verify_api_token(text) TO poshkan_trade_preview;
COMMIT;
