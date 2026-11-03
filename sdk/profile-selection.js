import { profileInput } from './profile-input.js';
import { createRpcContext } from './rpc.js';
import { PROFILES } from './deployments.js';
import { nftAbi } from './abi.js';
import { throwIfAborted } from './cancellation.js';
export function chooseProfile(current, counts) {
  const a=counts['sepolia-v6'],b=counts['sepolia-v9'];
  if(!/^\d+$/.test(a??'') || !/^\d+$/.test(b??''))return current;
  return BigInt(a)>0n && BigInt(b)===0n ? 'sepolia-v6' : BigInt(b)>0n && BigInt(a)===0n ? 'sepolia-v9' : current;
}
// Inventory suggests a profile; it never grants action authority. Actions verify the graph again.
export async function profileBalances(owner, options={}) {
  const context=options.rpcContext??createRpcContext(options), snapshot=await context.snapshot();
  const keys=['sepolia-v6','sepolia-v9'];
  const values=await context.client.multicall({contracts:keys.map(key=>({address:PROFILES[key].addresses.nft,abi:nftAbi,functionName:'balanceOf',args:[owner]})),allowFailure:true,blockNumber:snapshot.blockNumber});
  await context.check(snapshot);throwIfAborted(options.signal);
  return Object.fromEntries(keys.map((key,i)=>[key,values[i].status==='success'?String(values[i].result):null]));
}
export function profileFromHash(hash) { const key=String(hash).replace(/^#/,'').split('/')[0];try { return profileInput(key,{fallback:null}); } catch { return null; } }
