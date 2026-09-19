-- Applied only to the isolated production schema after the shared engine.
-- Preserve unused legacy state without exposing it to application roles.
CREATE TABLE IF NOT EXISTS poshkan_live.trade_watch_state (LIKE poshkan_live_stage.trade_watch_state INCLUDING ALL);
INSERT INTO poshkan_live.trade_watch_state SELECT * FROM poshkan_live_stage.trade_watch_state ON CONFLICT DO NOTHING;
ALTER TABLE poshkan_live.trade_watch_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON poshkan_live.trade_watch_state FROM PUBLIC,poshkan_live_app,poshkan_live_services,poshkan_live_cache;

CREATE OR REPLACE FUNCTION poshkan_live.cloud_contact(p_summary jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM poshkan_live.actor();
  UPDATE poshkan_live.worker_control SET last_seen=clock_timestamp(),
    last_check=CASE WHEN p_summary IS NULL THEN last_check ELSE clock_timestamp() END,
    summary=coalesce(p_summary,summary) WHERE id=1;
END $$;
REVOKE ALL ON FUNCTION poshkan_live.cloud_contact(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_live.cloud_contact(jsonb) TO poshkan_live_services;
