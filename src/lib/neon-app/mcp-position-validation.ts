import { assetTypeError } from '../assets';
export function validateMcpPosition(accountType:string,symbol:string) {
  if(accountType==='crypto')throw new Error('Use guarded crypto entry for crypto accounts');
  if(!['stocks','forex'].includes(accountType))throw new Error('Unsupported account market');
  const error=assetTypeError(accountType,symbol);
  if(error)throw new Error(error);
}
