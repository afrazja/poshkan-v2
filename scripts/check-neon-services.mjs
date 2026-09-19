import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { executeQuery } from '../src/lib/neon-app/query.mjs';

export async function verifyServices(db,{user,legacy,account}) {
  const c=await db.connect();
  const crypto=await account('crypto','10000');
  try {
    await c.query('BEGIN');
    const scoped=async(role,fn)=>{
      await c.query('SET LOCAL ROLE '+role);
      await c.query("SELECT set_config('poshkan.neon_user_id',$1,true)",[user]);
      return fn();
    };
    const deny=async(fn)=>{await c.query('SAVEPOINT denied');await assert.rejects(fn);await c.query('ROLLBACK TO SAVEPOINT denied');};
    const client=createClient('https://adapter.invalid','test',{auth:{persistSession:false},global:{fetch:(url,init)=>executeQuery(c,new URL(String(url)),init,'services')}});
    await scoped('poshkan_preview_services',async()=>{
      const own=await client.from('accounts').select('id,user_id');
      assert.equal(own.error,null);assert.ok(own.data.length);assert.ok(own.data.every(row=>row.user_id===legacy));
      await deny(()=>c.query('UPDATE poshkan_trade_test.accounts SET cash_balance=0 WHERE id=$1',[crypto]));
      const result=await client.from('market_quotes').upsert({symbol:'TEST',provider:'test',price:10,quote:{symbol:'TEST',price:10},fetched_at:new Date().toISOString()},{onConflict:'symbol'}).select('quote').single();
      assert.equal(result.error,null);assert.equal(result.data.quote.price,10);
      const read=await client.from('market_quotes').select('symbol,quote').in('symbol',['TEST']);assert.equal(read.data.length,1);
      const row=(await c.query('SELECT * FROM poshkan_trade_test.service_user()')).rows[0];assert.equal(row.id,legacy);
      await c.query('SELECT poshkan_trade_test.capture_delivery($1,$2,$3)',['email',row.email,{subject:'Test',html:'Test'}]);
      await c.query('SELECT poshkan_trade_test.capture_delivery($1,$2,$3)',['push',legacy,{title:'Test'}]);
      await deny(()=>c.query('SELECT poshkan_trade_test.capture_delivery($1,$2,$3)',['email','outside@example.invalid',{}]));
      assert.equal((await c.query('SELECT count(*)::int AS n FROM poshkan_trade_test.delivery_captures')).rows[0].n,2);
      await deny(()=>c.query('SELECT * FROM poshkan_stage.accounts'));
      const lease=randomUUID();
      assert.equal((await c.query("SELECT poshkan_trade_test.claim_service_job('custom',300,$1) AS claimed",[lease])).rows[0].claimed,true);
      assert.equal((await c.query("SELECT poshkan_trade_test.claim_service_job('custom',300,$1) AS claimed",[randomUUID()])).rows[0].claimed,false);
      await c.query("SELECT poshkan_trade_test.finish_service_job('custom',$1,'completed')",[randomUUID()]);
      assert.equal((await c.query("SELECT status FROM poshkan_trade_test.service_jobs WHERE name='custom'")).rows[0].status,'running');
      await c.query("SELECT poshkan_trade_test.finish_service_job('custom',$1,'completed')",[lease]);
      assert.equal((await c.query("SELECT status FROM poshkan_trade_test.service_jobs WHERE name='custom'")).rows[0].status,'completed');
    });
    await scoped('poshkan_preview_cache',async()=>{
      await deny(()=>c.query('SELECT * FROM poshkan_trade_test.profiles'));
      await deny(()=>c.query('SELECT poshkan_trade_test.service_user()'));
      assert.equal((await c.query("SELECT quote FROM poshkan_trade_test.market_quotes WHERE symbol='TEST'")).rows[0].quote.price,10);
    });
    await c.query('RESET ROLE');
    const hash=createHash('sha256').update(randomUUID()).digest('hex');
    const token=await c.query("INSERT INTO poshkan_trade_test.api_tokens(user_id,name,token_hash) VALUES($1,'Temporary test',$2) RETURNING id",[legacy,hash]);
    await scoped('poshkan_trade_preview',async()=>{
      assert.equal((await c.query('SELECT poshkan_trade_test.verify_api_token($1) AS id',[hash])).rows[0].id,legacy);
      await deny(()=>c.query('SELECT poshkan_trade_test.verify_api_token($1)',['invalid']));
    });
    await c.query('RESET ROLE');
    await c.query('DELETE FROM poshkan_trade_test.api_tokens WHERE id=$1',[token.rows[0].id]);
    const foreign=(await c.query('SELECT id FROM poshkan_trade_test.accounts WHERE user_id<>$1 LIMIT 1',[legacy])).rows[0].id;
    await scoped('poshkan_trade_preview',async()=>{
      await deny(()=>c.query('SELECT poshkan_trade_test.verify_api_token($1)',[hash]));
      const command={action:'GUARDED_CRYPTO',accountId:crypto,symbol:'BTC-USD',direction:'LONG',units:1,leverage:2,stopLoss:99,takeProfit:104,autoCloseMinutes:4320,dryRun:true};
      const run=(id,body=command,price=100)=>c.query('SELECT poshkan_trade_test.mcp_crypto_command($1,$2,$3) AS receipt',[id,body,price]);
      const dry=await run(randomUUID());assert.equal(dry.rows[0].receipt.opened,false);
      await deny(()=>run(randomUUID(),{...command,accountId:foreign}));
      await deny(()=>run(randomUUID(),{...command,units:100}));
      await deny(()=>run(randomUUID(),{...command,takeProfit:101}));
      const request=randomUUID(),body={...command,dryRun:false};
      const first=await run(request,body);assert.equal(first.rows[0].receipt.opened,true);
      assert.deepEqual((await run(request,body,110)).rows[0].receipt,first.rows[0].receipt);
      await deny(()=>run(request,{...body,units:2}));
      await deny(()=>run(randomUUID(),body));
      const pos=(await c.query('SELECT units,margin,auto_close_at,opened_at FROM poshkan_trade_test.fx_positions WHERE id=$1',[first.rows[0].receipt.position_id])).rows[0];
      assert.equal(Number(pos.margin),50);assert.equal((new Date(pos.auto_close_at)-new Date(pos.opened_at))/60000,4320);
    });
    await c.query('RESET ROLE');
    await c.query('UPDATE neon_auth."user" SET banned=true WHERE id=$1',[user]);
    await scoped('poshkan_preview_services',async()=>{await deny(()=>c.query('SELECT poshkan_trade_test.service_user()'));});
    await c.query('ROLLBACK');
    return ['service/cache role isolation, owner scoping and raw balance mutation denial','shared JSON quote cache upsert/read','email/push captured only for the mapped owner','scheduled job claim, duplicate suppression and matching lease completion','MCP valid/revoked tokens and guarded crypto risk limits, timer and idempotent receipts','banned owner blocks background service access'];
  } finally {await c.query('ROLLBACK').catch(()=>{});c.release();}
}
