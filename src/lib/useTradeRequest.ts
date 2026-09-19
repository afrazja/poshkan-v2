'use client';
import { useRef } from 'react';

// Keep the same id when a user retries the same order after a lost response.
// Editing any input starts a new request; remounting the completed dialog does too.
export function useTradeRequest() {
  const current=useRef<{key:string;id:string}|null>(null);
  return <T extends object>(input:T):T & {requestId:string}=>{
    const key=JSON.stringify(input);
    if(current.current?.key!==key) current.current={key,id:crypto.randomUUID()};
    return {...input,requestId:current.current.id};
  };
}
