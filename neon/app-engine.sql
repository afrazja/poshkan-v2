BEGIN;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.actor() TO poshkan_trade_preview;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.owns_account(uuid) TO poshkan_trade_preview;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.get_leaderboard() TO poshkan_trade_preview;
CREATE OR REPLACE FUNCTION poshkan_trade_test.app_account(p_action text,p_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid:=poshkan_trade_test.actor(); v_amount numeric; v_id uuid; v_table text;
BEGIN
  IF p_action='CREATE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,0));
    IF p_data->>'type' NOT IN ('stocks','crypto','forex') OR length(trim(p_data->>'name')) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'Invalid account name or market'; END IF;
    v_amount:=(p_data->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount<0 OR v_amount>1000000000000 OR v_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid cash amount'; END IF;
    IF EXISTS(SELECT 1 FROM poshkan_trade_test.accounts WHERE user_id=v_user AND type=p_data->>'type') THEN RAISE EXCEPTION 'You already have an account in this market'; END IF;
    INSERT INTO poshkan_trade_test.accounts(user_id,name,type,cash_balance) VALUES(v_user,trim(p_data->>'name'),p_data->>'type',v_amount) RETURNING id INTO v_id;
    INSERT INTO poshkan_trade_test.transactions(account_id,side,cash_delta) VALUES(v_id,'OPENING_BALANCE',v_amount);
    RETURN jsonb_build_object('id',v_id);
  END IF;
  PERFORM 1 FROM poshkan_trade_test.accounts WHERE id=p_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_action IN ('DEPOSIT','RESET') THEN
    v_amount:=(p_data->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount<0 OR v_amount>1000000000000 OR v_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid cash amount'; END IF;
    IF p_action='RESET' THEN
      DELETE FROM poshkan_trade_test.fx_tp_levels WHERE position_id IN(SELECT id FROM poshkan_trade_test.fx_positions WHERE account_id=p_id);
      DELETE FROM poshkan_trade_test.fx_positions WHERE account_id=p_id;
      DELETE FROM poshkan_trade_test.positions WHERE account_id=p_id;
      UPDATE poshkan_trade_test.orders SET status='canceled' WHERE account_id=p_id AND status='pending';
      UPDATE poshkan_trade_test.fx_orders SET status='canceled' WHERE account_id=p_id AND status='pending';
      UPDATE poshkan_trade_test.accounts SET cash_balance=v_amount WHERE id=p_id;
    ELSE UPDATE poshkan_trade_test.accounts SET cash_balance=cash_balance+v_amount WHERE id=p_id;
    END IF;
    INSERT INTO poshkan_trade_test.transactions(account_id,side,cash_delta) VALUES(p_id,p_action,v_amount);
  ELSIF p_action='DELETE' THEN
    DELETE FROM poshkan_trade_test.fx_tp_levels WHERE position_id IN(SELECT id FROM poshkan_trade_test.fx_positions WHERE account_id=p_id);
    DELETE FROM poshkan_trade_test.custom_strategy_signals WHERE strategy_id IN(SELECT id FROM poshkan_trade_test.custom_strategies WHERE account_id=p_id);
    FOREACH v_table IN ARRAY ARRAY['watchlist','account_snapshots','custom_strategies','smc_settings','smc_signals','ote_settings','ote_signals','trend_settings','trend_signals','meanrev_settings','meanrev_signals','candlerange_settings','candlerange_signals','orders','fx_orders','fx_positions','positions','transactions'] LOOP
      EXECUTE format('DELETE FROM poshkan_trade_test.%I WHERE account_id=$1',v_table) USING p_id;
    END LOOP;
    DELETE FROM poshkan_trade_test.accounts WHERE id=p_id;
  ELSE RAISE EXCEPTION 'Invalid account operation'; END IF;
  RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.app_account(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.app_account(text,uuid,jsonb) TO poshkan_trade_preview;
CREATE OR REPLACE FUNCTION poshkan_trade_test.app_edit_entry(p_id uuid,p_account uuid,p_target numeric,p_sl numeric,p_tp numeric,p_rate numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid:=poshkan_trade_test.actor(); v_order poshkan_trade_test.fx_orders%rowtype;
BEGIN
  PERFORM 1 FROM poshkan_trade_test.accounts WHERE id=p_account AND user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  SELECT * INTO v_order FROM poshkan_trade_test.fx_orders WHERE id=p_id AND account_id=p_account AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending order not found'; END IF;
  IF NOT poshkan_trade_test.positive(p_target) OR NOT poshkan_trade_test.positive(p_rate) OR p_target<>round(p_target,6) THEN RAISE EXCEPTION 'Invalid entry price'; END IF;
  IF (p_sl IS NOT NULL AND (NOT poshkan_trade_test.positive(p_sl) OR (v_order.direction='LONG' AND p_sl>=p_target) OR (v_order.direction='SHORT' AND p_sl<=p_target))) OR (p_tp IS NOT NULL AND (NOT poshkan_trade_test.positive(p_tp) OR (v_order.direction='LONG' AND p_tp<=p_target) OR (v_order.direction='SHORT' AND p_tp>=p_target))) THEN RAISE EXCEPTION 'Invalid stop loss or take profit'; END IF;
  UPDATE poshkan_trade_test.fx_orders SET entry_rate=p_target,stop_loss=p_sl,take_profit=p_tp,trigger_when=CASE WHEN p_target<p_rate THEN 'AT_OR_BELOW' ELSE 'AT_OR_ABOVE' END WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.app_edit_entry(uuid,uuid,numeric,numeric,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.app_edit_entry(uuid,uuid,numeric,numeric,numeric,numeric) TO poshkan_trade_preview;
COMMIT;
