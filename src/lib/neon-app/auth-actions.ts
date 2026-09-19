'use server';
import { previewAuth } from '../neon-preview/auth';
import { fullAppEnabled } from '../neon-preview/config';
import { appUser } from './server';
import { createClient } from '../supabase/server';

export async function neonSession() {
  if (!fullAppEnabled()) return {data:{user:null},error:null};
  return {data:{user:await appUser()},error:null};
}
export async function neonSignOut() {
  if (!fullAppEnabled()) throw new Error('Unavailable');
  await previewAuth().signOut();
  return {error:null};
}
export async function neonChangePassword(currentPassword:string,newPassword:string) {
  if (!fullAppEnabled() || !await appUser()) return {error:{message:'Sign in first.'}};
  if (!currentPassword || newPassword.length<8) return {error:{message:'Enter your current password and a new password of at least 8 characters.'}};
  try {
    const {error}=await previewAuth().changePassword({currentPassword,newPassword,revokeOtherSessions:true});
    return error?{error:{message:'Password could not be changed. Check your current password.'}}:{error:null};
  } catch {return {error:{message:'Password change is temporarily unavailable.'}};}
}
export async function persistTheme(theme:unknown) {
  if(theme!=='dark' && theme!=='light') return;
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(user) await db.from('profiles').update({theme}).eq('id',user.id);
}
