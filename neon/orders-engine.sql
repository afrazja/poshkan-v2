BEGIN;
CREATE OR REPLACE FUNCTION poshkan_trade_test.order_state() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH owner AS (SELECT poshkan_trade_test.actor() AS id), accounts AS (
    SELECT a.id FROM poshkan_trade_test.accounts a JOIN owner o ON a.user_id=o.id
  )
  SELECT jsonb_build_object(
    'orders',coalesce((SELECT jsonb_agg(x ORDER BY x.created DESC,x.id) FROM (
      SELECT o.id,o.account_id AS "accountId",'LIMIT' AS kind,o.symbol,o.side AS direction,
        o.quantity::text AS quantity,o.limit_price::text AS target,o.status,o.failure_reason AS error,
        o.created_at AS created,o.expires_at AS expires,o.filled_price::text AS "fillPrice"
        FROM poshkan_trade_test.orders o JOIN accounts a ON a.id=o.account_id
      UNION ALL
      SELECT o.id,o.account_id,'ENTRY',o.symbol,o.direction,o.units::text,o.entry_rate::text,
        o.status,o.failure_reason,o.created_at,o.expires_at,o.filled_rate::text
        FROM poshkan_trade_test.fx_orders o JOIN accounts a ON a.id=o.account_id
    ) x),'[]'::jsonb),
    'exits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'accountId',f.account_id,
      'symbol',f.symbol,'at',f.auto_close_at,'levels',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',l.id,'price',l.price::text,'units',l.close_units::text) ORDER BY l.price,l.id)
        FROM poshkan_trade_test.fx_tp_levels l WHERE l.position_id=f.id AND l.status='pending'),'[]'::jsonb)))
      FROM poshkan_trade_test.fx_positions f JOIN accounts a ON a.id=f.account_id WHERE f.status='open'),'[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.order_command(p_request uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE
  actor_id uuid := poshkan_trade_test.actor();
  action text := p_command->>'action';
  account_id uuid := (p_command->>'accountId')::uuid;
  symbol text := upper(trim(p_command->>'symbol'));
  target numeric := (p_command->>'target')::numeric;
  quantity numeric := (p_command->>'quantity')::numeric;
  sl numeric := (p_command->>'stopLoss')::numeric;
  tp numeric := (p_command->>'takeProfit')::numeric;
  direction text := p_command->>'direction';
  expires timestamptz;
  prior poshkan_trade_test.requests%rowtype;
  a poshkan_trade_test.accounts%rowtype;
  fx poshkan_trade_test.fx_positions%rowtype;
  new_id uuid; result jsonb; minutes integer; level jsonb; amount numeric; price numeric; total numeric := 0;
BEGIN
  IF p_request IS NULL OR action IS NULL OR action NOT IN ('PLACE_LIMIT','PLACE_ENTRY','CANCEL_LIMIT','CANCEL_ENTRY','SET_TIMER','SET_LEVELS') THEN RAISE EXCEPTION 'Invalid order command'; END IF;
  INSERT INTO poshkan_trade_test.requests(actor_id,request_id,command) VALUES(actor_id,p_request,p_command) ON CONFLICT DO NOTHING;
  SELECT * INTO prior FROM poshkan_trade_test.requests r WHERE r.actor_id=actor_id AND r.request_id=p_request FOR UPDATE;
  IF prior.command<>p_command THEN RAISE EXCEPTION 'Request ID reused with different trade'; END IF;
  IF prior.result IS NOT NULL THEN RETURN prior.result; END IF;
  SELECT * INTO a FROM poshkan_trade_test.accounts x WHERE x.id=account_id AND x.user_id=actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='42501'; END IF;
  IF action IN ('PLACE_LIMIT','PLACE_ENTRY') THEN
    IF p_command->>'expiryHours' IS NOT NULL AND p_command->>'expiryHours'<>'24' THEN RAISE EXCEPTION 'Invalid order expiry'; END IF;
    expires:=CASE WHEN p_command->>'expiryHours'='24' THEN clock_timestamp()+interval '24 hours' ELSE NULL END;
    IF symbol IS NULL OR symbol !~ '^[A-Z0-9.^=-]{1,24}$' OR NOT poshkan_trade_test.positive(target)
      OR target<>round(target,CASE WHEN action='PLACE_LIMIT' THEN 8 ELSE 6 END)
      OR NOT poshkan_trade_test.positive(quantity) OR quantity<>round(quantity,8)
      OR (expires IS NOT NULL AND (NOT isfinite(expires) OR expires<=clock_timestamp() OR expires>clock_timestamp()+interval '1 year'))
    THEN RAISE EXCEPTION 'Invalid order amount, price or expiry'; END IF;
    IF action='PLACE_ENTRY' OR direction='BUY' THEN
      IF (a.type='forex' AND symbol NOT IN ('EURUSD=X','GBPUSD=X','USDJPY=X','AUDUSD=X','USDCAD=X','USDCHF=X','NZDUSD=X'))
        OR (a.type='crypto' AND symbol !~ '-USD$')
        OR (a.type='stocks' AND (symbol ~ '=X$' OR symbol ~ '-(USD|USDT|EUR|GBP|BTC|ETH)$'))
      THEN RAISE EXCEPTION 'Symbol does not match account market'; END IF;
    END IF;
    IF action='PLACE_LIMIT' THEN
      IF a.type='forex' OR direction IS NULL OR direction NOT IN ('BUY','SELL') THEN RAISE EXCEPTION 'Invalid limit order'; END IF;
      IF round(quantity*target,8)<=0 THEN RAISE EXCEPTION 'Trade is too small'; END IF;
      INSERT INTO poshkan_trade_test.orders(account_id,symbol,side,quantity,limit_price,expires_at)
        VALUES(a.id,symbol,direction,quantity,target,expires) RETURNING id INTO new_id;
    ELSE
      IF direction IS NULL OR direction NOT IN ('LONG','SHORT') OR p_command->>'trigger' IS NULL
        OR p_command->>'trigger' NOT IN ('AT_OR_BELOW','AT_OR_ABOVE')
        OR p_command->>'leverage' IS NULL OR (p_command->>'leverage')::numeric NOT IN (1,2,5,10)
        THEN RAISE EXCEPTION 'Invalid entry order'; END IF;
      IF (sl IS NOT NULL AND (NOT poshkan_trade_test.positive(sl) OR sl<>round(sl,6) OR (direction='LONG' AND sl>=target) OR (direction='SHORT' AND sl<=target)))
        OR (tp IS NOT NULL AND (NOT poshkan_trade_test.positive(tp) OR tp<>round(tp,6) OR (direction='LONG' AND tp<=target) OR (direction='SHORT' AND tp>=target)))
      THEN RAISE EXCEPTION 'Invalid stop loss or take profit'; END IF;
      INSERT INTO poshkan_trade_test.fx_orders(account_id,symbol,direction,units,entry_rate,trigger_when,leverage,stop_loss,take_profit,expires_at)
        VALUES(a.id,symbol,direction,quantity,target,p_command->>'trigger',(p_command->>'leverage')::integer,sl,tp,expires) RETURNING id INTO new_id;
    END IF;
    result:=jsonb_build_object('id',new_id,'status','pending');
  ELSIF action IN ('CANCEL_LIMIT','CANCEL_ENTRY') THEN
    IF action='CANCEL_LIMIT' THEN
      UPDATE poshkan_trade_test.orders SET status='canceled' WHERE id=(p_command->>'orderId')::uuid AND account_id=a.id AND status='pending' RETURNING id INTO new_id;
    ELSE
      UPDATE poshkan_trade_test.fx_orders SET status='canceled' WHERE id=(p_command->>'orderId')::uuid AND account_id=a.id AND status='pending' RETURNING id INTO new_id;
    END IF;
    result:=jsonb_build_object('status',CASE WHEN new_id IS NULL THEN 'unchanged' ELSE 'canceled' END);
  ELSE
    SELECT * INTO fx FROM poshkan_trade_test.fx_positions x WHERE x.id=(p_command->>'positionId')::uuid AND x.account_id=a.id AND x.status='open' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Open position not found'; END IF;
    IF action='SET_TIMER' THEN
      minutes:=(p_command->>'minutes')::integer;
      IF minutes IS NULL OR minutes<0 OR minutes>10080 THEN RAISE EXCEPTION 'Invalid close timer'; END IF;
      UPDATE poshkan_trade_test.fx_positions SET auto_close_at=CASE WHEN minutes=0 THEN NULL ELSE clock_timestamp()+make_interval(mins=>minutes) END WHERE id=fx.id;
    ELSE
      IF jsonb_typeof(p_command->'levels') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'levels')>10 THEN RAISE EXCEPTION 'Invalid take-profit levels'; END IF;
      DELETE FROM poshkan_trade_test.fx_tp_levels WHERE position_id=fx.id AND status='pending';
      FOR level IN SELECT * FROM jsonb_array_elements(p_command->'levels') LOOP
        price:=(level->>'price')::numeric; amount:=(level->>'units')::numeric;
        IF NOT poshkan_trade_test.positive(price) OR price<>round(price,6) OR NOT poshkan_trade_test.positive(amount) OR amount<>round(amount,8)
          OR (fx.direction='LONG' AND price<=fx.open_rate) OR (fx.direction='SHORT' AND price>=fx.open_rate)
        THEN RAISE EXCEPTION 'Invalid take-profit levels'; END IF;
        total:=total+amount;
        INSERT INTO poshkan_trade_test.fx_tp_levels(position_id,price,close_units) VALUES(fx.id,price,amount);
      END LOOP;
      IF total>fx.units THEN RAISE EXCEPTION 'Take-profit amounts exceed the position size'; END IF;
      IF total>0 THEN UPDATE poshkan_trade_test.fx_positions SET take_profit=NULL WHERE id=fx.id; END IF;
    END IF;
    result:=jsonb_build_object('status','saved');
  END IF;
  UPDATE poshkan_trade_test.requests r SET result=result WHERE r.actor_id=actor_id AND r.request_id=p_request;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.order_candidates() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH owner AS (SELECT poshkan_trade_test.actor() AS id), accounts AS (
    SELECT a.id FROM poshkan_trade_test.accounts a JOIN owner o ON a.user_id=o.id
  )
  SELECT coalesce(jsonb_agg(x ORDER BY x.kind,x.id),'[]'::jsonb) FROM (
    SELECT 'LIMIT' AS kind,o.id,o.account_id AS "accountId",o.symbol FROM poshkan_trade_test.orders o JOIN accounts a ON a.id=o.account_id WHERE o.status='pending'
    UNION ALL SELECT 'ENTRY',o.id,o.account_id,o.symbol FROM poshkan_trade_test.fx_orders o JOIN accounts a ON a.id=o.account_id WHERE o.status='pending'
    UNION ALL SELECT 'POSITION',f.id,f.account_id,f.symbol FROM poshkan_trade_test.fx_positions f JOIN accounts a ON a.id=f.account_id WHERE f.status='open'
  ) x
$$;

-- This entry point remains human-session scoped. A separate worker identity is
-- required before deploying unattended checks; no null-identity bypass exists.
CREATE OR REPLACE FUNCTION poshkan_trade_test.check_order(p_kind text,p_id uuid,p_account uuid,p_symbol text,p_quote numeric,p_quote_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  actor_id uuid:=poshkan_trade_test.actor(); a poshkan_trade_test.accounts%rowtype;
  o poshkan_trade_test.orders%rowtype; e poshkan_trade_test.fx_orders%rowtype;
  f poshkan_trade_test.fx_positions%rowtype; l poshkan_trade_test.fx_tp_levels%rowtype;
  payload jsonb; result jsonb; reason text; pnl numeric; fill numeric; count_filled integer:=0;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('LIMIT','ENTRY','POSITION') THEN RAISE EXCEPTION 'Invalid check'; END IF;
  -- All paths, including cancellation, acquire account before order/position.
  SELECT * INTO a FROM poshkan_trade_test.accounts WHERE id=p_account AND user_id=actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='42501'; END IF;
  IF p_kind='LIMIT' THEN
    SELECT * INTO o FROM poshkan_trade_test.orders WHERE id=p_id AND account_id=a.id AND symbol=p_symbol AND status='pending' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','unchanged'); END IF;
    IF o.expires_at<=clock_timestamp() OR (o.time_in_force='DAY' AND (o.created_at AT TIME ZONE 'America/New_York')::date<(clock_timestamp() AT TIME ZONE 'America/New_York')::date) THEN
      UPDATE poshkan_trade_test.orders SET status='expired' WHERE id=o.id;
      RETURN jsonb_build_object('status','expired');
    END IF;
  ELSIF p_kind='ENTRY' THEN
    SELECT * INTO e FROM poshkan_trade_test.fx_orders WHERE id=p_id AND account_id=a.id AND symbol=p_symbol AND status='pending' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','unchanged'); END IF;
    IF e.expires_at<=clock_timestamp() THEN
      UPDATE poshkan_trade_test.fx_orders SET status='expired' WHERE id=e.id;
      RETURN jsonb_build_object('status','expired');
    END IF;
  ELSE
    SELECT * INTO f FROM poshkan_trade_test.fx_positions WHERE id=p_id AND account_id=a.id AND symbol=p_symbol AND status='open' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','unchanged'); END IF;
  END IF;
  IF NOT poshkan_trade_test.positive(p_quote) OR p_quote_at IS NULL OR NOT isfinite(p_quote_at)
    OR p_quote_at<clock_timestamp()-interval '5 minutes' OR p_quote_at>clock_timestamp()+interval '1 minute'
  THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  IF p_kind IN ('LIMIT','ENTRY') THEN
    IF p_kind='LIMIT' THEN
      IF (o.side='BUY' AND p_quote>o.limit_price) OR (o.side='SELL' AND p_quote<o.limit_price) THEN RETURN jsonb_build_object('status','waiting'); END IF;
      payload:=jsonb_build_object('action','SPOT','accountId',a.id,'symbol',o.symbol,'side',o.side,'quantity',o.quantity::text);
    ELSE
      IF (e.trigger_when='AT_OR_BELOW' AND p_quote>e.entry_rate) OR (e.trigger_when='AT_OR_ABOVE' AND p_quote<e.entry_rate) THEN RETURN jsonb_build_object('status','waiting'); END IF;
      payload:=jsonb_build_object('action','OPEN_FX','accountId',a.id,'symbol',e.symbol,'direction',e.direction,'units',e.units::text,'leverage',e.leverage,'stopLoss',e.stop_loss::text,'takeProfit',e.take_profit::text);
    END IF;
    BEGIN
      result:=poshkan_trade_test.command(gen_random_uuid(),payload,p_quote);
      IF p_kind='LIMIT' THEN UPDATE poshkan_trade_test.orders SET status='filled',filled_at=clock_timestamp(),filled_price=p_quote WHERE id=o.id;
      ELSE UPDATE poshkan_trade_test.fx_orders SET status='filled',filled_at=clock_timestamp(),filled_rate=p_quote WHERE id=e.id; END IF;
      RETURN jsonb_build_object('status','filled','trade',result);
    EXCEPTION WHEN raise_exception THEN
      -- This subtransaction rolls back every trade write before marking a
      -- permanently invalid order canceled. Unexpected errors propagate.
      IF SQLERRM NOT IN ('Insufficient cash','Insufficient cash for margin','Not enough holdings','Invalid stop loss or take profit','Trade is too small','Position too small','Invalid units, direction or leverage','Symbol does not match account market') THEN RAISE; END IF;
      IF p_kind='LIMIT' THEN UPDATE poshkan_trade_test.orders SET status='canceled',failure_reason=SQLERRM WHERE id=o.id;
      ELSE UPDATE poshkan_trade_test.fx_orders SET status='canceled',failure_reason=SQLERRM WHERE id=e.id; END IF;
      RETURN jsonb_build_object('status','canceled','reason',SQLERRM);
    END;
  END IF;
  pnl:=(p_quote-f.open_rate)*f.units;
  IF f.symbol ~ '^USD[A-Z]{3}=X$' THEN pnl:=pnl/p_quote; END IF;
  IF f.direction='SHORT' THEN pnl:=-pnl; END IF;
  reason:=CASE
    WHEN pnl<=-f.margin THEN 'stopped'
    WHEN (f.direction='LONG' AND p_quote<=f.stop_loss) OR (f.direction='SHORT' AND p_quote>=f.stop_loss) THEN 'sl'
    WHEN (f.direction='LONG' AND p_quote>=f.take_profit) OR (f.direction='SHORT' AND p_quote<=f.take_profit) THEN 'tp'
    WHEN f.auto_close_at<=clock_timestamp() THEN 'timer' ELSE NULL END;
  IF reason IS NOT NULL THEN
    -- SL / margin / timed exits execute at the observed price, including gaps.
    -- Take-profit fills conservatively at its resting target.
    fill:=CASE WHEN reason='tp' THEN f.take_profit ELSE p_quote END;
    result:=poshkan_trade_test.command(gen_random_uuid(),jsonb_build_object('action','CLOSE_FX','accountId',a.id,'positionId',f.id),fill);
    UPDATE poshkan_trade_test.fx_positions SET status=CASE WHEN reason='timer' THEN 'closed' ELSE reason END WHERE id=f.id;
    DELETE FROM poshkan_trade_test.fx_tp_levels WHERE position_id=f.id AND status='pending';
    RETURN jsonb_build_object('status','closed','reason',reason,'trade',result);
  END IF;
  FOR l IN SELECT * FROM poshkan_trade_test.fx_tp_levels WHERE position_id=f.id AND status='pending'
    AND ((f.direction='LONG' AND p_quote>=price) OR (f.direction='SHORT' AND p_quote<=price))
    ORDER BY CASE WHEN f.direction='LONG' THEN price ELSE -price END,id FOR UPDATE LOOP
    SELECT * INTO f FROM poshkan_trade_test.fx_positions WHERE id=p_id;
    EXIT WHEN f.status<>'open';
    result:=poshkan_trade_test.command(gen_random_uuid(),jsonb_build_object('action','CLOSE_FX','accountId',a.id,'positionId',f.id,'units',least(l.close_units,f.units)::text),l.price);
    UPDATE poshkan_trade_test.fx_tp_levels SET status='filled',filled_at=clock_timestamp() WHERE id=l.id;
    count_filled:=count_filled+1;
  END LOOP;
  RETURN jsonb_build_object('status',CASE WHEN count_filled>0 THEN 'scaled' ELSE 'waiting' END,'levels',count_filled);
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.order_state(),poshkan_trade_test.order_command(uuid,jsonb),poshkan_trade_test.order_candidates(),poshkan_trade_test.check_order(text,uuid,uuid,text,numeric,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.order_state(),poshkan_trade_test.order_command(uuid,jsonb),poshkan_trade_test.order_candidates(),poshkan_trade_test.check_order(text,uuid,uuid,text,numeric,timestamptz) TO poshkan_trade_preview;
COMMIT;
