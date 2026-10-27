// Historical generic closures cannot reliably be reclassified.
export function positionExitLabel(position) {
  const reason=position.exit_reason??(['sl','tp','stopped'].includes(position.status)?position.status:null);
  return ({manual:'Manual close',timer:'Timed exit',sl:'Stop-loss',tp:'Take-profit',stopped:'Stop-out'})[reason]??(position.status==='open'?'Open':'Closed (reason not recorded)');
}
export function positionHoldingMinutes(position) {
  if(position.holding_minutes!=null)return Number(position.holding_minutes);
  if(!position.auto_close_at||!position.opened_at)return null;
  const minutes=Math.round((Date.parse(position.auto_close_at)-Date.parse(position.opened_at))/60000);
  return Number.isFinite(minutes)&&minutes>=0?minutes:null;
}
