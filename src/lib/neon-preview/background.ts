import { databaseSchema } from '../neon-app/schema.mjs';
import "server-only";
import { actor, transaction } from "./trading";
import type { WorkerState } from "./worker-state";

export async function readWorker(): Promise<WorkerState|null> {
  const userId=await actor();
  return transaction(userId,async c=>{
    const ready=(await c.query(`SELECT to_regprocedure('${databaseSchema()}.worker_state()') IS NOT NULL AS ready`)).rows[0].ready;
    return ready?(await c.query(`SELECT ${databaseSchema()}.worker_state() AS state`)).rows[0].state:null;
  });
}
export async function changeWorker(enabled: boolean): Promise<WorkerState> {
  const userId=await actor();
  return transaction(userId,async c=>(await c.query(`SELECT ${databaseSchema()}.set_worker($1) AS state`,[enabled])).rows[0].state);
}
