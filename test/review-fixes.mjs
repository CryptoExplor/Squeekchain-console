import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeEventTopics, encodeAbiParameters, encodeErrorResult, pad, toHex, zeroAddress } from 'viem';
import { PROFILES } from '../sdk/deployments.js';
import { stakingAbi } from '../sdk/abi-core-20261103.js';
import { profileFromHash, canonicalHash } from '../sdk/profile-input.js';
import { depositedIds } from '../sdk/deposits.js';
import { createDiscoveryStore } from '../sdk/discovery.js';
import { readIdentityBatch } from '../sdk/identity-batch.js';
import { RpcAvailabilityError, RpcTrustError, isTrustError, isRpcAvailabilityError } from '../sdk/rpc-errors.js';
import { createRpcContext } from '../sdk/rpc.js';
import { feeLimitExceeded } from '../sdk/fee-error.js';
import { createAccountTokenSource } from '../sdk/account-discovery.js';
const profile=PROFILES['sepolia'],owner='0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const snapshot={blockNumber:profile.startBlock+10n,blockHash:'0x'+'ab'.repeat(32)};
const response=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
function log(eventName,args,index=0) {
  args={account:owner,collection:profile.addresses.nft,...args};
  const fields=stakingAbi.find(item=>item.type==='event'&&item.name===eventName).inputs.filter(input=>!input.indexed);
  return {address:profile.addresses.staking,blockNumber:toHex(snapshot.blockNumber),logIndex:toHex(index),removed:false,
    topics:encodeEventTopics({abi:stakingAbi,eventName,args}),data:encodeAbiParameters(fields,fields.map(input=>args[input.name]??0n))};
}
// Staked inventory is now sdk/deposits.js (used by walletStatus at the same guarded snapshot).
// Ported invariants: indexed owner+collection history only, same-snapshot depositor/custody
// confirmation in ONE multicall, Unknown (throw) instead of a zero count, adaptive log ranges.
async function staked({historyFail=false,logs,maxRange,wrongDepositor=false,wrongCustody=false}={}) {
  const calls=[];
  const client={
    multicall:async request=>{
      calls.push(request);assert.equal(request.blockNumber,snapshot.blockNumber);assert.equal(request.allowFailure,false);
      return request.contracts.map(c=>c.functionName==='depositor'?(wrongDepositor?zeroAddress:owner):wrongCustody?owner:profile.addresses.staking);
    },
    getBlock:async()=>{throw new Error('no cache in this fixture');},
    request:async request=>{
      calls.push(request);assert.equal(request.method,'eth_getLogs');
      const [q]=request.params;assert.ok(BigInt(q.toBlock)<=snapshot.blockNumber);assert.ok(BigInt(q.fromBlock)>=profile.startBlock);
      if(maxRange&&BigInt(q.toBlock)-BigInt(q.fromBlock)+1n>maxRange)throw Object.assign(new Error('JSON-RPC request failed'),{cause:{details:'getLogs request exceeded max allowed range'}});
      if(BigInt(q.toBlock)<snapshot.blockNumber)return [];
      assert.equal(q.topics[0].length,3);assert.equal(q.topics[1],pad(owner));assert.equal(q.topics[2],pad(profile.addresses.nft));
      if(historyFail)throw new RpcAvailabilityError(new Error('Historical logs unavailable'));
      return logs??[log('Deposited',{tokenId:1n},0),log('Deposited',{tokenId:2n},1),log('Deposited',{tokenId:3n},2),log('Withdrawn',{tokenId:2n},3)];
    },
  };
  const ids=await depositedIds({client,snapshot,profile,owner,store:createDiscoveryStore(null)});
  return {ids,calls};
}
assert.equal(profileFromHash(''),null);assert.equal(profileFromHash('#not-a-profile'),null);
assert.equal(profileFromHash('#sepolia/explore'),'sepolia');assert.equal(profileFromHash('#sepolia-v9/explore'),'sepolia','old links are input aliases only');assert.equal(profileFromHash('#mainnet'),'mainnet');
assert.equal(canonicalHash('#sepolia-v6/squeeks'),'#sepolia/squeeks');assert.equal(canonicalHash('#sepolia/squeeks'),null);
const only=await staked();
assert.deepEqual(only.ids,[1n,3n]);
assert.equal(only.calls.filter(c=>c.contracts?.[0]?.functionName==='depositor').length,1,'one snapshot multicall confirms depositors and custody');
await assert.rejects(staked({historyFail:true}),isRpcAvailabilityError,'unavailable history is Unknown, never a zero staked count');
assert.deepEqual((await staked({wrongDepositor:true})).ids,[],'an id whose depositor is not the owner is never counted');
await assert.rejects(staked({wrongCustody:true}),/custody mismatch/,'deposited id not held by staking stops');
await assert.rejects(staked({logs:[{...log('Deposited',{tokenId:1n},0),removed:true}]}),/Non-canonical/);
const limited=await staked({maxRange:1n});assert.deepEqual(limited.ids,[1n,3n]);assert.ok(limited.calls.filter(c=>c.method==='eth_getLogs').length<20,'shrink the attempted interval, not a stale 45k target');
const api=createAccountTokenSource({fetcher:async()=>response(apiPage)});
const apiPage={schemaVersion:2,status:'available',account:owner,chain:{target:'sepolia',chainId:'11155111',safeThroughBlock:String(snapshot.blockNumber),safeBlockHash:snapshot.blockHash},identities:{genesis:profile.addresses.nft},release:{id:'hint-not-authority'},tokens:[{tokenId:'4',custody:'staking'},{tokenId:'5',custody:'wallet'}],nextCursor:null};
assert.deepEqual(await api({owner,nft:profile.addresses.nft,custody:'staking',snapshot}),[4n]);
await assert.rejects(api({owner,nft:profile.addresses.nft,custody:'staking',snapshot:{...snapshot,blockNumber:snapshot.blockNumber+1n}}),/requested snapshot/);
// API hints cannot replace canonical history: the SDK's chain inventory is wired with no account API.
const sdkSource=fs.readFileSync('sdk/squeekchain.js','utf8');assert.match(sdkSource,/const idsOwned = [^\n]*accountSource:null/);assert.doesNotMatch(fs.readFileSync('sdk/deposits.js','utf8'),/accountSource|fetch\(/);
console.log('PASS staked inventory: indexed owner/collection history, one depositor/custody multicall, Unknown not zero, custody/canonical stops, adaptive ranges, API hints never authority');

const requests=[{method:'eth_getStorageAt',params:[owner,'0x'+'00'.repeat(32),'0x10']},{method:'eth_getCode',params:[owner,'0x10']}];
const results=['0x'+'00'.repeat(32),'0x6001'];
let singles=0,batches=0;
const peer={identityUrl:'https://rpc.example/',request:async request=>{singles++;return results[requests.findIndex(item=>item.method===request.method)];}};
const good=async(_url,init)=>{batches++;const body=JSON.parse(init.body);assert.deepEqual(body.map(({method,params})=>({method,params})),requests);return response(body.map((r,i)=>({jsonrpc:'2.0',id:r.id,result:results[i]})).reverse());};
assert.deepEqual(await readIdentityBatch(peer,requests,{fetcher:good,capabilities:new Map()}),results);assert.equal(batches,1);assert.equal(singles,0);
for(const reject of [()=>response({jsonrpc:'2.0',error:{code:-32600,message:'Batch unsupported'}}),... [400,403,405,415].map(status=>()=>new Response('',{status})),body=>response(body.map(r=>({jsonrpc:'2.0',id:r.id,error:{code:-32600,message:'Batch disabled'}})))]) {
  const capabilities=new Map();singles=0;batches=0;
  const fetcher=async(_url,init)=>{batches++;return reject(JSON.parse(init.body));};
  assert.deepEqual(await readIdentityBatch(peer,requests,{fetcher,capabilities}),results);
  assert.deepEqual(await readIdentityBatch(peer,requests,{fetcher,capabilities}),results);
  assert.equal(batches,1);assert.equal(singles,4);assert.equal(capabilities.get(peer.identityUrl),false);
}
for(const mutate of [body=>[body[0],body[0]],body=>body.slice(0,1),body=>body.map(item=>({...item,id:item.id+999}))]) {
  singles=0;
  await assert.rejects(readIdentityBatch(peer,requests,{capabilities:new Map(),fetcher:async(_url,init)=>{const body=JSON.parse(init.body).map((r,i)=>({jsonrpc:'2.0',id:r.id,result:results[i]}));return response(mutate(body));}}),isTrustError);
  assert.equal(singles,0,'corrupt response is NOT an unsupported-batch fallback');
}
for(const malformed of [new Response('not JSON'),response({result:'0x00'}),response(null)]) {
 singles=0;await assert.rejects(readIdentityBatch(peer,requests,{capabilities:new Map(),fetcher:async()=>malformed}),isTrustError);assert.equal(singles,0);
}
for(const status of [401,429,503]) {
  singles=0;
  await assert.rejects(readIdentityBatch(peer,requests,{capabilities:new Map(),fetcher:async()=>new Response(JSON.stringify({error:{message:'batch not supported'}}),{status})}),error=>isRpcAvailabilityError(error)&&!isTrustError(error)&&error.httpStatus===status&&error.kind==='http');
  assert.equal(singles,0,'auth/rate-limit cooldowns must not trigger single-call fanout');
}
for(const status of [500,502,504]) {
  const capabilities=new Map();singles=0;batches=0;
  const fetcher=async()=>{batches++;return new Response('',{status});};
  assert.deepEqual(await readIdentityBatch(peer,requests,{capabilities,fetcher}),results);
  assert.deepEqual(await readIdentityBatch(peer,requests,{capabilities,fetcher}),results);
  assert.equal(batches,2);assert.equal(singles,4);assert.notEqual(capabilities.get(peer.identityUrl),false,'gateway failure is not proof that batch is unsupported');
}
const gateway=async()=>new Response('',{status:502});
await assert.rejects(readIdentityBatch({...peer,request:async()=>{throw new RpcTrustError('Chain mismatch');}},requests,{capabilities:new Map(),fetcher:gateway}),error=>isTrustError(error)&&!isRpcAvailabilityError(error)&&error.priorError.httpStatus===502);
console.log('PASS identity batch: one request, snapshot preservation, reordered IDs, unsupported fallback + capability reuse, corrupt IDs stop, HTTP availability not trust');
const data=encodeErrorResult({abi:stakingAbi,errorName:'FeeLimitExceeded',args:[3n,2n]});
for(const error of [{cause:{data}},{code:-32000,data:{originalError:{data}}},{cause:{data:{errorName:'FeeLimitExceeded',args:[3n,2n]}}}])assert.deepEqual(feeLimitExceeded(error),{reasonCode:'feeRose',reason:'Fee rose',fee:'3',maxFee:'2'});
assert.equal(feeLimitExceeded(new Error('FeeLimitExceeded text alone is not decoded evidence')),null);
const cyclic={};cyclic.cause=cyclic;assert.equal(feeLimitExceeded(cyclic),null);
// The dated v9 identity export was deleted with v9; pins now come from the published record.
const record=JSON.parse(fs.readFileSync('docs/deployments/core-sepolia-20261103.json','utf8'));
for(const [name,contract] of Object.entries({core:'SqueekCore',issuance:'SqueekMining',staking:'SqueekStaking',token:'SqueekToken',nft:'SqueekNFT'})){
  const pin=profile.identities.pins[name],src=record.contracts[contract];assert.equal(pin.address,src.address.toLowerCase(),name);
  if(src.implementation){assert.equal(pin.implSlot,src.implementation.toLowerCase(),name+' implementation');assert.equal(pin.adminSlot,src.proxyAdmin.toLowerCase(),name+' admin');}
}
console.log('PASS FeeLimitExceeded decoded through simulation/wallet envelopes; deployment pins match the published deployment record');

for(const kind of ['TypeError','TimeoutError']){
 const original=globalThis.fetch;let batches=0,clock=1000;const cooldowns=new Map();
 globalThis.fetch=async(_url,init)=>{const req=JSON.parse(init.body);if(Array.isArray(req)){batches++;throw Object.assign(new Error(kind==='TypeError'?'Failed to fetch':'Request timed out'),{name:kind});}const result=req.method==='eth_chainId'?'0xaa36a7':req.method==='eth_blockNumber'?'0xb7f2dc':{number:req.params[0],hash:'0x'+'ab'.repeat(32),timestamp:'0x1',transactions:[]};return response({jsonrpc:'2.0',id:req.id,result});};
 try{const context=createRpcContext({rpcCooldowns:cooldowns,now:()=>clock});const snapshot=await context.snapshot();snapshot.peers=snapshot.peers.slice(0,1);const requests=[{method:'eth_getStorageAt',params:[profile.addresses.core,'0x'+'00'.repeat(32),'0xb7f2d0']}];await assert.rejects(context.readIdentity(snapshot,requests));assert.equal(cooldowns.get(snapshot.peers[0].identityUrl),clock+30000);await assert.rejects(context.readIdentity(snapshot,requests));assert.equal(batches,3);assert.equal(cooldowns.size,3);clock+=30001;await assert.rejects(context.readIdentity(snapshot,requests));assert.equal(batches,6);}finally{globalThis.fetch=original;}
}
console.log('PASS PR review: identity batch TypeError/timeout share 30s endpoint cooldown and retry after expiry');
