-- Synthetic isolated fixture. No source snapshot, secrets, or account data.
CREATE SCHEMA poshkan_trade_test;
CREATE ROLE poshkan_trade_preview NOLOGIN;
GRANT USAGE ON SCHEMA poshkan_trade_test TO poshkan_trade_preview;
CREATE SCHEMA neon_auth;
CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY,banned boolean);
CREATE TABLE poshkan_trade_test.legacy_users(id uuid PRIMARY KEY,banned_until timestamptz);
CREATE TABLE poshkan_trade_test.auth_links(neon_user_id uuid,legacy_user_id uuid,application_access_enabled boolean);
CREATE TABLE poshkan_trade_test.accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,name text,type text,cash_balance numeric(20,8) CHECK(cash_balance>=0));
CREATE TABLE poshkan_trade_test.positions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid,symbol text,quantity numeric(20,8),avg_cost numeric(20,8),UNIQUE(account_id,symbol));
CREATE TABLE poshkan_trade_test.transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid,symbol text,side text,quantity numeric(20,8) DEFAULT 0,price numeric(20,8) DEFAULT 0,cash_delta numeric(20,8),created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE poshkan_trade_test.requests(actor_id uuid,request_id uuid,command jsonb,result jsonb,created_at timestamptz DEFAULT now(),PRIMARY KEY(actor_id,request_id));
CREATE TABLE poshkan_trade_test.fx_positions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid,symbol text,direction text,units numeric,open_rate numeric,margin numeric,stop_loss numeric,take_profit numeric,status text DEFAULT 'open',opened_at timestamptz DEFAULT now(),closed_at timestamptz,close_rate numeric,pnl numeric,auto_close_at timestamptz);
CREATE TABLE poshkan_trade_test.orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid,symbol text,side text,quantity numeric,limit_price numeric,status text DEFAULT 'pending',time_in_force text DEFAULT 'GTC',expires_at timestamptz,failure_reason text,created_at timestamptz DEFAULT clock_timestamp(),filled_at timestamptz,filled_price numeric);
CREATE TABLE poshkan_trade_test.fx_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid,symbol text,direction text,units numeric,entry_rate numeric,trigger_when text,leverage numeric,stop_loss numeric,take_profit numeric,status text DEFAULT 'pending',expires_at timestamptz,failure_reason text,created_at timestamptz DEFAULT now(),filled_at timestamptz,filled_rate numeric);
CREATE TABLE poshkan_trade_test.fx_tp_levels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),position_id uuid,price numeric,close_units numeric,status text DEFAULT 'pending',filled_at timestamptz);
CREATE FUNCTION poshkan_trade_test.owns_account(p_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM poshkan_trade_test.accounts WHERE id=p_id AND user_id=nullif(current_setting('poshkan.neon_user_id',true),'')::uuid) $$;
CREATE FUNCTION poshkan_trade_test.get_leaderboard() RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
