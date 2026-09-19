-- One-time additive migration of the isolated trading copy only.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'neondb' OR NOT EXISTS (
    SELECT 1 FROM poshkan_stage.auth_links
    WHERE neon_user_id='067a9e15-51a4-43b0-aa56-fd5519f68cb9' AND NOT application_access_enabled
  ) THEN RAISE EXCEPTION 'Wrong migration destination'; END IF;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['orders','fx_orders','fx_tp_levels'] LOOP
    EXECUTE format('CREATE TABLE poshkan_trade_test.%I (LIKE poshkan_stage.%I INCLUDING ALL)',t,t);
    EXECUTE format('INSERT INTO poshkan_trade_test.%I SELECT * FROM poshkan_stage.%I',t,t);
    EXECUTE format('ALTER TABLE poshkan_trade_test.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;
ALTER TABLE poshkan_trade_test.orders ADD FOREIGN KEY(account_id) REFERENCES poshkan_trade_test.accounts(id);
ALTER TABLE poshkan_trade_test.fx_orders ADD FOREIGN KEY(account_id) REFERENCES poshkan_trade_test.accounts(id);
ALTER TABLE poshkan_trade_test.fx_tp_levels ADD FOREIGN KEY(position_id) REFERENCES poshkan_trade_test.fx_positions(id);
ALTER TABLE poshkan_trade_test.orders ADD COLUMN expires_at timestamptz, ADD COLUMN failure_reason text;
ALTER TABLE poshkan_trade_test.fx_orders ADD COLUMN failure_reason text;
ALTER TABLE poshkan_trade_test.fx_orders ALTER COLUMN units TYPE numeric(28,8);
ALTER TABLE poshkan_trade_test.fx_tp_levels ALTER COLUMN close_units TYPE numeric(28,8);
REVOKE ALL ON poshkan_trade_test.orders,poshkan_trade_test.fx_orders,poshkan_trade_test.fx_tp_levels FROM PUBLIC,poshkan_trade_preview;
COMMIT;
