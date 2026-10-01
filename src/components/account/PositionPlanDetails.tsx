import type { FxPosition } from '@/lib/types';
import { positionHoldingMinutes } from '@/lib/position-records.mjs';

export default function PositionPlanDetails({position:p,fmtPrice}:{position:FxPosition;fmtPrice:(value:number)=>string}) {
  const minutes=positionHoldingMinutes(p);
  return <div className="space-y-0.5 text-xs text-muted">
    <div>SL {p.stop_loss==null?'Not set':fmtPrice(Number(p.stop_loss))} · TP {p.take_profit==null?'Not set':fmtPrice(Number(p.take_profit))}</div>
    <div>Holding period: {minutes==null?'Not recorded':minutes===0?'No timer':`${minutes} minutes`}</div>
    <div>Deadline: {p.auto_close_at?new Date(p.auto_close_at).toLocaleString():'Not set'}</div>
  </div>;
}
