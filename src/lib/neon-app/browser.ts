import type { SupabaseClient } from '@supabase/supabase-js';
import { neonSession, neonSignOut } from './auth-actions';
// Authentication only. Database access remains in authenticated server actions.
export function neonBrowser():SupabaseClient {
  const unavailable=async()=>({error:{message:'The local migration test uses your existing email account. New signups and social login will be enabled at cutover.'}});
  return {auth:{getUser:neonSession,signOut:neonSignOut,signUp:unavailable,signInWithOAuth:unavailable,
    onAuthStateChange(callback:(event:string)=>void) {
      let active=true;
      const timer=setInterval(()=>{void neonSession().then(({data})=>{if(active && !data.user) callback('SIGNED_OUT');}).catch(()=>{});},60000);
      return {data:{subscription:{unsubscribe(){active=false;clearInterval(timer);}}}};
    },
  }} as unknown as SupabaseClient;
}
