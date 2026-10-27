import { actor,transaction } from '@/lib/neon-preview/trading';
import { fullAppEnabled } from '@/lib/neon-preview/config';
import { databaseSchema } from '@/lib/neon-app/schema.mjs';
import { researchReady } from '@/lib/neon-app/research';
import { z } from 'zod';
export async function GET(request:Request) {
  if(!fullAppEnabled())return Response.json({available:false,profile:null});
  try {
    const user=await actor(),account=z.uuid().parse(new URL(request.url).searchParams.get('accountId'));
    return Response.json(await transaction(user,async c=>{
      const owned=(await c.query(`SELECT id FROM ${databaseSchema()}.accounts WHERE id=$1 AND user_id=${databaseSchema()}.actor()`,[account])).rows[0];
      if(!owned)throw new Error('Account not found');
      if(!await researchReady(c))return {available:false,profile:null};
      return {available:true,profile:(await c.query(`SELECT * FROM ${databaseSchema()}.execution_profiles WHERE account_id=$1`,[account])).rows[0]??null};
    }));
  } catch{return Response.json({error:'Execution assumptions could not be loaded.'},{status:400});}
}
