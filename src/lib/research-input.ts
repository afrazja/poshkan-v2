import { z } from 'zod';
const text=(max:number)=>z.string().trim().min(1).max(max);
const accountId=z.uuid();
const amount=(max:number)=>z.number().finite().min(0).max(max);
export const researchInput=z.discriminatedUnion('action',[
  z.object({action:z.literal('PLAN'),accountId,symbol:text(24).toUpperCase().regex(/^[A-Z0-9.^=-]+$/),decision:z.enum(['TRADE','NO_TRADE']),hypothesis:text(4000),strategyVersion:text(120),entryConditions:text(2000),exitConditions:text(2000),holdingDays:z.number().int().min(1).max(252),positionSizing:text(2000)}).strict(),
  z.object({action:z.literal('REVIEW'),entryId:z.uuid(),note:text(4000)}).strict(),
  z.object({action:z.literal('LINK'),entryId:z.uuid(),transactionId:z.uuid()}).strict(),
  z.object({action:z.literal('PROFILE'),accountId,label:text(80),fixedFee:amount(1000),perUnitFee:amount(100),feeBps:amount(1000),minimumFee:amount(1000),halfSpreadBps:amount(1000),slippageBps:amount(1000)}).strict(),
]);
export type ResearchCommand=z.infer<typeof researchInput>;
