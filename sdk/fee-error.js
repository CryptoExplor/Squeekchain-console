import { decodeErrorResult } from 'viem';
import { stakingAbi } from './abi-core-20261103.js';
import { rpcCauses } from './rpc-errors.js';
// viem cause.data, EIP-1193 data, and nested originalError envelopes.
export function unstakeQuoteError(error) {
  const pending=rpcCauses(error).map(item=>item.error),seen=new Set();
  for(let n=0;pending.length&&n<64;n++) {
    const item=pending.shift();
    if(item==null||seen.has(item))continue;seen.add(item);
    let decoded=item;
    if(typeof item==='string'&&/^0x[\da-f]{8,}$/i.test(item))try{decoded=decodeErrorResult({abi:stakingAbi,data:item});}catch{continue;}
    if(decoded?.errorName==='FeeLimitExceeded'&&decoded.args?.length===2)return {reasonCode:'feeRose',reason:'Fee rose',fee:String(decoded.args[0]),maxFee:String(decoded.args[1])};
    if(decoded?.errorName==='DeadlineExpired'&&(decoded.args==null||decoded.args.length===0))return {reasonCode:'quoteExpired',reason:'Quote expired'};
    if(typeof item==='object')for(const key of ['data','originalError','error','cause'])if(item[key]!=null)pending.push(item[key]);
  }
  return null;
}
export function feeLimitExceeded(error) {
  const decoded=unstakeQuoteError(error);
  return decoded?.reasonCode==='feeRose'?decoded:null;
}
