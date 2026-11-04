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
fs.mkdirSync('.cache',{recursive:true});fs.writeFileSync('.cache/display-poll-counts.json',JSON.stringify(measurements,null,2));
console.log('PASS wheel scheduler: ACTIVE 5s, IDLE 60s, 10min virtual request counts, no frontier=no account/economy fetch, hidden pause');
// Production allowlist contains no fork modules, impersonation shortcut or alternate peers.
for(const name of fs.readdirSync('dist').filter(n=>/\.(js|html)$/.test(n))){const body=fs.readFileSync('dist/'+name,'utf8');assert.doesNotMatch(body,/Try a holder|hardhat_impersonate|anvil_impersonate|fork-test-peer|fork-watch\.js/);}
for(const name of ['sdk/v9.js','sdk/squeekchain.js'])assert.match(fs.readFileSync(name,'utf8'),/namespace: [^\n]+:chain-only[^\n]+accountSource:null/);
console.log('PASS action authority: canonical-only inventory namespace; production build excludes fork wallet/config/watch shortcuts');
