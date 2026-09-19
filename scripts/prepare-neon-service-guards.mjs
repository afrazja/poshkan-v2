import { readFileSync, writeFileSync } from 'node:fs';
const extract=(file,name)=>{
  const source=readFileSync(file,'utf8');
  const start=source.indexOf(`create or replace function public.${name}(`);
  const end=source.indexOf('$$;',start)+3;
  if(start<0||end<3)throw new Error('Function not found');
  return source.slice(start,end).replaceAll('public.','poshkan_trade_test.').replaceAll('set search_path = public','set search_path = pg_catalog, poshkan_trade_test');
};
let risk=extract('supabase/mcp-crypto-risk.sql','mcp_open_crypto_position');
risk=risk.replace('begin\n',"begin\n  if not poshkan_trade_test.owns_account(p_account_id) then raise exception 'Account not found' using errcode='42501'; end if;\n");
// Preserve the source safeguards; put the identity check inside the definer.
if(!risk.includes('owns_account(p_account_id)'))risk=risk.replace('begin\r\n',"begin\r\n  if not poshkan_trade_test.owns_account(p_account_id) then raise exception 'Account not found' using errcode='42501'; end if;\r\n");
let claim=extract('supabase/crypto-cloud-monitor.sql','claim_crypto_monitor');
claim=claim.replace(/begin\r?\n/,"begin\n  if not poshkan_trade_test.owns_account(p_account_id) then raise exception 'Account not found' using errcode='42501'; end if;\n");
let cloud=extract('supabase/crypto-cloud-monitor.sql','open_cloud_crypto');
cloud=cloud.replace(/begin\r?\n/,"begin\n  if not poshkan_trade_test.owns_account((select account_id from poshkan_trade_test.crypto_monitor_runs where id=p_run_id)) then raise exception 'Account not found' using errcode='42501'; end if;\n  perform 1 from poshkan_trade_test.worker_control where id=1 and enabled for share;\n  if not found and not coalesce(p_dry_run,true) then raise exception 'Background execution is paused'; end if;\n");
writeFileSync('neon/service-guards.sql',`-- Derived from existing risk guards, with database ownership checks and background pause enforcement.\nBEGIN;\n${risk}\n${claim}\n${cloud}\nREVOKE ALL ON FUNCTION poshkan_trade_test.mcp_open_crypto_position(uuid,text,text,numeric,numeric,integer,numeric,numeric,integer,boolean),poshkan_trade_test.claim_crypto_monitor(uuid),poshkan_trade_test.open_cloud_crypto(uuid,text,text,numeric,numeric,numeric,numeric,boolean) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION poshkan_trade_test.claim_crypto_monitor(uuid),poshkan_trade_test.open_cloud_crypto(uuid,text,text,numeric,numeric,numeric,numeric,boolean),poshkan_trade_test.mcp_open_crypto_position(uuid,text,text,numeric,numeric,integer,numeric,numeric,integer,boolean) TO poshkan_preview_services;\nCOMMIT;\n`);
