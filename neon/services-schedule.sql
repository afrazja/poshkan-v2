BEGIN;
CREATE TABLE IF NOT EXISTS poshkan_trade_test.service_jobs(
 user_id uuid NOT NULL,name text NOT NULL,lease uuid,next_run timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,finished_at timestamptz,status text NOT NULL DEFAULT 'pending',PRIMARY KEY(user_id,name)
);
ALTER TABLE poshkan_trade_test.service_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_owner ON poshkan_trade_test.service_jobs;
CREATE POLICY job_owner ON poshkan_trade_test.service_jobs FOR SELECT USING(user_id=poshkan_trade_test.actor());
GRANT SELECT ON poshkan_trade_test.service_jobs TO poshkan_trade_preview,poshkan_preview_services;
CREATE OR REPLACE FUNCTION poshkan_trade_test.claim_service_job(p_name text,p_seconds integer,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=poshkan_trade_test.actor(); claimed uuid;
BEGIN
 IF p_name NOT IN('market','custom','ai','snapshots','digest') OR p_seconds NOT BETWEEN 60 AND 604800 OR p_lease IS NULL THEN RAISE EXCEPTION 'Invalid job'; END IF;
 INSERT INTO poshkan_trade_test.service_jobs(user_id,name) VALUES(owner_id,p_name) ON CONFLICT DO NOTHING;
 UPDATE poshkan_trade_test.service_jobs SET lease=p_lease,started_at=now(),finished_at=NULL,status='running',next_run=now()+make_interval(secs=>p_seconds)
 WHERE user_id=owner_id AND name=p_name AND ((status<>'running' AND next_run<=now()) OR (status='running' AND started_at<now()-interval '10 minutes')) RETURNING lease INTO claimed;
 RETURN claimed IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION poshkan_trade_test.finish_service_job(p_name text,p_lease uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_status NOT IN('completed','failed','blocked') THEN RAISE EXCEPTION 'Invalid job result'; END IF;
 UPDATE poshkan_trade_test.service_jobs SET status=p_status,finished_at=now(),next_run=CASE WHEN p_status='failed' THEN now()+interval '5 minutes' ELSE next_run END
 WHERE user_id=poshkan_trade_test.actor() AND name=p_name AND lease=p_lease AND status='running';
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.claim_service_job(text,integer,uuid),poshkan_trade_test.finish_service_job(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.claim_service_job(text,integer,uuid),poshkan_trade_test.finish_service_job(text,uuid,text) TO poshkan_preview_services;
COMMIT;
