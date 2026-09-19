BEGIN;
CREATE OR REPLACE FUNCTION poshkan_trade_test.mcp_crypto_command(p_request uuid,p_command jsonb,p_quote numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE owner_id uuid:=poshkan_trade_test.actor(); prior poshkan_trade_test.requests%rowtype; receipt jsonb;
BEGIN
 IF p_request IS NULL OR p_command->>'action' IS DISTINCT FROM 'GUARDED_CRYPTO' THEN RAISE EXCEPTION 'Invalid guarded request'; END IF;
 INSERT INTO poshkan_trade_test.requests(actor_id,request_id,command) VALUES(owner_id,p_request,p_command) ON CONFLICT DO NOTHING;
 SELECT * INTO prior FROM poshkan_trade_test.requests WHERE actor_id=owner_id AND request_id=p_request FOR UPDATE;
 IF prior.command<>p_command THEN RAISE EXCEPTION 'Request ID reused with different trade'; END IF;
 IF prior.result IS NOT NULL THEN RETURN prior.result; END IF;
 receipt:=poshkan_trade_test.mcp_open_crypto_position((p_command->>'accountId')::uuid,p_command->>'symbol',p_command->>'direction',(p_command->>'units')::numeric,p_quote,(p_command->>'leverage')::integer,(p_command->>'stopLoss')::numeric,(p_command->>'takeProfit')::numeric,(p_command->>'autoCloseMinutes')::integer,(p_command->>'dryRun')::boolean);
 UPDATE poshkan_trade_test.requests SET result=receipt WHERE actor_id=owner_id AND request_id=p_request;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.mcp_crypto_command(uuid,jsonb,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.mcp_crypto_command(uuid,jsonb,numeric) TO poshkan_trade_preview;
COMMIT;
