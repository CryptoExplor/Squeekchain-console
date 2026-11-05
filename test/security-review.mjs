import assert from 'node:assert/strict';
import fs from 'node:fs';
import {keccak256} from 'viem';
import {anySignal} from '../sdk/cancellation.js';
import {readIdentityBatch} from '../sdk/identity-batch.js';
import {createAccountTokenSource} from '../sdk/account-discovery.js';
import {createDisplayApi,artworkUrl} from '../sdk/display-api.js';
import {createTelemetry} from '../web/telemetry.js';
import {createImages} from '../web/images.js';
import {displayFixtures,fixtureRoute,owner} from './fixtures/display-api.mjs';
import {getProfile} from '../sdk/deployments.js';
import {displayKey} from '../sdk/display-cache.js';
import {createSnapshotGuard} from '../sdk/rpc.js';
import {createChainVerifier} from '../sdk/verify-chain.js';
import {DEPLOYMENT} from './fixtures/graph.mjs';
import {isRpcProgrammingError,isRpcAvailabilityError} from '../sdk/rpc-errors.js';
const original={any:Object.getOwnPropertyDescriptor(AbortSignal,'any'),timeout:Object.getOwnPropertyDescriptor(AbortSignal,'timeout')};
const response=data=>({ok:true,status:200,headers:new Headers(),json:async()=>data});
const profile=getProfile('sepolia'),fixture=displayFixtures();
function cache(){const values=new Map();return {get:async key=>values.get(key),set:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k),values};}
try{
 delete AbortSignal.any;delete AbortSignal.timeout;
 const a=new AbortController(),b=new AbortController();let adds=0,removes=0;
 for(const signal of [a.signal,b.signal]){const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);signal.addEventListener=(...args)=>{adds++;add(...args);};signal.removeEventListener=(...args)=>{removes++;remove(...args);};}
 const combined=anySignal([a.signal,b.signal,a.signal],100);assert.equal(adds,2);const reason=new DOMException('Profile changed','AbortError');a.abort(reason);assert.equal(combined.signal.reason,reason);assert.equal(removes,2);combined.dispose();
 const already=anySignal([a.signal],10);assert.equal(already.signal.reason,reason);already.dispose();
 const timed=anySignal([],5);await new Promise(resolve=>timed.signal.addEventListener('abort',resolve,{once:true}));assert.equal(timed.signal.reason.name,'TimeoutError');assert.equal(isRpcProgrammingError(timed.signal.reason),false);assert.equal(isRpcAvailabilityError(timed.signal.reason),true);timed.dispose();
 const deadline=anySignal([],5);deadline.dispose();await new Promise(r=>setTimeout(r,10));assert.equal(deadline.signal.aborted,false,'disposed fallback timer cannot fire');
 const result=await readIdentityBatch({identityUrl:'https://offline-identity.test'},[{method:'eth_getCode',params:[]}],{fetcher:async(_url,options)=>({ok:true,json:async()=>JSON.parse(options.body).map(({id})=>({jsonrpc:'2.0',id,result:'0x01'}))})});assert.deepEqual(result,['0x01']);
 const controller=new AbortController();const waiting=readIdentityBatch({identityUrl:'https://offline-abort.test'},[{method:'eth_getCode'}],{signal:controller.signal,fetcher:async(_url,{signal})=>({ok:true,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))})});await Promise.resolve();controller.abort(reason);await assert.rejects(waiting,error=>error===reason);
 const setTimer=globalThis.setTimeout;try{globalThis.setTimeout=(fn,ms,...args)=>setTimer(fn,ms===12000?5:ms,...args);await assert.rejects(readIdentityBatch({identityUrl:'https://offline-body-timeout.test'},[{method:'eth_getCode'}],{fetcher:async(_url,{signal})=>({ok:true,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))})}),error=>error.name==='TimeoutError'&&isRpcAvailabilityError(error));}finally{globalThis.setTimeout=setTimer;}
 const accountSource=createAccountTokenSource({fetcher:async()=>response(fixture.account)});assert.deepEqual((await accountSource({owner,nft:profile.addresses.nft})).map(String),['41','42']);
 const api=createDisplayApi({profile,cache:cache(),rateBuckets:new Map(),fetcher:async url=>response(fixtureRoute(fixture,new URL(url).pathname.replace('/v1','')))});await api.economy();await api.status();await api.account(owner);
 const telemetry=createTelemetry({fetcher:async()=>response(fixture.status)});assert.equal((await telemetry.read()).measurement.rpmMilli,12500);
 console.log('PASS compatibility: any/timeout deleted; batch/body abort, account discovery, display API, telemetry; deadline reasons, listener/timer cleanup');
}finally{for(const key of ['any','timeout'])Object.defineProperty(AbortSignal,key,original[key]);}
for(const value of ['https://attacker.example/p.png?id=1','//attacker.example/p.png','https://api.squeekchain.com.attacker.example/p.png','https://user:pass@api.squeekchain.com/p.png','http://api.squeekchain.com/p.png'])assert.throws(()=>artworkUrl(value),error=>error.kind==='schema');
assert.equal(artworkUrl('/cards/1.png'),'https://api.squeekchain.com/cards/1.png');
let contacts=0,fallbacks=0;const imageCache=cache();
const images=createImages({cache:imageCache,fetcher:async()=>{contacts++;return {ok:true,blob:async()=>new Blob(['image'],{type:'image/png'})};},win:{URL:{createObjectURL:()=>{throw new Error('Foreign source must not create blob');},revokeObjectURL(){}}}});
await assert.rejects(images.load({profile,token:{tokenId:'1',level:1},api:{squeek:async()=>({data:{metadata:{status:'available',cardImageUrl:'https://attacker.example/p.png',imageDataUri:fixture.squeek.metadata.imageDataUri}}})},fallback:()=>{fallbacks++;}}),error=>error.kind==='schema');assert.equal(contacts,0);assert.equal(fallbacks,0);images.destroy();
const foreign=structuredClone(fixture);foreign.squeek.metadata.cardImageUrl='https://attacker.example/p.png';
const api=createDisplayApi({profile,cache:cache(),rateBuckets:new Map(),fetcher:async url=>response(fixtureRoute(foreign,new URL(url).pathname.replace('/v1','')))});await assert.rejects(api.squeek('41',1),error=>error.kind==='schema');
const cachedForeign=cache();await cachedForeign.set(displayKey(profile,'art:41:1'),{at:Date.now(),data:foreign.squeek});const cachedApi=createDisplayApi({profile,cache:cachedForeign,rateBuckets:new Map(),fetcher:async url=>response(fixtureRoute(fixture,new URL(url).pathname.replace('/v1','')))});await assert.rejects(cachedApi.squeek('41',1),error=>error.kind==='schema');assert.equal(await cachedForeign.get(displayKey(profile,'art:41:1')),undefined);
let creates=0,revokes=0;const safeCache=cache(),safe=createImages({cache:safeCache,win:{URL:{createObjectURL:()=>`blob:${++creates}`,revokeObjectURL:()=>revokes++}},fetcher:async(_url,options)=>{assert.equal(options.redirect,'error');return {ok:true,blob:async()=>new Blob(['image'],{type:'image/png'})};}});
const options={profile,token:{tokenId:'41',level:1},api:{squeek:async()=>({data:{metadata:{status:'available',cardImageUrl:'/cards/41.png'}}})}};
for(let i=0;i<30;i++)assert.equal((await safe.load(options)).image,'blob:1');assert.equal(creates,1);await safe.load({...options,token:{tokenId:'41',level:2}});assert.equal(creates,2);assert.equal(revokes,1);safe.destroy();assert.equal(revokes,2);
let finishMetadata;const destroyedImages=createImages({cache:cache(),win:{URL:{createObjectURL:()=>{throw new Error('Late image after destroy');},revokeObjectURL(){}}}}),lateImage=destroyedImages.load({...options,api:{squeek:()=>new Promise(resolve=>finishMetadata=resolve)}});await Promise.resolve();destroyedImages.destroy();finishMetadata({data:{metadata:{status:'available',imageDataUri:fixture.squeek.metadata.imageDataUri}}});await assert.rejects(lateImage,error=>error.name==='AbortError');
// An old generation may finish its cache write after a newer level has rendered.
let finishWrite;const raceCache=cache(),write=raceCache.set;raceCache.set=async(key,value)=>{await write(key,value);if(value.item.level===1)await new Promise(resolve=>finishWrite=resolve);};let raceRevokes=0,raceCreates=0;const raceImages=createImages({cache:raceCache,win:{URL:{createObjectURL:()=>`blob:race-${++raceCreates}`,revokeObjectURL:()=>raceRevokes++}},fetcher:async()=>({ok:true,blob:async()=>new Blob(['image'],{type:'image/png'})})}),oldGeneration=new AbortController(),oldImage=raceImages.load({...options,signal:oldGeneration.signal});while(!finishWrite)await new Promise(resolve=>setTimeout(resolve,0));oldGeneration.abort();const currentImage=await raceImages.load({...options,token:{tokenId:'41',level:2}});finishWrite();await assert.rejects(oldImage,error=>error.name==='AbortError');assert.equal(currentImage.image,'blob:race-1');assert.equal(raceCreates,1);assert.equal(raceRevokes,0,'stale generation cannot revoke current artwork');raceImages.destroy();
console.log('PASS artwork: fresh validator and fetch boundary reject foreign/credential URLs without contact or fallback; safe relative URL, no redirects; repeated cache hits reuse blob URLs and level/destroy revoke');
// A hash-agreeing liar is intentionally accepted by the hash-only guard, but
// must not hide a changed v6 implementation slot from an honest identity peer.
const hash='0x'+'ab'.repeat(32),block={number:100n,hash,timestamp:1n};
const peer=()=>({getChainId:async()=>11155111,getBlock:async()=>block,getBlockNumber:async()=>112n});const peers=[peer(),peer()],client=peer();
const snapshot=await createSnapshotGuard(client,peers).snapshot();assert.equal(snapshot.blockHash,hash);
const vProfile=getProfile('sepolia'),pins=vProfile.identities.pins,word=address=>'0x'+address.slice(2).padStart(64,'0');
// Expected identity batch in the verifier's order: per pin impl slot, admin slot, then (cold only) runtime/impl code.
const slotValues=Object.values(pins).flatMap(pin=>[word(pin.implSlot),word(pin.adminSlot)]);
const codeCount=Object.values(pins).reduce((n,pin)=>n+(pin.runtimeCodeHash?1:0)+(pin.implCodeHash?1:0),0);
// Warm path: a cached verification still re-reads every slot and refuses a peer that reports an upgraded implementation.
const warmCache=new Map([[`identity:${JSON.stringify(vProfile.identities)}`,{ok:true,trusted:true,blockNumber:'99'}]]);
const verifier=createChainVerifier(warmCache,vProfile);let reads=0;
await assert.rejects(verifier.prepare(client,snapshot,async(s,requests)=>{reads++;assert.equal(s.blockHash,hash);assert.equal(requests.length,slotValues.length);const upgraded=[...slotValues];upgraded[0]=word('0x1111111111111111111111111111111111111111');return [slotValues,upgraded];}),/core implementation slot/);assert.equal(reads,1);
// Cold path: a forged implementation runtime from one peer is refused and nothing is cached.
const coldCache=new Map(),coldVerifier=createChainVerifier(coldCache,vProfile);
await assert.rejects(coldVerifier.prepare(client,snapshot,async(s,requests)=>{assert.equal(requests.length,slotValues.length+codeCount);const valid=[...slotValues,...Array(codeCount).fill('0x6001')];return [valid,valid];}),/runtime hash/);assert.equal(coldCache.size,0);
console.log('PASS hash-agreeing falsified-state regression: correct header hash cannot bypass independent implementation/admin slot or runtime checks, including cache hits');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');assert.ok(ci.indexOf('git diff --exit-code -- web/bundle.js web/tools.json')<ci.indexOf('- run: npm test'));console.log('PASS generated browser-asset drift guard runs before tests can overwrite stale artifacts');
