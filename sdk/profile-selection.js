import { getAddress } from 'viem';
import { PROFILES } from './deployments.js';
import { nftAbi } from './abi.js';
import { nft9Abi, staking9Abi } from './abi-v9.js';
import { createRpcContext } from './rpc.js';
import { createDiscoveryStore } from './discovery.js';
import { depositedIds } from './deposits.js';
import { isRpcAvailabilityError, isTrustError } from './rpc-errors.js';
import { throwIfAborted } from './cancellation.js';
import { profileInput } from './profile-input.js';
export function profileFromHash(hash) {const key=String(hash).replace(/^#\/?/,'').split('/')[0];try{return profileInput(key,{fallback:null});}catch{return null;}}
const positive = value => value!=null && BigInt(value)>0n;
export function profileHeld(count) {return Boolean(count&&(positive(count.wallet)||positive(count.nftPower)));}
const knownEmpty = count => count?.wallet==='0' && count.nftPower==='0';
export function chooseProfile(current,counts) {
  const v6=counts['sepolia-v6'],v9=counts['sepolia-v9'];
  if(profileHeld(v6)&&knownEmpty(v9))return 'sepolia-v6';
  if(profileHeld(v9)&&knownEmpty(v6))return 'sepolia-v9';
  return current;
}
export function profileCountLabel(count) {return `${count?.wallet??'Unknown'} in wallet · ${count?.staked==null?'Staked (Unknown)':count.staked+' staked'}`;}
// Balance and NFT POWER are read together at the guarded snapshot. Power detects
// holdings; it is NEVER presented as a token count. Count comes from confirmed logs.
export async function profileBalances(owner,{signal,rpcContext,context=rpcContext,discoveryCache=createDiscoveryStore(),accountSource,...options}={}) {
  owner=getAddress(owner.toLowerCase());context??=createRpcContext({...options,signal});
  throwIfAborted(signal);
  const snapshot=await context.snapshot();
  const values=await context.client.multicall({contracts:[
    {address:PROFILES['sepolia-v6'].addresses.nft,abi:nftAbi,functionName:'balanceOf',args:[owner]},
    {address:PROFILES['sepolia-v9'].addresses.nft,abi:nft9Abi,functionName:'balanceOf',args:[owner]},
    {address:PROFILES['sepolia-v9'].addresses.staking,abi:staking9Abi,functionName:'accountPower',args:[owner]},
  ],allowFailure:true,blockNumber:snapshot.blockNumber});
  const power=values[2].status==='success'?values[2].result[0]:null;
  let staked=power===0n?'0':null;
  if(power!==0n)try {staked=String((await depositedIds({client:context.client,snapshot,profile:PROFILES['sepolia-v9'],owner,store:discoveryCache,signal})).length);}
  catch(error){if(signal?.aborted||isTrustError(error)||!isRpcAvailabilityError(error))throw error; /* Unknown count, but positive power still proves held. */}
  if(power>0n && staked==='0')staked=null;
  await context.check(snapshot);throwIfAborted(signal);
  return {'sepolia-v6':{wallet:values[0].status==='success'?String(values[0].result):null,staked:'0',nftPower:'0'},
    'sepolia-v9':{wallet:values[1].status==='success'?String(values[1].result):null,staked,nftPower:power==null?null:String(power)}};
}
