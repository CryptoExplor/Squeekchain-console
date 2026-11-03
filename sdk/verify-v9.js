import { ACTION_REASONS } from './capabilities.js';
import { getAddress, keccak256, toHex } from 'viem';
import { core9Abi, issuance9Abi, staking9Abi, token9Abi, nft9Abi } from './abi-v9.js';
import { IMPLEMENTATION_SLOT, ADMIN_SLOT } from './verify.js';
import { requireSepolia, RpcTrustError } from './rpc.js';
const ABIS = { core:core9Abi, issuance:issuance9Abi, staking:staking9Abi, token:token9Abi, nft:nft9Abi };
const same = (a,b) => String(a).toLowerCase()===String(b).toLowerCase();
const check = (ok,reason) => {if(!ok)throw new RpcTrustError(`${ACTION_REASONS.mismatch} ${reason}`);};
const slotAddress = value => {check(/^0x[0-9a-f]{64}$/i.test(value??''),'missing EIP-1967 slot');return getAddress('0x'+value.slice(-40));};
export function createV9Verifier(cache=new Map(),profile) {
  const pins=profile.identities.pins;
  const key=`v9:${JSON.stringify(profile.identities)}`;
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
        add('eth_getCode',[pin.address,block],`${name} runtime hash`,pin.runtimeCodeHash,'code');
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
      for(const [field,value] of Object.entries(pin.wiring)){calls.push({address:pin.address,abi:ABIS[name],functionName:field});expected.push([`${name}.${field}`,value]);}
    }
    calls.push({address:pins.core.address,abi:core9Abi,functionName:'paused'},
      {address:pins.staking.address,abi:staking9Abi,functionName:'paused'},
      {address:pins.nft.address,abi:nft9Abi,functionName:'paused'},
      {address:pins.issuance.address,abi:issuance9Abi,functionName:'state'});
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
