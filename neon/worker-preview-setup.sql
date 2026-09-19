BEGIN;
DO $$ BEGIN
  IF current_database()<>'neondb' OR NOT EXISTS (
    SELECT 1 FROM poshkan_stage.auth_links
    WHERE neon_user_id='067a9e15-51a4-43b0-aa56-fd5519f68cb9' AND NOT application_access_enabled
  ) THEN RAISE EXCEPTION 'Wrong migration destination'; END IF;
END $$;
-- Provisioning sets a random password separately, without putting it in SQL files.
CREATE ROLE poshkan_preview_worker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE neondb TO poshkan_preview_worker;
GRANT USAGE ON SCHEMA poshkan_trade_test TO poshkan_preview_worker;
CREATE TABLE poshkan_trade_test.worker_control (
  id integer PRIMARY KEY CHECK(id=1),
  neon_user_id uuid NOT NULL REFERENCES poshkan_trade_test.auth_links(neon_user_id),
  enabled boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz,
  last_check timestamptz,
  summary jsonb
);
ALTER TABLE poshkan_trade_test.worker_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON poshkan_trade_test.worker_control FROM PUBLIC,poshkan_trade_preview,poshkan_preview_worker;
INSERT INTO poshkan_trade_test.worker_control(id,neon_user_id) VALUES(1,'067a9e15-51a4-43b0-aa56-fd5519f68cb9');
COMMIT;
