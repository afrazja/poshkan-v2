import { approvedUserId } from '../neon-preview/config';
import { databaseSchema } from './schema.mjs';
import 'server-only';
import { createClient as supabaseClient, AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { transaction } from '../neon-preview/trading';
import { cache } from 'react';
import { fullAppEnabled } from '../neon-preview/config';
import { previewAuth } from '../neon-preview/auth';
import { executeQuery } from './query.mjs';

export async function appUser() {
  try {
    if(!fullAppEnabled()) return null;
    const {data} = await previewAuth().getSession({query:{disableCookieCache:true}});
    const id=data?.user.id;
    if(!id||id!==approvedUserId()) return null;
    const legacy = await transaction(id,async c=>(await c.query(`SELECT ${databaseSchema()}.actor() AS id`)).rows[0].id as string);
    return {id:legacy,email:data?.user.email ?? '',neonId:id,aud:'authenticated',app_metadata:{},user_metadata:{},created_at:String(data?.user.createdAt??'')};
  } catch { return null; }
}
const requestUser=cache(appUser);

export function createNeonClient(): SupabaseClient {
  const client = supabaseClient('https://neon-adapter.invalid','local-adapter',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async (input,init)=>{
      try {
        const user=await requestUser();
        if(!user) return Response.json({message:'Sign in first',code:'42501'},{status:401});
        const id=user.neonId;
        const url=new URL(String(input));
        if (url.pathname.includes('/rpc/')) {
          const name=url.pathname.split('/').pop();
          const args=JSON.parse(String(init?.body||'{}'));
          const result=await transaction(id,async c=>{
            if(name==='get_leaderboard') return (await c.query(`SELECT coalesce(jsonb_agg(r),'[]') AS result FROM ${databaseSchema()}.get_leaderboard() r`)).rows[0].result;
            if(name==='create_account') return (await c.query(`SELECT ${databaseSchema()}.app_account('CREATE',NULL,$1) AS result`,[{name:args.p_name,type:args.p_type,amount:args.p_initial_cash}])).rows[0].result.id;
            if(name==='adjust_cash') return (await c.query(`SELECT ${databaseSchema()}.app_account($1,$2,$3) AS result`,[args.p_mode,args.p_account_id,{amount:args.p_amount}])).rows[0].result;
            throw new Error('This service is not connected in the local app yet.');
          });
          return Response.json(result);
        }
        return await transaction(id,c=>executeQuery(c,url,init));
      } catch (error) {
        const code=(error as {code?:string}).code;
        const message=code==='23505'?'This record already exists.':code==='42501'?'This change is not allowed.':'The operation could not be completed. Refresh and try again.';
        console.error('[neon-app] Query failed',code||'validation');
        return Response.json({message,code:code||'APP_ERROR',details:'',hint:''},{status:400});
      }
    }},
  });
  client.auth.getUser = async ()=>{
    const user=await requestUser();
    return user?{data:{user},error:null}:{data:{user:null},error:new AuthSessionMissingError()};
  };
  return client;
}
