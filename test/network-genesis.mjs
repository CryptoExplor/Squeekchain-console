import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { createDisplayApi,apiNetwork } from '../sdk/display-api.js';
import { createDisplayCache } from '../sdk/display-cache.js';
import { getProfile } from '../sdk/deployments.js';
import { displayFixtures,fixtureRoute,owner } from './fixtures/display-api.mjs';
import { createNetworkView } from '../web/network.js';

const profile=getProfile('sepolia-v9');let fixtures=displayFixtures(),calls=[],offline=false;
const cache=createDisplayCache(null),client=()=>createDisplayApi({profile,cache,rateBuckets:new Map(),fetcher:async(url,options)=>{calls.push({path:url.split('/v1')[1],options});if(offline)throw new TypeError('offline');return {ok:true,status:200,headers:new Headers(),json:async()=>structuredClone(fixtureRoute(fixtures,url.split('/v1')[1]))};}});
let api=client();const economy=await api.economy(),core=await api.core(),net=apiNetwork(core,economy);
assert.equal(net.mining.issued.sqk,'2.0');
for(const [name,mutate] of [['release.id',f=>f.economy.release.id='foreign'],['identities.core',f=>f.economy.identities.core='0x'+'11'.repeat(20)],['identities.token',f=>f.economy.identities.token='0x'+'11'.repeat(20)],['identities.genesis',f=>f.economy.identities.genesis='0x'+'11'.repeat(20)],['identities.mining.implementation',f=>f.economy.identities.mining.implementation='0x'+'11'.repeat(20)],['identities.staking.storageLayoutDigest',f=>f.economy.identities.staking.storageLayoutDigest='0x'+'11'.repeat(32)],['identities.launch',f=>f.economy.identities.launch='0x'+'11'.repeat(20)]]){fixtures=displayFixtures();mutate(fixtures);await assert.rejects(client().economy(),e=>e.name==='RpcTrustError'&&e.message.endsWith(name));}
fixtures=displayFixtures();api=client();await api.economy();fixtures.core.implementation.runtimeHash='0x'+'11'.repeat(32);await assert.rejects(api.core(),/implementation.runtimeHash/);
console.log('PASS precise API identity mismatch fields, not grouped identity diagnostics');
fixtures=displayFixtures();api=client();await api.genesis();assert.equal(calls.at(-1).options.cache,'no-store');fixtures.genesis=fixtures.availableGenesis;assert.equal((await api.genesis()).data.state.phase,'claimable');const wallet=await api.genesisWallet(owner);assert.equal(wallet.data.receipts.length,1);assert.equal(calls.at(-1).options.cache,'no-store');offline=true;await assert.rejects(api.genesis(),e=>e.kind==='transport');await assert.rejects(api.genesisWallet(owner),e=>e.kind==='transport');offline=false;
fixtures.genesis.schemaVersion=999;await assert.rejects(api.genesis(),/Unsupported Genesis schemaVersion/);fixtures=displayFixtures();fixtures.genesis=fixtures.availableGenesis;fixtures.genesis.bindings.core='0x'+'11'.repeat(20);await assert.rejects(client().genesis(),/bindings.core/);
fixtures=displayFixtures();fixtures.genesisWallet.wallet='0x'+'11'.repeat(20);await assert.rejects(client().genesisWallet(owner),/wallet/);fixtures=displayFixtures();fixtures.genesisWallet.receipts[0].entries[1].entryId='1';await assert.rejects(client().genesisWallet(owner),/Invalid Genesis entry/);
console.log('PASS Genesis v2, no-store/no stale bodies, exact binding/wallet checks, unknown schema and malformed entries rejected');
// Controller state machine: no timer, no range request before expansion; stale/account/profile work discarded.
const doc=new JSDOM(fs.readFileSync('web/index.html','utf8')).window.document,sources=[];let generation=1,visible=true;
const load={profileKey:'sepolia-v9',generation:1},view=createNetworkView({doc,source:(...args)=>sources.push(args),current:l=>l.generation===generation,visible:()=>visible,readContext:()=>({load,api})});
fixtures=displayFixtures();api=client();view.reset(profile);const before=calls.length;await view.refresh(load,api,null);assert.ok(calls.slice(before).every(c=>!c.path.includes('range=')));assert.equal(doc.getElementById('genesis-row').textContent,'Genesis: not open yet');
fixtures.genesis=fixtures.availableGenesis;await view.genesis(load,api,owner);assert.match(doc.getElementById('genesis-wallet').textContent,/Receipts: 1 · Claimable entries: 1/);fixtures.genesisWallet.nextCursor='page2';await view.genesis(load,api,owner);assert.match(doc.getElementById('genesis-wallet').textContent,/first page; more available/);
fixtures.genesis.schemaVersion=3;await view.genesis(load,api,owner);assert.equal(doc.getElementById('genesis-row').textContent,'Genesis: not open yet');assert.ok(sources.some(s=>s[2]==='Unsupported Genesis schemaVersion'));assert.equal(doc.querySelector('#genesis-wallet').textContent,'');
let resolve;const pending=view.genesis(load,{genesis:()=>new Promise(r=>resolve=r)},owner);generation=2;view.reset(getProfile('sepolia-v6'));resolve({data:fixtures.availableGenesis});await pending;assert.equal(doc.getElementById('genesis-row').textContent,'Genesis: not open yet');
const prior=calls.length;await view.refresh({profileKey:'mainnet',generation:2},api,owner);assert.equal(calls.length,prior);
assert.doesNotMatch(fs.readFileSync('web/network.js','utf8'),/setTimeout|setInterval|sendTransaction|simulateContract|requestAccounts/);
console.log('PASS Genesis row: no-store, binding/schema checks, pagination disclosure, stale generation discard; no timers/actions');
