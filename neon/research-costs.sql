-- Additive migration for the current Neon engine. See docs/research-journal.md.
BEGIN;
ALTER TABLE poshkan_trade_test.transactions ADD COLUMN IF NOT EXISTS explicit_fee numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_price numeric(20,8),
  ADD COLUMN IF NOT EXISTS spread_cost numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slippage_cost numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_profile jsonb,
  ADD COLUMN IF NOT EXISTS quote_at timestamptz,
  ADD COLUMN IF NOT EXISTS realized_pnl numeric(20,8);
CREATE TABLE IF NOT EXISTS poshkan_trade_test.execution_profiles (
  account_id uuid PRIMARY KEY REFERENCES poshkan_trade_test.accounts(id) ON DELETE CASCADE,
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
  fixed_fee numeric NOT NULL DEFAULT 0 CHECK(fixed_fee BETWEEN 0 AND 1000),
  per_unit_fee numeric NOT NULL DEFAULT 0 CHECK(per_unit_fee BETWEEN 0 AND 100),
  fee_bps numeric NOT NULL DEFAULT 0 CHECK(fee_bps BETWEEN 0 AND 1000),
  minimum_fee numeric NOT NULL DEFAULT 0 CHECK(minimum_fee BETWEEN 0 AND 1000),
  half_spread_bps numeric NOT NULL DEFAULT 0 CHECK(half_spread_bps BETWEEN 0 AND 1000),
  slippage_bps numeric NOT NULL DEFAULT 0 CHECK(slippage_bps BETWEEN 0 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE poshkan_trade_test.execution_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS execution_profiles_read ON poshkan_trade_test.execution_profiles;
CREATE POLICY execution_profiles_read ON poshkan_trade_test.execution_profiles FOR SELECT
  USING(poshkan_trade_test.owns_account(account_id));
GRANT SELECT ON poshkan_trade_test.execution_profiles TO poshkan_trade_preview;

-- Original plans are append-only. Later reviews and links are separate records.
-- Account deletion preserves research and linked ledger snapshots; reset preserves all.
CREATE TABLE IF NOT EXISTS poshkan_trade_test.research_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES poshkan_trade_test.legacy_users(id),
  account_id uuid REFERENCES poshkan_trade_test.accounts(id) ON DELETE SET NULL,
  account_name text NOT NULL,
  symbol text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('TRADE','NO_TRADE')),
  hypothesis text NOT NULL CHECK(length(hypothesis) BETWEEN 1 AND 4000),
  strategy_version text NOT NULL CHECK(length(strategy_version) BETWEEN 1 AND 120),
  entry_conditions text NOT NULL CHECK(length(entry_conditions) BETWEEN 1 AND 2000),
  exit_conditions text NOT NULL CHECK(length(exit_conditions) BETWEEN 1 AND 2000),
  holding_days integer NOT NULL CHECK(holding_days BETWEEN 1 AND 252),
  position_sizing text NOT NULL CHECK(length(position_sizing) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS poshkan_trade_test.research_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES poshkan_trade_test.research_entries(id),
  note text NOT NULL CHECK(length(note) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS poshkan_trade_test.research_links (
  entry_id uuid NOT NULL REFERENCES poshkan_trade_test.research_entries(id),
  transaction_key uuid NOT NULL UNIQUE,
  transaction_id uuid REFERENCES poshkan_trade_test.transactions(id) ON DELETE SET NULL,
  ledger_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(entry_id,transaction_key)
);
CREATE INDEX IF NOT EXISTS research_owner_date ON poshkan_trade_test.research_entries(user_id,created_at DESC);
ALTER TABLE poshkan_trade_test.research_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE poshkan_trade_test.research_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE poshkan_trade_test.research_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_entries_read ON poshkan_trade_test.research_entries;
DROP POLICY IF EXISTS research_reviews_read ON poshkan_trade_test.research_reviews;
DROP POLICY IF EXISTS research_links_read ON poshkan_trade_test.research_links;
CREATE POLICY research_entries_read ON poshkan_trade_test.research_entries FOR SELECT USING(user_id=poshkan_trade_test.actor());
CREATE POLICY research_reviews_read ON poshkan_trade_test.research_reviews FOR SELECT USING(EXISTS(SELECT 1 FROM poshkan_trade_test.research_entries e WHERE e.id=entry_id AND e.user_id=poshkan_trade_test.actor()));
CREATE POLICY research_links_read ON poshkan_trade_test.research_links FOR SELECT USING(EXISTS(SELECT 1 FROM poshkan_trade_test.research_entries e WHERE e.id=entry_id AND e.user_id=poshkan_trade_test.actor()));
GRANT SELECT ON poshkan_trade_test.research_entries,poshkan_trade_test.research_reviews,poshkan_trade_test.research_links TO poshkan_trade_preview;

CREATE OR REPLACE FUNCTION poshkan_trade_test.spot_cost(p_account uuid,p_side text,p_qty numeric,p_price numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p poshkan_trade_test.execution_profiles%rowtype; spread numeric:=0; slip numeric:=0; fill numeric; fee numeric:=0;
BEGIN
  SELECT * INTO p FROM poshkan_trade_test.execution_profiles WHERE account_id=p_account;
  IF FOUND THEN
    spread:=round(p_price*p.half_spread_bps/10000,8);
    slip:=round(p_price*p.slippage_bps/10000,8);
  END IF;
  fill:=round(p_price+CASE WHEN p_side='BUY' THEN spread+slip ELSE -spread-slip END,8);
  IF NOT poshkan_trade_test.positive(fill) THEN RAISE EXCEPTION 'Invalid execution price'; END IF;
  IF p.account_id IS NOT NULL THEN fee:=round(greatest(p.minimum_fee,p.fixed_fee+p.per_unit_fee*p_qty+fill*p_qty*p.fee_bps/10000),8); END IF;
  RETURN jsonb_build_object('price',fill,'fee',fee,'spread',round(spread*p_qty,8),'slippage',round(slip*p_qty,8),
    'profile',CASE WHEN p.account_id IS NULL THEN jsonb_build_object('label','Zero explicit fees; direct quote') ELSE to_jsonb(p)-'account_id' END);
END $$;

CREATE OR REPLACE FUNCTION poshkan_trade_test.research_command(p_request uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=poshkan_trade_test.actor(); prior poshkan_trade_test.requests%rowtype;
  a poshkan_trade_test.accounts%rowtype; e poshkan_trade_test.research_entries%rowtype;
  t poshkan_trade_test.transactions%rowtype; new_id uuid; v_result jsonb; action text:=p_command->>'action';
BEGIN
  IF p_request IS NULL OR action IS NULL OR action NOT IN ('PLAN','REVIEW','LINK','PROFILE') THEN RAISE EXCEPTION 'Invalid research command'; END IF;
  INSERT INTO poshkan_trade_test.requests(actor_id,request_id,command) VALUES(owner_id,p_request,p_command) ON CONFLICT DO NOTHING;
  SELECT * INTO prior FROM poshkan_trade_test.requests WHERE actor_id=owner_id AND request_id=p_request FOR UPDATE;
  IF prior.command<>p_command THEN RAISE EXCEPTION 'Request ID reused with different trade'; END IF;
  IF prior.result IS NOT NULL THEN RETURN prior.result; END IF;
  IF action IN ('PLAN','PROFILE') THEN
    SELECT * INTO a FROM poshkan_trade_test.accounts WHERE id=(p_command->>'accountId')::uuid AND user_id=owner_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='42501'; END IF;
    IF a.type='forex' THEN RAISE EXCEPTION 'Research journal supports spot accounts'; END IF;
    IF action='PLAN' THEN
      IF p_command->>'symbol' IS NULL OR p_command->>'symbol' !~ '^[A-Z0-9.^=-]{1,24}$' THEN RAISE EXCEPTION 'Invalid symbol'; END IF;
      INSERT INTO poshkan_trade_test.research_entries(user_id,account_id,account_name,symbol,decision,hypothesis,strategy_version,entry_conditions,exit_conditions,holding_days,position_sizing)
        VALUES(owner_id,a.id,a.name,p_command->>'symbol',p_command->>'decision',p_command->>'hypothesis',p_command->>'strategyVersion',p_command->>'entryConditions',p_command->>'exitConditions',(p_command->>'holdingDays')::integer,p_command->>'positionSizing') RETURNING id INTO new_id;
    ELSE
      INSERT INTO poshkan_trade_test.execution_profiles(account_id,label,fixed_fee,per_unit_fee,fee_bps,minimum_fee,half_spread_bps,slippage_bps)
      VALUES(a.id,p_command->>'label',(p_command->>'fixedFee')::numeric,(p_command->>'perUnitFee')::numeric,(p_command->>'feeBps')::numeric,(p_command->>'minimumFee')::numeric,(p_command->>'halfSpreadBps')::numeric,(p_command->>'slippageBps')::numeric)
      ON CONFLICT(account_id) DO UPDATE SET label=EXCLUDED.label,fixed_fee=EXCLUDED.fixed_fee,per_unit_fee=EXCLUDED.per_unit_fee,fee_bps=EXCLUDED.fee_bps,minimum_fee=EXCLUDED.minimum_fee,half_spread_bps=EXCLUDED.half_spread_bps,slippage_bps=EXCLUDED.slippage_bps,updated_at=clock_timestamp();
      new_id:=a.id;
    END IF;
  ELSE
    SELECT * INTO e FROM poshkan_trade_test.research_entries WHERE id=(p_command->>'entryId')::uuid AND user_id=owner_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Research entry not found' USING ERRCODE='42501'; END IF;
    IF action='REVIEW' THEN
      INSERT INTO poshkan_trade_test.research_reviews(entry_id,note) VALUES(e.id,p_command->>'note') RETURNING id INTO new_id;
    ELSE
      -- Lock the account first to serialize against reset/deletion and execution.
      PERFORM 1 FROM poshkan_trade_test.accounts WHERE id=e.account_id AND user_id=owner_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
      SELECT * INTO t FROM poshkan_trade_test.transactions WHERE id=(p_command->>'transactionId')::uuid AND account_id=e.account_id FOR SHARE;
      IF NOT FOUND OR e.decision<>'TRADE' OR t.symbol<>e.symbol OR t.side NOT IN ('BUY','SELL') OR t.created_at<e.created_at THEN RAISE EXCEPTION 'Transaction must match a prior trade plan'; END IF;
      INSERT INTO poshkan_trade_test.research_links(entry_id,transaction_key,transaction_id,ledger_snapshot) VALUES(e.id,t.id,t.id,to_jsonb(t)) ON CONFLICT(entry_id,transaction_key) DO NOTHING;
      new_id:=t.id;
    END IF;
  END IF;
  v_result:=jsonb_build_object('id',new_id);
  UPDATE poshkan_trade_test.requests SET result=v_result WHERE actor_id=owner_id AND request_id=p_request;
  RETURN v_result;
END $$;
CREATE OR REPLACE FUNCTION poshkan_trade_test.quoted_spot(p_request uuid,p_command jsonb,p_quote numeric,p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt jsonb;
BEGIN
  receipt:=poshkan_trade_test.completed(p_request,p_command);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF p_command->>'action'<>'SPOT' THEN RAISE EXCEPTION 'Invalid trade'; END IF;
  IF p_at IS NULL OR NOT isfinite(p_at) OR p_at<clock_timestamp()-interval '5 minutes' OR p_at>clock_timestamp()+interval '1 minute' THEN RAISE EXCEPTION 'A fresh market price is unavailable'; END IF;
  receipt:=poshkan_trade_test.command(p_request,p_command,p_quote);
  UPDATE poshkan_trade_test.transactions SET quote_at=p_at WHERE id=(receipt->>'transactionId')::uuid AND quote_at IS NULL;
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION poshkan_trade_test.quoted_spot(uuid,jsonb,numeric,timestamptz),poshkan_trade_test.spot_cost(uuid,text,numeric,numeric),poshkan_trade_test.research_command(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.quoted_spot(uuid,jsonb,numeric,timestamptz) TO poshkan_trade_preview;
GRANT EXECUTE ON FUNCTION poshkan_trade_test.research_command(uuid,jsonb) TO poshkan_trade_preview;
COMMIT;
