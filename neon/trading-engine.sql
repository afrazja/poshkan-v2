-- Server-only RPC boundary. The server validates the Neon session and sets the
-- transaction-local identity. No browser gets a database connection or raw RPC.
BEGIN;
CREATE OR REPLACE FUNCTION poshkan_trade_test.actor() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor_id uuid;
BEGIN
  SELECT l.legacy_user_id INTO actor_id
  FROM poshkan_trade_test.auth_links l
  JOIN poshkan_trade_test.legacy_users old ON old.id = l.legacy_user_id
  JOIN neon_auth."user" u ON u.id = l.neon_user_id
  WHERE l.neon_user_id = nullif(current_setting('poshkan.neon_user_id', true), '')::uuid
    AND l.application_access_enabled AND NOT coalesce(u.banned, false)
    AND (old.banned_until IS NULL OR old.banned_until <= now());
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  RETURN actor_id;
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.positive(value numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(value > 0 AND value < 'Infinity'::numeric AND value <> 'NaN'::numeric, false)
$$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.state() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH owner AS (SELECT poshkan_trade_test.actor() AS id)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'type', a.type, 'cash', a.cash_balance::text,
    'holdings', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'symbol', p.symbol, 'quantity', p.quantity::text) ORDER BY p.symbol)
      FROM poshkan_trade_test.positions p WHERE p.account_id = a.id), '[]'::jsonb),
    'forex', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'symbol', f.symbol, 'direction', f.direction,
      'units', f.units::text, 'rate', f.open_rate::text, 'margin', f.margin::text, 'stopLoss', f.stop_loss::text, 'takeProfit', f.take_profit::text) ORDER BY f.opened_at DESC, f.id)
      FROM poshkan_trade_test.fx_positions f WHERE f.account_id = a.id AND f.status = 'open'), '[]'::jsonb)
  ) ORDER BY a.name, a.id), '[]'::jsonb)
  FROM poshkan_trade_test.accounts a JOIN owner o ON a.user_id = o.id
$$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.command(p_request uuid, p_command jsonb, p_quote numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
#variable_conflict use_variable
DECLARE
  actor_id uuid := poshkan_trade_test.actor();
  account_id uuid := (p_command->>'accountId')::uuid;
  action text := p_command->>'action';
  symbol text := upper(trim(p_command->>'symbol'));
  direction text := p_command->>'direction';
  side text := p_command->>'side';
  quantity numeric := (p_command->>'quantity')::numeric;
  units numeric := (p_command->>'units')::numeric;
  leverage numeric := (p_command->>'leverage')::numeric;
  sl numeric := (p_command->>'stopLoss')::numeric;
  tp numeric := (p_command->>'takeProfit')::numeric;
  a poshkan_trade_test.accounts%rowtype;
  pos poshkan_trade_test.positions%rowtype;
  fx poshkan_trade_test.fx_positions%rowtype;
  prior poshkan_trade_test.requests%rowtype;
  cost numeric; margin numeric; pnl numeric; new_id uuid; result jsonb;
BEGIN
  IF p_request IS NULL OR action IS NULL OR action NOT IN ('SPOT','OPEN_FX','CLOSE_FX','PROTECT_FX') THEN RAISE EXCEPTION 'Invalid command'; END IF;
  -- Serialize retries before touching balances. A failed transaction releases
  -- its claim; a successful retry returns the original result even if price moved.
  INSERT INTO poshkan_trade_test.requests(actor_id, request_id, command) VALUES(actor_id,p_request,p_command)
    ON CONFLICT DO NOTHING;
  SELECT * INTO prior FROM poshkan_trade_test.requests r WHERE r.actor_id = actor_id AND r.request_id = p_request FOR UPDATE;
  IF prior.command <> p_command THEN RAISE EXCEPTION 'Request ID reused with different trade'; END IF;
  IF prior.result IS NOT NULL THEN RETURN prior.result; END IF;
  IF NOT poshkan_trade_test.positive(p_quote) THEN RAISE EXCEPTION 'Invalid quote'; END IF;
  -- Always lock account before position: spot/open/close share one lock order.
  SELECT * INTO a FROM poshkan_trade_test.accounts x WHERE x.id = account_id AND x.user_id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501'; END IF;
  IF action IN ('SPOT','OPEN_FX') THEN
    IF symbol IS NULL OR symbol !~ '^[A-Z0-9.^=-]{1,24}$' THEN RAISE EXCEPTION 'Invalid symbol'; END IF;
    IF action = 'OPEN_FX' OR side = 'BUY' THEN
      IF (a.type = 'forex' AND symbol NOT IN ('EURUSD=X','GBPUSD=X','USDJPY=X','AUDUSD=X','USDCAD=X','USDCHF=X','NZDUSD=X'))
        OR (a.type = 'crypto' AND symbol !~ '-USD$')
        OR (a.type = 'stocks' AND (symbol ~ '=X$' OR symbol ~ '-(USD|USDT|EUR|GBP|BTC|ETH)$'))
      THEN RAISE EXCEPTION 'Symbol does not match account market'; END IF;
    END IF;
  END IF;
  IF action = 'SPOT' THEN
    IF a.type = 'forex' THEN RAISE EXCEPTION 'Use a forex position for currency pairs'; END IF;
    IF side IS NULL OR side NOT IN ('BUY','SELL') OR NOT poshkan_trade_test.positive(quantity) OR quantity <> round(quantity,8) THEN RAISE EXCEPTION 'Invalid side or quantity'; END IF;
    cost := round(quantity * p_quote, 8);
    IF cost <= 0 THEN RAISE EXCEPTION 'Trade is too small'; END IF;
    SELECT * INTO pos FROM poshkan_trade_test.positions x WHERE x.account_id = a.id AND x.symbol = symbol FOR UPDATE;
    IF side = 'BUY' THEN
      IF a.cash_balance < cost THEN RAISE EXCEPTION 'Insufficient cash'; END IF;
      UPDATE poshkan_trade_test.accounts SET cash_balance = cash_balance - cost WHERE id = a.id;
      IF pos.id IS NULL THEN
        INSERT INTO poshkan_trade_test.positions(account_id,symbol,quantity,avg_cost) VALUES(a.id,symbol,quantity,p_quote);
      ELSE
        UPDATE poshkan_trade_test.positions SET quantity = pos.quantity + quantity,
          avg_cost = (pos.quantity * pos.avg_cost + cost)/(pos.quantity + quantity) WHERE id = pos.id;
      END IF;
    ELSE
      IF pos.id IS NULL OR pos.quantity < quantity THEN RAISE EXCEPTION 'Not enough holdings'; END IF;
      UPDATE poshkan_trade_test.accounts SET cash_balance = cash_balance + cost WHERE id = a.id;
      IF pos.quantity = quantity THEN DELETE FROM poshkan_trade_test.positions WHERE id = pos.id;
      ELSE UPDATE poshkan_trade_test.positions SET quantity = pos.quantity - quantity WHERE id = pos.id; END IF;
    END IF;
    INSERT INTO poshkan_trade_test.transactions(account_id,symbol,side,quantity,price,cash_delta)
      VALUES(a.id,symbol,side,quantity,p_quote,CASE WHEN side = 'BUY' THEN -cost ELSE cost END);
    result := jsonb_build_object('action',action,'price',p_quote::text,'quantity',quantity::text);
  ELSIF action = 'OPEN_FX' THEN
    IF NOT poshkan_trade_test.positive(units) OR units <> round(units,8) OR leverage IS NULL OR leverage NOT IN (1,2,5,10)
      OR direction IS NULL OR direction NOT IN ('LONG','SHORT') THEN RAISE EXCEPTION 'Invalid units, direction or leverage'; END IF;
    margin := round((CASE WHEN symbol ~ '^USD[A-Z]{3}=X$' THEN units ELSE units * p_quote END)/leverage,2);
    IF margin <= 0 THEN RAISE EXCEPTION 'Position too small'; END IF;
    IF a.cash_balance < margin THEN RAISE EXCEPTION 'Insufficient cash for margin'; END IF;
    IF (sl IS NOT NULL AND (NOT poshkan_trade_test.positive(sl) OR (direction='LONG' AND sl>=p_quote) OR (direction='SHORT' AND sl<=p_quote)))
      OR (tp IS NOT NULL AND (NOT poshkan_trade_test.positive(tp) OR (direction='LONG' AND tp<=p_quote) OR (direction='SHORT' AND tp>=p_quote)))
    THEN RAISE EXCEPTION 'Invalid stop loss or take profit'; END IF;
    UPDATE poshkan_trade_test.accounts SET cash_balance = cash_balance - margin WHERE id = a.id;
    INSERT INTO poshkan_trade_test.fx_positions(account_id,symbol,direction,units,open_rate,margin,stop_loss,take_profit)
      VALUES(a.id,symbol,direction,units,p_quote,margin,sl,tp) RETURNING id INTO new_id;
    result := jsonb_build_object('action',action,'positionId',new_id,'price',p_quote::text,'margin',margin::text);
  ELSE
    SELECT * INTO fx FROM poshkan_trade_test.fx_positions x WHERE x.id = (p_command->>'positionId')::uuid AND x.account_id = a.id AND x.status = 'open' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Open position not found'; END IF;
    IF action = 'PROTECT_FX' THEN
      IF (sl IS NOT NULL AND (NOT poshkan_trade_test.positive(sl) OR (fx.direction='LONG' AND sl>=p_quote) OR (fx.direction='SHORT' AND sl<=p_quote)))
        OR (tp IS NOT NULL AND (NOT poshkan_trade_test.positive(tp) OR (fx.direction='LONG' AND tp<=p_quote) OR (fx.direction='SHORT' AND tp>=p_quote)))
      THEN RAISE EXCEPTION 'Invalid stop loss or take profit'; END IF;
      UPDATE poshkan_trade_test.fx_positions SET stop_loss=sl,take_profit=tp WHERE id=fx.id;
      result := jsonb_build_object('action',action,'positionId',fx.id);
    ELSE
      units := coalesce(units,fx.units);
      IF NOT poshkan_trade_test.positive(units) OR units > fx.units OR units <> round(units,8) THEN RAISE EXCEPTION 'Invalid close units'; END IF;
      margin := CASE WHEN units = fx.units THEN fx.margin ELSE round(fx.margin * units/fx.units,2) END;
      IF margin <= 0 OR (units < fx.units AND margin >= fx.margin) THEN RAISE EXCEPTION 'Partial close too small'; END IF;
      pnl := (p_quote-fx.open_rate)*units;
      IF fx.symbol ~ '^USD[A-Z]{3}=X$' THEN pnl := pnl/p_quote; END IF;
      IF fx.direction='SHORT' THEN pnl := -pnl; END IF;
      pnl := greatest(round(pnl,2),-margin);
      UPDATE poshkan_trade_test.accounts SET cash_balance = cash_balance + margin + pnl WHERE id = a.id;
      IF units = fx.units THEN
        UPDATE poshkan_trade_test.fx_positions SET status='closed',closed_at=now(),close_rate=p_quote,pnl=pnl WHERE id=fx.id;
      ELSE
        INSERT INTO poshkan_trade_test.fx_positions(account_id,symbol,direction,units,open_rate,margin,status,opened_at,closed_at,close_rate,pnl)
          VALUES(a.id,fx.symbol,fx.direction,units,fx.open_rate,margin,'closed',fx.opened_at,now(),p_quote,pnl);
        UPDATE poshkan_trade_test.fx_positions SET units=fx.units-units,margin=fx.margin-margin WHERE id=fx.id;
      END IF;
      result := jsonb_build_object('action',action,'positionId',fx.id,'units',units::text,'pnl',pnl::text,'releasedMargin',margin::text,'price',p_quote::text);
    END IF;
  END IF;
  UPDATE poshkan_trade_test.requests r SET result=result WHERE r.actor_id=actor_id AND r.request_id=p_request;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION poshkan_trade_test.completed(p_request uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE prior poshkan_trade_test.requests%rowtype;
BEGIN
  SELECT * INTO prior FROM poshkan_trade_test.requests r WHERE r.actor_id = poshkan_trade_test.actor() AND r.request_id=p_request;
  IF FOUND AND prior.command <> p_command THEN RAISE EXCEPTION 'Request ID reused with different trade'; END IF;
  RETURN prior.result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA poshkan_trade_test FROM PUBLIC, poshkan_trade_preview;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.state(), poshkan_trade_test.command(uuid,jsonb,numeric), poshkan_trade_test.completed(uuid,jsonb) TO poshkan_trade_preview;
COMMIT;
