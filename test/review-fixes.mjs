import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeEventTopics, encodeAbiParameters, encodeErrorResult, pad, toHex, zeroAddress } from 'viem';
import { PROFILES } from '../sdk/deployments.js';
import { staking9Abi } from '../sdk/abi-v9.js';
import { profileBalances, chooseProfile, profileHeld, profileCountLabel, profileFromHash } from '../sdk/profile-selection.js';
import { createDiscoveryStore } from '../sdk/discovery.js';
import { readIdentityBatch } from '../sdk/identity-batch.js';
import { RpcAvailabilityError, RpcTrustError, isTrustError, isRpcAvailabilityError } from '../sdk/rpc-errors.js';
import { feeLimitExceeded } from '../sdk/fee-error.js';
import { createAccountTokenSource } from '../sdk/account-discovery.js';
const profile=PROFILES['sepolia-v9'],owner='0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const snapshot={blockNumber:profile.startBlock+10n,blockHash:'0x'+'ab'.repeat(32)};
const response=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
function log(eventName,args,index=0) {
  args={account:owner,collection:profile.addresses.nft,...args};
  const fields=staking9Abi.find(item=>item.type==='event'&&item.name===eventName).inputs.filter(input=>!input.indexed);
  return {address:profile.addresses.staking,blockNumber:toHex(snapshot.blockNumber),logIndex:toHex(index),removed:false,
    topics:encodeEventTopics({abi:staking9Abi,eventName,args}),data:encodeAbiParameters(fields,fields.map(input=>args[input.name]??0n))};
}
async function inventory({v6=0n,wallet=0n,power=987654n,historyFail=false,accountSource=null,logs,wrongDepositor=false,badFinal=false}={}) {
  let guarded=false;const calls=[];
  const client={
    multicall:async request=>{
      calls.push(request);assert.equal(request.blockNumber,snapshot.blockNumber);
      if(request.contracts[0].functionName==='balanceOf') {
        assert.deepEqual(request.contracts.map(c=>c.functionName),['balanceOf','balanceOf','accountPower']);
        assert.equal(request.contracts[2].address,profile.addresses.staking);
        assert.ok(request.contracts.every(c=>c.args[0].toLowerCase()===owner.toLowerCase()));
        return [v6,wallet,[power,0n]].map(result=>({status:result===null?'failure':'success',result}));
      }
      assert.equal(request.allowFailure,false);
      return request.contracts.map(c=>c.functionName==='depositor'?(wrongDepositor?zeroAddress:owner):profile.addresses.staking);
    },
    request:async request=>{
      calls.push(request);assert.equal(request.method,'eth_getLogs');
      const [q]=request.params;assert.equal(q.toBlock,toHex(snapshot.blockNumber));
      assert.equal(q.topics[0].length,3);assert.equal(q.topics[1],pad(owner));assert.equal(q.topics[2],pad(profile.addresses.nft));
      if(historyFail)throw new RpcAvailabilityError(new Error('Historical logs unavailable'));
      return logs??[log('Deposited',{tokenId:1n},0),log('Deposited',{tokenId:2n},1),log('Deposited',{tokenId:3n},2),log('Withdrawn',{tokenId:2n},3)];
    },
  };
  const counts=await profileBalances(owner,{rpcContext:{client,snapshot:async()=>snapshot,check:async s=>{assert.equal(s,snapshot);if(badFinal)throw new RpcTrustError('Final hash mismatch');guarded=true;}},discoveryCache:createDiscoveryStore(null),accountSource});
  assert.equal(guarded,true);return {counts,calls};
}
assert.equal(profileFromHash(''),null);assert.equal(profileFromHash('#not-a-profile'),null);
const only=await inventory();
assert.equal(only.counts['sepolia-v9'].wallet,'0');assert.equal(only.counts['sepolia-v9'].staked,'2');
assert.equal(only.calls.filter(c=>c.contracts?.[0]?.functionName==='depositor').length,1,'one snapshot multicall confirms depositors and custody');
assert.equal(chooseProfile('sepolia-v6',only.counts),'sepolia-v9');
assert.equal(profileCountLabel(only.counts['sepolia-v9']),'0 in wallet · 2 staked');
const both=await inventory({v6:3n,wallet:3n});assert.equal(chooseProfile('sepolia-v6',both.counts),'sepolia-v6');assert.ok(profileHeld(both.counts['sepolia-v9']));
assert.equal(profileCountLabel(both.counts['sepolia-v9']),'3 in wallet · 2 staked');
for(const power of [987654n,0n,null]) {
  const {counts}=await inventory({power,historyFail:true});
  assert.equal(counts['sepolia-v9'].staked,null);assert.match(profileCountLabel(counts['sepolia-v9']),/Staked \(Unknown\)/);
  assert.equal(chooseProfile('sepolia-v6',counts),power>0n?'sepolia-v9':'sepolia-v6');
}
const unconfirmed=await inventory({wrongDepositor:true});assert.equal(unconfirmed.counts['sepolia-v9'].staked,null);
assert.equal(profileHeld({wallet:'0',nftPower:'0',staked:'99'}),false,'hint count must not decide auto-pick');
await assert.rejects(inventory({badFinal:true}),/hash mismatch/);
let sourceCalls=0;
const fast=await inventory({accountSource:async q=>{sourceCalls++;assert.equal(q.custody,'staking');assert.equal(q.snapshot,snapshot);return [4n,5n,5n];}});
assert.equal(sourceCalls,1);assert.equal(fast.counts['sepolia-v9'].staked,'2');assert.equal(fast.calls.filter(c=>c.method==='eth_getLogs').length,0);
const fallback=await inventory({accountSource:async()=>{throw new Error('API unavailable');}});assert.equal(fallback.counts['sepolia-v9'].staked,'2');
const apiPage={schemaVersion:2,status:'available',account:owner,chain:{target:'sepolia',chainId:'11155111',safeThroughBlock:String(snapshot.blockNumber),safeBlockHash:snapshot.blockHash},identities:{genesis:profile.addresses.nft},release:{id:'hint-not-authority'},tokens:[{tokenId:'4',custody:'staking'},{tokenId:'5',custody:'wallet'}],nextCursor:null};
const api=createAccountTokenSource({fetcher:async()=>response(apiPage)});
assert.deepEqual(await api({owner,nft:profile.addresses.nft,custody:'staking',snapshot}),[4n]);
await assert.rejects(api({owner,nft:profile.addresses.nft,custody:'staking',snapshot:{...snapshot,blockNumber:snapshot.blockNumber+1n}}),/requested snapshot/);
console.log('PASS staked-aware selection: same-block balance/power, API hints + indexed history, one depositor/custody multicall, real counts, Unknown and final guard');

const requests=[{method:'eth_getStorageAt',params:[owner,'0x'+'00'.repeat(32),'0x10']},{method:'eth_getCode',params:[owner,'0x10']}];
const results=['0x'+'00'.repeat(32),'0x6001'];
let singles=0,batches=0;
const peer={identityUrl:'https://rpc.example/',request:async request=>{singles++;return results[requests.findIndex(item=>item.method===request.method)];}};
const good=async(_url,init)=>{batches++;const body=JSON.parse(init.body);assert.deepEqual(body.map(({method,params})=>({method,params})),requests);return response(body.map((r,i)=>({jsonrpc:'2.0',id:r.id,result:results[i]})).reverse());};
assert.deepEqual(await readIdentityBatch(peer,requests,{fetcher:good,capabilities:new Map()}),results);assert.equal(batches,1);assert.equal(singles,0);
for(const reject of [()=>response({jsonrpc:'2.0',error:{code:-32600,message:'Batch unsupported'}}),()=>new Response('',{status:415}),body=>response(body.map(r=>({jsonrpc:'2.0',id:r.id,error:{code:-32600,message:'Batch disabled'}})))]) {
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
await assert.rejects(readIdentityBatch(peer,requests,{capabilities:new Map(),fetcher:async()=>new Response('',{status:429})}),error=>isRpcAvailabilityError(error)&&!isTrustError(error));
console.log('PASS identity batch: one request, snapshot preservation, reordered IDs, unsupported fallback + capability reuse, corrupt IDs stop, HTTP availability not trust');
const data=encodeErrorResult({abi:staking9Abi,errorName:'FeeLimitExceeded',args:[3n,2n]});
for(const error of [{cause:{data}},{code:-32000,data:{originalError:{data}}},{cause:{data:{errorName:'FeeLimitExceeded',args:[3n,2n]}}}])assert.deepEqual(feeLimitExceeded(error),{reasonCode:'feeRose',reason:'Fee rose',fee:'3',maxFee:'2'});
assert.equal(feeLimitExceeded(new Error('FeeLimitExceeded text alone is not decoded evidence')),null);
const cyclic={};cyclic.cause=cyclic;assert.equal(feeLimitExceeded(cyclic),null);
const evidence=JSON.parse(fs.readFileSync('docs/audit/v9-identity-2026-11-03.json'));
const normalize=value=>JSON.stringify(value,(_key,item)=>['string','number','bigint'].includes(typeof item)?String(item).toLowerCase():item);
for(const peerPins of Object.values(evidence.peers))for(const [name,pin] of Object.entries(profile.identities.pins)) {
  for(const [key,value] of Object.entries(pin)) {
    if(key==='wiring')for(const [field,expected] of Object.entries(value))assert.equal(normalize(peerPins[name][field]),normalize(expected),`${name}.${field}`);
    else assert.equal(normalize(peerPins[name][key]),normalize(value),`${name}.${key}`);
  }
  if(pin.implCodeHash)assert.equal(normalize(peerPins[name].implementationCodeAddress),normalize(pin.implSlot));
  if(name==='core'||name==='issuance')assert.equal(normalize(peerPins[name].proxyAdmin),normalize(pin.adminSlot));
}
console.log('PASS FeeLimitExceeded decoded through simulation/wallet envelopes; deployment pins match both peers of committed identity export');
