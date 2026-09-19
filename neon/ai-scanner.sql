BEGIN;
ALTER TABLE poshkan_trade_test.fx_scan_alerts ADD COLUMN IF NOT EXISTS executed boolean NOT NULL DEFAULT false;
ALTER TABLE poshkan_trade_test.fx_scan_alerts ADD COLUMN IF NOT EXISTS executed_at timestamptz;
ALTER TABLE poshkan_trade_test.fx_scan_alerts ADD COLUMN IF NOT EXISTS proposal jsonb;
ALTER TABLE poshkan_trade_test.fx_scan_alerts ADD COLUMN IF NOT EXISTS receipt jsonb;

CREATE OR REPLACE FUNCTION poshkan_trade_test.claim_ai_signal(p_account uuid,p_proposal jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=poshkan_trade_test.actor(); signal_id uuid;
BEGIN
 PERFORM 1 FROM poshkan_trade_test.accounts WHERE id=p_account AND user_id=owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='42501'; END IF;
 IF p_proposal->>'direction' IS NULL OR p_proposal->>'direction' NOT IN('LONG','SHORT')
 OR p_proposal->>'pair' IS NULL OR p_proposal->>'pair' !~ '^[A-Z0-9.^=-]{1,24}$'
 OR p_proposal->>'entryType' IS NULL OR p_proposal->>'entryType' NOT IN('market','limit')
 OR NOT poshkan_trade_test.positive((p_proposal->>'entry')::numeric)
 OR NOT poshkan_trade_test.positive((p_proposal->>'stop')::numeric)
 OR NOT poshkan_trade_test.positive((p_proposal->>'takeProfit')::numeric)
 THEN RAISE EXCEPTION 'Invalid AI proposal'; END IF;
 IF EXISTS(SELECT 1 FROM poshkan_trade_test.fx_scan_alerts WHERE account_id=p_account
  AND symbol=p_proposal->>'pair' AND direction=p_proposal->>'direction' AND alerted_at>clock_timestamp()-interval '12 hours') THEN RETURN NULL; END IF;
 INSERT INTO poshkan_trade_test.fx_scan_alerts(account_id,symbol,direction,proposal,executed)
 VALUES(p_account,p_proposal->>'pair',p_proposal->>'direction',p_proposal,false) RETURNING id INTO signal_id;
 RETURN signal_id;
END $$;

-- Re-read account settings and exposure under the same account lock used by all
-- trades. Quotes are collected by the trusted server, then age-checked here.
CREATE OR REPLACE FUNCTION poshkan_trade_test.execute_ai_signal(p_signal uuid,p_quotes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=poshkan_trade_test.actor(); s poshkan_trade_test.fx_scan_alerts%rowtype;
 a poshkan_trade_test.accounts%rowtype; f poshkan_trade_test.fx_positions%rowtype;
 q numeric; at_time timestamptz; risk numeric; reward numeric; sl numeric; tp numeric;
 units numeric; margin numeric; risk_per_unit numeric; lev numeric; result jsonb;
 floating_loss numeric:=0; realized numeric; mark numeric; pnl numeric;
 day_start timestamptz:=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
 SELECT * INTO s FROM poshkan_trade_test.fx_scan_alerts WHERE id=p_signal;
 SELECT * INTO a FROM poshkan_trade_test.accounts WHERE id=s.account_id AND user_id=owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM poshkan_trade_test.fx_scan_alerts WHERE id=p_signal FOR UPDATE;
 IF s.receipt IS NOT NULL THEN RETURN s.receipt; END IF;
 PERFORM 1 FROM poshkan_trade_test.worker_control WHERE id=1 AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Background execution paused'; END IF;
 IF NOT coalesce(a.auto_trade_enabled,false) THEN RAISE EXCEPTION 'Account automatic entry disabled'; END IF;
 IF s.proposal IS NULL OR s.proposal->>'entryType'<>'market' OR s.executed
 OR s.alerted_at<clock_timestamp()-interval '5 minutes' THEN RAISE EXCEPTION 'Signal is not executable'; END IF;
 lev:=coalesce(a.auto_leverage,1);
 IF lev NOT IN(1,2,5,10) OR NOT poshkan_trade_test.positive(a.auto_risk_pct) OR a.auto_risk_pct>0.1
 OR NOT poshkan_trade_test.positive(a.auto_max_position_pct) OR a.auto_max_position_pct>1
 OR NOT poshkan_trade_test.positive(a.auto_daily_loss_pct) OR a.auto_daily_loss_pct>1
 OR a.auto_max_open NOT BETWEEN 1 AND 100 OR a.auto_max_per_day NOT BETWEEN 1 AND 1000
 OR a.auto_min_minutes NOT BETWEEN 0 AND 10080 THEN RAISE EXCEPTION 'Invalid automatic entry limits'; END IF;
 IF EXISTS(SELECT 1 FROM poshkan_trade_test.fx_positions WHERE account_id=a.id AND status='open' AND (symbol=s.symbol OR direction<>s.direction))
 OR EXISTS(SELECT 1 FROM poshkan_trade_test.fx_orders WHERE account_id=a.id AND status='pending' AND symbol=s.symbol)
 OR EXISTS(SELECT 1 FROM poshkan_trade_test.positions WHERE account_id=a.id AND symbol=s.symbol)
 OR (SELECT count(*) FROM poshkan_trade_test.fx_positions WHERE account_id=a.id AND status='open')>=a.auto_max_open
 THEN RAISE EXCEPTION 'Exposure limit reached'; END IF;
 IF (SELECT count(*) FROM poshkan_trade_test.fx_scan_alerts WHERE account_id=a.id AND executed AND coalesce(executed_at,alerted_at)>=day_start)>=a.auto_max_per_day
 OR EXISTS(SELECT 1 FROM poshkan_trade_test.fx_scan_alerts WHERE account_id=a.id AND executed AND coalesce(executed_at,alerted_at)>clock_timestamp()-make_interval(mins=>a.auto_min_minutes))
 THEN RAISE EXCEPTION 'Daily or frequency limit reached'; END IF;
 q:=(p_quotes->s.symbol->>'price')::numeric; at_time:=(p_quotes->s.symbol->>'at')::timestamptz;
 IF NOT poshkan_trade_test.positive(q) OR at_time IS NULL OR at_time<clock_timestamp()-interval '90 seconds' OR at_time>clock_timestamp()+interval '15 seconds' THEN RAISE EXCEPTION 'Fresh entry quote required'; END IF;
 SELECT coalesce(sum(closed.pnl),0) INTO realized FROM poshkan_trade_test.fx_positions closed WHERE closed.account_id=a.id AND closed.status<>'open' AND closed.closed_at>=day_start;
 FOR f IN SELECT * FROM poshkan_trade_test.fx_positions WHERE account_id=a.id AND status='open' LOOP
  mark:=(p_quotes->f.symbol->>'price')::numeric; at_time:=(p_quotes->f.symbol->>'at')::timestamptz;
  IF NOT poshkan_trade_test.positive(mark) OR at_time IS NULL OR at_time<clock_timestamp()-interval '90 seconds' OR at_time>clock_timestamp()+interval '15 seconds' THEN RAISE EXCEPTION 'Fresh exposure quotes required'; END IF;
  pnl:=(mark-f.open_rate)*f.units*(CASE WHEN f.direction='SHORT' THEN -1 ELSE 1 END);
  IF f.symbol ~ '^USD[A-Z]{3}=X$' THEN pnl:=pnl/mark; END IF;
  floating_loss:=floating_loss+least(0,greatest(-f.margin,pnl));
 END LOOP;
 IF realized+floating_loss<=-abs(a.cash_balance*a.auto_daily_loss_pct) THEN RAISE EXCEPTION 'Daily loss limit reached'; END IF;
 risk:=abs((s.proposal->>'entry')::numeric-(s.proposal->>'stop')::numeric);
 reward:=abs((s.proposal->>'takeProfit')::numeric-(s.proposal->>'entry')::numeric);
 IF NOT poshkan_trade_test.positive(risk) OR reward<2*risk OR risk>q*0.1 OR reward>q*0.1
 OR abs((s.proposal->>'entry')::numeric-q)>q*0.1
 OR (s.direction='LONG' AND ((s.proposal->>'stop')::numeric>=(s.proposal->>'entry')::numeric OR (s.proposal->>'takeProfit')::numeric<=(s.proposal->>'entry')::numeric))
 OR (s.direction='SHORT' AND ((s.proposal->>'stop')::numeric<=(s.proposal->>'entry')::numeric OR (s.proposal->>'takeProfit')::numeric>=(s.proposal->>'entry')::numeric)) THEN RAISE EXCEPTION 'Invalid stop or reward/risk'; END IF;
 sl:=q+(CASE WHEN s.direction='LONG' THEN -risk ELSE risk END);
 tp:=q+(CASE WHEN s.direction='LONG' THEN reward ELSE -reward END);
 risk_per_unit:=risk/(CASE WHEN s.symbol ~ '^USD[A-Z]{3}=X$' THEN sl ELSE 1 END);
 units:=least(a.cash_balance*a.auto_risk_pct/risk_per_unit,a.cash_balance*a.auto_max_position_pct*lev/(CASE WHEN s.symbol ~ '^USD[A-Z]{3}=X$' THEN 1 ELSE q END));
 units:=CASE WHEN a.type='stocks' THEN floor(units) WHEN a.type='forex' THEN floor(units/1000)*1000 ELSE floor(units*1000000)/1000000 END;
 margin:=round((CASE WHEN s.symbol ~ '^USD[A-Z]{3}=X$' THEN units ELSE units*q END)/lev,2);
 IF NOT poshkan_trade_test.positive(units) OR margin>a.cash_balance*a.auto_max_position_pct OR units*risk_per_unit>a.cash_balance*a.auto_risk_pct THEN RAISE EXCEPTION 'Position does not fit limits'; END IF;
 result:=poshkan_trade_test.command(p_signal,jsonb_build_object('action','OPEN_FX','accountId',a.id,'symbol',s.symbol,'direction',s.direction,'units',units::text,'leverage',lev,'stopLoss',sl::text,'takeProfit',tp::text),q);
 UPDATE poshkan_trade_test.fx_positions SET source='ai' WHERE id=(result->>'positionId')::uuid;
 UPDATE poshkan_trade_test.fx_scan_alerts SET executed=true,executed_at=clock_timestamp(),receipt=result WHERE id=p_signal;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.claim_ai_signal(uuid,jsonb),poshkan_trade_test.execute_ai_signal(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.claim_ai_signal(uuid,jsonb),poshkan_trade_test.execute_ai_signal(uuid,jsonb) TO poshkan_preview_services;
COMMIT;
