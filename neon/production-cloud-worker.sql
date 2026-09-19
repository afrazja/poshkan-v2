-- Applied only to the isolated production schema after the shared engine.
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
