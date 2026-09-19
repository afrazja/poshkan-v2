BEGIN;
CREATE OR REPLACE FUNCTION poshkan_trade_test.worker_identity() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  -- SESSION_USER survives SECURITY DEFINER and cannot be forged by SET ROLE
  -- or a user-controlled session variable. This login has no role memberships.
  IF session_user<>'poshkan_preview_worker' THEN RAISE EXCEPTION 'Worker login required' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.worker_claim() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM poshkan_trade_test.worker_identity();
  -- Called once per direct connection. Connection loss releases the lease.
  RETURN pg_try_advisory_lock(1936748398,3025);
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.worker_state() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH actor AS (SELECT poshkan_trade_test.actor() AS id)
  SELECT jsonb_build_object('enabled',c.enabled,'online',coalesce(c.last_seen>clock_timestamp()-interval '90 seconds',false),
    'lastSeen',c.last_seen,'lastCheck',c.last_check,'summary',c.summary)
  FROM poshkan_trade_test.worker_control c
  JOIN poshkan_trade_test.auth_links l ON l.neon_user_id=c.neon_user_id
  JOIN actor a ON a.id=l.legacy_user_id WHERE c.id=1
$$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.set_worker(p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=poshkan_trade_test.actor(); c poshkan_trade_test.worker_control%rowtype;
BEGIN
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Invalid worker setting'; END IF;
  SELECT w.* INTO c FROM poshkan_trade_test.worker_control w
    JOIN poshkan_trade_test.auth_links l ON l.neon_user_id=w.neon_user_id
    WHERE w.id=1 AND l.legacy_user_id=owner_id FOR UPDATE OF w;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not available for this account' USING ERRCODE='42501'; END IF;
  IF p_enabled AND (c.last_seen IS NULL OR c.last_seen<clock_timestamp()-interval '90 seconds') THEN RAISE EXCEPTION 'Background process is offline'; END IF;
  -- Workers hold a shared lock across each fill. Returning from this update
  -- means that earlier fills finished and subsequent worker fills are blocked.
  UPDATE poshkan_trade_test.worker_control SET enabled=p_enabled,changed_at=clock_timestamp() WHERE id=1;
  RETURN poshkan_trade_test.worker_state();
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.worker_poll() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c poshkan_trade_test.worker_control%rowtype;
BEGIN
  PERFORM poshkan_trade_test.worker_identity();
  UPDATE poshkan_trade_test.worker_control SET last_seen=clock_timestamp() WHERE id=1 RETURNING * INTO c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker configuration missing'; END IF;
  IF NOT c.enabled THEN RETURN jsonb_build_object('enabled',false,'items','[]'::jsonb); END IF;
  PERFORM set_config('poshkan.neon_user_id',c.neon_user_id::text,true);
  PERFORM poshkan_trade_test.actor();
  RETURN jsonb_build_object('enabled',true,'items',poshkan_trade_test.order_candidates());
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.worker_check(p_kind text,p_id uuid,p_account uuid,p_symbol text,p_quote numeric,p_quote_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c poshkan_trade_test.worker_control%rowtype;
BEGIN
  PERFORM poshkan_trade_test.worker_identity();
  SELECT * INTO c FROM poshkan_trade_test.worker_control WHERE id=1 FOR SHARE;
  IF NOT FOUND OR NOT c.enabled THEN RETURN jsonb_build_object('status','paused'); END IF;
  PERFORM set_config('poshkan.neon_user_id',c.neon_user_id::text,true);
  PERFORM poshkan_trade_test.actor();
  RETURN poshkan_trade_test.check_order(p_kind,p_id,p_account,p_symbol,p_quote,p_quote_at);
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.worker_report(p_summary jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE key text; value jsonb;
BEGIN
  PERFORM poshkan_trade_test.worker_identity();
  IF jsonb_typeof(p_summary) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid worker summary'; END IF;
  FOR key,value IN SELECT * FROM jsonb_each(p_summary) LOOP
    IF key NOT IN ('filled','closed','scaled','canceled','expired','waiting','unavailable','failed','paused','unchanged')
      OR jsonb_typeof(value)<>'number' OR value::text !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'Invalid worker summary'; END IF;
  END LOOP;
  UPDATE poshkan_trade_test.worker_control SET last_seen=clock_timestamp(),last_check=clock_timestamp(),summary=p_summary WHERE id=1;
END $$;

REVOKE ALL ON FUNCTION poshkan_trade_test.worker_identity(),poshkan_trade_test.worker_claim(),poshkan_trade_test.worker_state(),poshkan_trade_test.set_worker(boolean),poshkan_trade_test.worker_poll(),poshkan_trade_test.worker_check(text,uuid,uuid,text,numeric,timestamptz),poshkan_trade_test.worker_report(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.worker_state(),poshkan_trade_test.set_worker(boolean) TO poshkan_trade_preview;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.worker_claim(),poshkan_trade_test.worker_poll(),poshkan_trade_test.worker_check(text,uuid,uuid,text,numeric,timestamptz),poshkan_trade_test.worker_report(jsonb) TO poshkan_preview_worker;
COMMIT;
