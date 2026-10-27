import { actor,transaction } from '@/lib/neon-preview/trading';
import { fullAppEnabled } from '@/lib/neon-preview/config';
import { researchState,researchMutation } from '@/lib/neon-app/research';

export async function GET(request:Request) {
  if(!fullAppEnabled())return Response.json({available:false});
  try {
    const user=await actor();
    const accountId=new URL(request.url).searchParams.get('accountId')??undefined;
    return Response.json(await transaction(user,c=>researchState(c,accountId)));
  } catch {return Response.json({error:'Research could not be read. Check sign-in and account ownership.'},{status:400});}
}
export async function POST(request:Request) {
  // Cookie-authenticated mutations require the same origin; MCP uses its
  // separately verified token path and the identical database function.
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
  if(!fullAppEnabled())return Response.json({error:'Research is unavailable'},{status:503});
  try {
    const user=await actor();
    const body=await request.json();
    return Response.json(await transaction(user,c=>researchMutation(c,body.requestId,body.command)));
  } catch {return Response.json({error:'Could not save. Check inputs; links require a matching transaction executed after the original plan. Retry with the same request ID.'},{status:400});}
}
