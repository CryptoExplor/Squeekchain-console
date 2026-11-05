import { ACTION_REASONS } from './capabilities.js';
import { getAddress, keccak256, toHex } from 'viem';
import { requireSepolia, RpcTrustError } from './rpc.js';
// EIP-1967 well-known slots for transparent proxies.
export const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const abisFor = profile => ({ core:profile.abis.core, nft:profile.abis.nft, token:profile.abis.token, issuance:profile.abis.mining, staking:profile.abis.staking });
const same = (a,b) => String(a).toLowerCase()===String(b).toLowerCase();
const check = (ok,reason) => {if(!ok)throw new RpcTrustError(`${ACTION_REASONS.mismatch} ${reason}`);};
const slotAddress = value => {check(/^0x[0-9a-f]{64}$/i.test(value??''),'missing EIP-1967 slot');return getAddress('0x'+value.slice(-40));};
export function createChainVerifier(cache=new Map(),profile) {
  const pins=profile.identities.pins;
  const ABIS=abisFor(profile);
  const key=`identity:${JSON.stringify(profile.identities)}`;
  return {async prepare(client,snapshot,readIdentity) {
    requireSepolia(await client.getChainId());
    const blockNumber=snapshot.blockNumber, block=toHex(blockNumber), cached=cache.get(key);
    // Known expected addresses let cold code + slots share ONE batch per independent peer.
    const requests=[],expectations=[];
    const add=(method,params,field,expected,type)=>{requests.push({method,params});expectations.push({field,expected,type});};
    for(const [name,pin] of Object.entries(pins)) {
      add('eth_getStorageAt',[pin.address,IMPLEMENTATION_SLOT,block],`${name} implementation slot`,pin.implSlot,'slot');
      add('eth_getStorageAt',[pin.address,ADMIN_SLOT,block],`${name} admin slot`,pin.adminSlot,'slot');
      if(!cached) {
        // The published record for the current graph pins implementation runtime
        // hashes, not proxy runtime hashes. A null pin is skipped, never guessed.
        if(pin.runtimeCodeHash)add('eth_getCode',[pin.address,block],`${name} runtime hash`,pin.runtimeCodeHash,'code');
        if(pin.implCodeHash)add('eth_getCode',[pin.implSlot,block],`${name} implementation runtime hash`,pin.implCodeHash,'code');
      }
    }
    // Injected test contexts can use the normal client; production checks BOTH snapshot peers.
    const valuesByPeer=readIdentity ? await readIdentity(snapshot,requests) : [await Promise.all(requests.map(request=>request.method==='eth_getCode'?client.getCode({address:request.params[0],blockNumber}):client.getStorageAt({address:request.params[0],slot:request.params[1],blockNumber})))];
    if(readIdentity)check(valuesByPeer.length>=2,'two identity peers required');
    for(const values of valuesByPeer) {
      check(values.length===expectations.length,'identity batch count');
      expectations.forEach(({field,expected,type},i)=>{
        const actual=type==='slot'?slotAddress(values[i]):values[i]&&values[i]!=='0x'?keccak256(values[i]):null;
        check(same(actual,expected),field);
      });
    }
    // Mutable bindings MUST be re-read even when implementation/code hashes are cached.
    const calls=[],expected=[];
    for(const [name,pin] of Object.entries(pins)) {
      for(const field of ['implementationCodeAddress','implementationCodeVersion','implementationStorageLayoutDigest']) {
        const value=field==='implementationCodeAddress'?(pin.implCodeHash?pin.implSlot:null):pin[field];
        if(value!=null){calls.push({address:pin.address,abi:ABIS[name],functionName:field});expected.push([`${name}.${field}`,value]);}
      }
      if(name==='core'||name==='issuance'){calls.push({address:pin.address,abi:ABIS[name],functionName:'proxyAdmin'});expected.push([`${name}.proxyAdmin`,pin.adminSlot]);}
      // Staking has no proxyAdmin ABI: use its checked EIP-1967 admin slot above.
      for(const [field,value] of Object.entries(pin.wiring??{})){if(value==null)continue;calls.push({address:pin.address,abi:ABIS[name],functionName:field});expected.push([`${name}.${field}`,value]);}
    }
    calls.push({address:pins.core.address,abi:ABIS.core,functionName:'paused'},
      {address:pins.staking.address,abi:ABIS.staking,functionName:'paused'},
      {address:pins.nft.address,abi:ABIS.nft,functionName:'paused'},
      {address:pins.issuance.address,abi:ABIS.issuance,functionName:'state'});
    const values=await client.multicall({contracts:calls,allowFailure:false,blockNumber});
    expected.forEach(([field,value],i)=>{
      if(typeof value==='object')for(const [key,item] of Object.entries(value))check(same(values[i]?.[key],item),`${field}.${key}`);
      else check(same(values[i],value),field);
    });
    const [corePaused,stakingPaused,nftPaused,issuanceState]=values.slice(expected.length);
    const pauseState={core:corePaused,staking:stakingPaused,nft:nftPaused,issuance:issuanceState?.paused};
    check(Object.values(pauseState).every(value=>typeof value==='boolean'),'paused state unavailable');
    const value={pauseState,ok:true,trusted:true,problems:[],release:profile.identities.release,chainId:11155111,blockNumber:String(blockNumber),blockHash:snapshot.blockHash,
      cacheHit:Boolean(cached),fullVerificationBlockNumber:cached?.fullVerificationBlockNumber??String(blockNumber),fullVerificationBlockHash:cached?.fullVerificationBlockHash??snapshot.blockHash,slotsCheckedAtBlockNumber:String(blockNumber),wiringCheckedAtBlockNumber:String(blockNumber)};
    // The adapter commits only AFTER the final two-peer hash guard succeeds.
    return {value,commit:()=>cache.set(key,value)};
  }};
}
