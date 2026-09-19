import {readFileSync,writeFileSync} from 'node:fs';
const source = readFileSync('../poshkan-neon-migration/generated/source-schema.sql','utf8');
const copied = ['profiles','watchlist','alerts','account_snapshots','notifications','custom_strategies','custom_strategy_signals','smc_settings','smc_signals','ote_settings','ote_signals','trend_settings','trend_signals','meanrev_settings','meanrev_signals','candlerange_settings','candlerange_signals','api_tokens','push_subscriptions','email_prefs'];
const replace = s => s.replaceAll('public.','poshkan_trade_test.').replaceAll('auth.uid()','poshkan_trade_test.actor()').replaceAll("SET search_path TO 'public'","SET search_path TO 'pg_catalog', 'poshkan_trade_test'");
let sql = `-- Additive full-interface rehearsal. Existing trades and the original stage are preserved.\nBEGIN;\nDO $$ BEGIN IF to_regclass('poshkan_trade_test.profiles') IS NOT NULL THEN RAISE EXCEPTION 'Full app copy already exists'; END IF; IF NOT EXISTS (SELECT 1 FROM poshkan_stage.auth_links WHERE NOT application_access_enabled) THEN RAISE EXCEPTION 'Wrong migration state'; END IF; END $$;\n`;
for (const table of copied) sql += `CREATE TABLE poshkan_trade_test.${table} (LIKE poshkan_stage.${table} INCLUDING ALL);\nINSERT INTO poshkan_trade_test.${table} SELECT * FROM poshkan_stage.${table};\nALTER TABLE poshkan_trade_test.${table} ENABLE ROW LEVEL SECURITY;\n`;
sql += `CREATE FUNCTION poshkan_trade_test.owns_account(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM poshkan_trade_test.accounts WHERE id=p_id AND user_id=poshkan_trade_test.actor()) $$;\nREVOKE ALL ON FUNCTION poshkan_trade_test.owns_account(uuid) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION poshkan_trade_test.owns_account(uuid) TO poshkan_trade_preview;\n`;
const available = new Set([...copied,'accounts','positions','transactions','fx_positions','fx_orders','fx_tp_levels','orders']);
for (const match of source.matchAll(/CREATE POLICY [\s\S]*?;/g)) {
  const table = match[0].match(/ ON public\.(\w+)/)?.[1];
  if (available.has(table)) sql += replace(match[0])+'\n';
}
for (const table of available) sql += `GRANT SELECT ON poshkan_trade_test.${table} TO poshkan_trade_preview;\n`;
for (const table of ['watchlist','alerts','custom_strategies','api_tokens','push_subscriptions']) sql += `GRANT INSERT,UPDATE,DELETE ON poshkan_trade_test.${table} TO poshkan_trade_preview;\n`;
for (const prefix of ['smc','ote','trend','meanrev','candlerange']) sql += `GRANT INSERT,UPDATE ON poshkan_trade_test.${prefix}_settings TO poshkan_trade_preview;\n`;
sql += `GRANT UPDATE (name,leverage,ai_instruction,ai_symbols,auto_trade_enabled,auto_risk_pct,auto_max_open,auto_max_per_day,auto_daily_loss_pct,auto_min_minutes,auto_leverage,auto_max_position_pct,notify_enabled,hidden_from_leaderboard) ON poshkan_trade_test.accounts TO poshkan_trade_preview;\nGRANT UPDATE(theme,username,avatar_url,anthropic_api_key) ON poshkan_trade_test.profiles TO poshkan_trade_preview;\nGRANT UPDATE(read) ON poshkan_trade_test.notifications TO poshkan_trade_preview;\n`;
// Only the public leaderboard aggregate is ported. Private underlying tables
// remain restricted to their owner, and the app does not get service privileges.
const leaderboard = source.match(/CREATE FUNCTION public.get_leaderboard\(\)[\s\S]*?\n\$\$;/)?.[0];
if (!leaderboard) throw new Error('Missing leaderboard definition');
sql += replace(leaderboard).replaceAll('auth.users','poshkan_trade_test.legacy_users')+'\nREVOKE ALL ON FUNCTION poshkan_trade_test.get_leaderboard() FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION poshkan_trade_test.get_leaderboard() TO poshkan_trade_preview;\nCOMMIT;\n';
writeFileSync('neon/app-preview-setup.sql',sql);
