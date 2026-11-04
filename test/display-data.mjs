import assert from 'node:assert/strict';
import fs from 'node:fs';
import { indexedDB } from 'fake-indexeddb';
import { createDisplayCache,displayKey,DAY,DISPLAY_TTL } from '../sdk/display-cache.js';
import { createDisplayApi,apiNetwork,apiWallet } from '../sdk/display-api.js';
import { createWheelPoller } from '../sdk/display-poller.js';
import { getProfile } from '../sdk/deployments.js';
import { displayFixtures,fixtureRoute,owner } from './fixtures/display-api.mjs';
const profile=getProfile('sepolia-v9'),cache=createDisplayCache(indexedDB);let now=Date.now(),fixtures=displayFixtures(now),mode='good',calls=[];
const response=(body,status=200,headers={})=>({ok:status===200,status,headers:new Headers(headers),json:async()=>structuredClone(body)});
const fetcher=async(url,options)=>{const path=url.replace('https://api.squeekchain.com/v1','');calls.push({path,options});if(mode==='offline')throw new TypeError('Offline');if(mode==='429')return response(null,429,{'Retry-After':'60'});if(mode==='304')return response(null,304);return response(fixtureRoute(fixtures,path),200,{ETag:'"one"'});};
const api=createDisplayApi({profile,cache,now:()=>now,fetcher,rateBuckets:new Map()});
await api.economy();await api.core();await api.status();await api.blocks();await api.feed();await api.settlements();
assert.ok((await cache.get(displayKey(profile,'static-configuration'))).value.expectedIdentities.core.runtimeCodeHash);
mode='304';await api.economy();assert.equal(calls.at(-1).options.headers['If-None-Match'],'"one"');
mode='offline';for(let i=0;i<2;i++){now+=5000;const result=await api.status();assert.equal(result.data.measurement.rpmMilli,12500);assert.equal(result.stale,true);}
now+=DISPLAY_TTL+1;await assert.rejects(api.status(),e=>e.kind==='transport');
mode='good';now=Date.now();fixtures=displayFixtures(now);await api.status();
fixtures.status={...fixtures.status,status:'unavailable'};await assert.rejects(api.status(),e=>e.kind==='unavailable');assert.equal(await cache.get(displayKey(profile,'/status')),undefined);
fixtures=displayFixtures(now);await api.status();fixtures.status.installationId='wrong';await assert.rejects(api.status(),e=>e.name==='RpcTrustError');assert.equal(await cache.get(displayKey(profile,'/status')),undefined);
fixtures=displayFixtures(now);fixtures.economy.schemaVersion=99;await assert.rejects(api.economy(),e=>e.kind==='schema');
fixtures=displayFixtures(now);fixtures.economy.release.id='wrong';await assert.rejects(api.economy(),e=>e.name==='RpcTrustError');
fixtures=displayFixtures(now);fixtures.economy.identities.mining.implementation='0x'+'11'.repeat(20);await assert.rejects(api.economy(),e=>e.name==='RpcTrustError');
fixtures=displayFixtures(now);await api.economy();mode='429';await api.core();const count=calls.length;await api.core();assert.equal(calls.length,count,'Retry-After suppresses network requests');now+=60001;mode='good';await api.core();assert.equal(calls.length,count+1);
const fresh=createDisplayApi({profile,cache,now:()=>now,fetcher,rateBuckets:new Map()});const account=await fresh.account(owner);assert.equal(apiWallet(account,apiNetwork(await fresh.core(),await fresh.economy()),owner).totals.count,2);assert.equal(calls.findLast(c=>c.path.startsWith('/accounts/')).options.cache,'no-store');assert.equal(await cache.get(displayKey(profile,`/accounts/${owner}?limit=100`)),undefined);
await fresh.squeek('41',1);const beforeArt=calls.length;await fresh.squeek('41',1);assert.equal(calls.length,beforeArt,'art token+level 24-hour cache hit');await fresh.invalidateArt(['41']);await fresh.squeek('41',1);assert.equal(calls.length,beforeArt+1,'merge invalidates metadata and endpoint ETag body');
const v6=getProfile('sepolia-v6');assert.notEqual(displayKey(profile,'network'),displayKey(v6,'network'));assert.notEqual(displayKey(profile,'network'),displayKey({...profile,identities:{...profile.identities,release:'other'}},'network'));
// Durable IndexedDB works across separate cache instances. Static expiry is separate from dynamic.
await cache.set('tier',{at:now,value:'good'});assert.equal((await createDisplayCache(indexedDB).get('tier')).value,'good');assert.equal(DAY,86400000);
console.log('PASS display schemas/cache: endpoint guards, unsupported versions, release/implementation/installation mismatch, explicit unavailable eviction, two failures retained, 15min expiry, ETag/304, Retry-After, no-store account, static pins, IDB namespaces, art invalidation');
// Virtual ten-minute scheduler, exercising actual request calls, no wall-clock waits or RPC.
const measurements={};for(const state of ['ACTIVE','IDLE']){let at=Date.now(),queue=[],statusCalls=0,eventCalls=0,networkCalls=0,hidden=false,visibility;const doc={get hidden(){return hidden;},addEventListener:(_,f)=>visibility=f,removeEventListener(){}};const fx=displayFixtures(at);fx.status.measurement.coreStatus=state;
const client=createDisplayApi({profile,cache:createDisplayCache(null),now:()=>at,rateBuckets:new Map(),fetcher:async url=>{const path=url.replace('https://api.squeekchain.com/v1','');if(path==='/status'){statusCalls++;fx.status.measurement.receivedAt=new Date(at).toISOString();}if(path.startsWith('/events'))eventCalls++;return response(fixtureRoute(fx,path));}});
const poller=createWheelPoller({doc,now:()=>at,setTimer:(fn,ms)=>{const t={fn,at:at+ms};queue.push(t);return t;},clearTimer:t=>{queue=queue.filter(x=>x!==t);},readStatus:()=>client.status(),readEvents:()=>client.feed(),readBlocks:()=>client.blocks(),frontier:()=>({settled:'1198',processed:'1197'}),onFrontier:()=>networkCalls++});await poller.tick();const bootstrap=client.counts.api,end=at+600000;while(queue.length&&queue[0].at<=end){const t=queue.shift();at=t.at;await t.fn();await poller.tick();}assert.equal(statusCalls,state==='ACTIVE'?121:11);assert.equal(networkCalls,0,'no frontier change: never refresh account/economy');hidden=true;visibility();const prior=client.counts.api;await poller.tick();assert.equal(client.counts.api,prior);poller.stop();measurements[state]={bootstrapApi:bootstrap,statusPolls:statusCalls-1,eventPolls:eventCalls-1,tenMinuteApiReads:client.counts.api-bootstrap,rpcReads:0};}
fs.mkdirSync('.cache',{recursive:true});fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/display-poll-counts.json',JSON.stringify(measurements,null,2));
console.log('PASS wheel scheduler: ACTIVE 5s, IDLE 60s, 10min virtual request counts, no frontier=no account/economy fetch, hidden pause');
// Production allowlist contains no fork modules, impersonation shortcut or alternate peers.
for(const name of fs.readdirSync('dist').filter(n=>/\.(js|html)$/.test(n))){const body=fs.readFileSync('dist/'+name,'utf8');assert.doesNotMatch(body,/Try a holder|hardhat_impersonate|anvil_impersonate|fork-test-peer|fork-watch\.js/);}
for(const name of ['sdk/v9.js','sdk/squeekchain.js'])assert.match(fs.readFileSync(name,'utf8'),/namespace: [^\n]+:chain-only[^\n]+accountSource:null/);
console.log('PASS action authority: canonical-only inventory namespace; production build excludes fork wallet/config/watch shortcuts');
const headers=fs.readFileSync('web/_headers','utf8');const {PUBLIC_RPCS}=await import('../sdk/rpc.js');
assert.deepEqual(PUBLIC_RPCS,['https://ethereum-sepolia-rpc.publicnode.com','https://sepolia.gateway.tenderly.co','https://0xrpc.io/sep']);
for(const removed of ['sepolia.drpc.org','ethereum-sepolia-public.nodies.app','eth-sepolia.api.onfinality.io','api.zan.top','rpc.sepolia.ethpandaops.io']){assert.ok(!PUBLIC_RPCS.some(url=>url.includes(removed)));assert.ok(!headers.includes(removed));}
console.log('PASS current default pool and CSP: Tenderly/PublicNode/0xRPC only; removed hosts stay absent');
// Image/metadata cache survives a second visit, separates levels and expires at 24h.
const {createImages}=await import('../web/images.js');let imageCalls=0,blobCalls=0;const imageCache=createDisplayCache(indexedDB),imageProfile=getProfile('sepolia-v9');
const imageOptions={cache:imageCache,win:{URL:globalThis.URL},fetcher:async(_url,options)=>{blobCalls++;assert.equal(options.credentials,'omit');return {ok:true,blob:async()=>new Blob(['synthetic'],{type:'image/png'})};}};
const imageApi={squeek:async(id,level)=>{imageCalls++;return {data:{metadata:{status:'available',name:'Synthetic',cardImageUrl:'https://api.squeekchain.com/cards/card.png',imageDataUri:fixtures.squeek.metadata.imageDataUri,attributes:[]}}};}};
const firstImages=createImages(imageOptions),imageLoad={profile:imageProfile,token:{tokenId:'41',level:1},api:imageApi,fallback:()=>{throw new Error('No fallback expected');}};
assert.match((await firstImages.load(imageLoad)).image,/^blob:/);assert.equal(imageCalls,1);assert.equal(blobCalls,1);firstImages.destroy();
const secondImages=createImages(imageOptions);await secondImages.load(imageLoad);assert.equal(imageCalls,1,'second visit: zero metadata calls');assert.equal(blobCalls,1,'second visit: zero image calls');await secondImages.load({...imageLoad,token:{tokenId:'41',level:2}});assert.equal(imageCalls,2,'new level has a new image key');
const clockNow=Date.now;Date.now=()=>clockNow()+DAY+1;try{await secondImages.load(imageLoad);assert.equal(imageCalls,3,'24h re-check');}finally{Date.now=clockNow;secondImages.destroy();}
assert.doesNotMatch(fs.readFileSync('web/holdings.js','utf8'),/innerHTML|insertAdjacentHTML/);
console.log('PASS automatic art cache: isolated blob images, omit credentials, durable second-visit zero calls, level changes and 24h expiry');

const optionalAccount=structuredClone(account);assert.equal(apiWallet(optionalAccount,{},owner).staking.fresh,null);optionalAccount.data.stake.freshBaseUnits='7';optionalAccount.data.stake.matureBaseUnits='3';assert.equal(apiWallet(optionalAccount,{},owner).staking.fresh.base,'7');assert.equal(apiWallet(optionalAccount,{},owner).staking.mature.base,'3');optionalAccount.data.stake.freshBaseUnits='invalid';assert.throws(()=>apiWallet(optionalAccount,{},owner),/Invalid optional account amount/);

// PR review: failed validation cannot pin an installation, and stale/mixed
// endpoint snapshots cannot suggest an actionable checkpoint or a known lag.
{
 let fx=displayFixtures();fx.economy.installationId='rejected-installation';fx.economy.supply.liveSupplyBaseUnits='bad';
 const client=createDisplayApi({profile,cache:createDisplayCache(null),rateBuckets:new Map(),fetcher:async()=>response(fx.economy)});
 await assert.rejects(client.economy(),/Invalid economy display/);assert.equal(client.context,null);
 fx=displayFixtures();await client.economy();assert.equal(client.context.installationId,fx.economy.installationId);
 const core={data:fx.core,at:Date.now()},economy={data:fx.economy,at:Date.now()};
 assert.equal(apiNetwork(core,economy).checkpoint.canCheckpoint,true);
 for(const [c,e] of [[{...core,stale:true},economy],[core,{...economy,stale:true}],[{...core,data:{...fx.core,chain:{...fx.core.chain,safeThroughBlock:'11999999'}}},economy]]){
  const net=apiNetwork(c,e);assert.equal(net.checkpoint.canCheckpoint,false);assert.equal(net.mining.lagRounds,null);assert.equal(net.source.stale,true);
 }
}
// Failed projected blocks do not invalidate successful status telemetry. A failed
// frontier callback must retry even when the next status reports the same round.
{
 const fx=displayFixtures();let frontierAttempts=0,statusPaints=0,blockReads=0;const errors=[];
 const poller=createWheelPoller({readStatus:async()=>({data:fx.status}),readBlocks:async()=>{blockReads++;throw new Error('bad projection');},frontier:()=>({settled:'1197',processed:'1197'}),onStatus:()=>statusPaints++,onFrontier:()=>++frontierAttempts===1?null:true,onError:(_e,scope)=>errors.push(scope),setTimer:()=>0,clearTimer:()=>{}});
 await poller.tick();await poller.tick();await poller.tick();poller.stop();assert.equal(frontierAttempts,2);assert.equal(statusPaints,3);assert.equal(blockReads,3);assert.deepEqual(errors,['blocks','blocks','blocks']);
}
console.log('PASS PR review: validation before installation bind; stale/mixed checkpoint gates; isolated projection errors; failed-frontier retry');

{
 let enabled=false,reads=0,scheduled=new Set();const poller=createWheelPoller({enabled:()=>enabled,readStatus:async()=>{reads++;return{data:displayFixtures().status};},setTimer:fn=>{scheduled.add(fn);return fn;},clearTimer:fn=>scheduled.delete(fn)});
 poller.start();await poller.tick();assert.equal(reads,0);assert.equal(scheduled.size,0);enabled=true;poller.start();assert.equal(scheduled.size,1);await poller.tick();assert.equal(reads,1);enabled=false;poller.start();assert.equal(scheduled.size,0);await poller.tick();assert.equal(reads,1);poller.stop();
}
console.log('PASS PR review nit: disabled-profile poller has no timer/reads and resumes when enabled');
