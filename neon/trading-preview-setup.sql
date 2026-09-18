-- One-time isolated rehearsal copy. Never replaces or updates poshkan_stage.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'neondb' OR NOT EXISTS (
    SELECT 1 FROM poshkan_stage.auth_links WHERE
      neon_user_id = '067a9e15-51a4-43b0-aa56-fd5519f68cb9'
      AND legacy_user_id = '0a1d36a2-fbdf-4f7c-a736-a05a91a81246'
      AND NOT application_access_enabled
  ) THEN RAISE EXCEPTION 'Wrong migration destination'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'poshkan_trade_preview') THEN
    RAISE EXCEPTION 'Preview role already exists; refusing to overwrite';
  END IF;
END $$;
CREATE SCHEMA poshkan_trade_test;
REVOKE ALL ON SCHEMA poshkan_trade_test FROM PUBLIC;
CREATE ROLE poshkan_trade_preview NOLOGIN;
GRANT poshkan_trade_preview TO CURRENT_USER;
GRANT USAGE ON SCHEMA poshkan_trade_test TO poshkan_trade_preview;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['legacy_users','auth_links','accounts','positions','transactions','fx_positions'] LOOP
    EXECUTE format('CREATE TABLE poshkan_trade_test.%I (LIKE poshkan_stage.%I INCLUDING ALL)', t, t);
    EXECUTE format('INSERT INTO poshkan_trade_test.%I SELECT * FROM poshkan_stage.%I', t, t);
    EXECUTE format('ALTER TABLE poshkan_trade_test.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- This flag grants access only to the copied test accounts, never to the stage/live app.
UPDATE poshkan_trade_test.auth_links SET application_access_enabled = true;
ALTER TABLE poshkan_trade_test.auth_links ADD FOREIGN KEY (neon_user_id) REFERENCES neon_auth."user"(id);
ALTER TABLE poshkan_trade_test.auth_links ADD FOREIGN KEY (legacy_user_id) REFERENCES poshkan_trade_test.legacy_users(id);
ALTER TABLE poshkan_trade_test.accounts ADD FOREIGN KEY (user_id) REFERENCES poshkan_trade_test.legacy_users(id);
ALTER TABLE poshkan_trade_test.positions ADD FOREIGN KEY (account_id) REFERENCES poshkan_trade_test.accounts(id);
ALTER TABLE poshkan_trade_test.transactions ADD FOREIGN KEY (account_id) REFERENCES poshkan_trade_test.accounts(id);
ALTER TABLE poshkan_trade_test.fx_positions ADD FOREIGN KEY (account_id) REFERENCES poshkan_trade_test.accounts(id);
CREATE TABLE poshkan_trade_test.requests (
  actor_id uuid NOT NULL REFERENCES poshkan_trade_test.legacy_users(id),
  request_id uuid NOT NULL,
  command jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id, request_id)
);
ALTER TABLE poshkan_trade_test.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA poshkan_trade_test FROM PUBLIC, poshkan_trade_preview;
COMMIT;
