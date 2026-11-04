// OFFLINE ONLY: physical mocked HTTP, never live qualification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExploreIndex} from '../web/explore-index.js';
import {createExploreWireFixture} from './explore-wire-fixture.mjs';
const wire=await createExploreWireFixture(),{profile,owner,createExploreReader}=wire,original=globalThis.fetch;globalThis.fetch=wire.fetcher;
try{const memory=new Map(),store={get:async k=>structuredClone(memory.get(k)),set:async(k,v)=>memory.set(k,structuredClone(v))},reader=createExploreReader({profile,chainCache:new Map(),verificationCache:new Map()}),index=createExploreIndex({profile,store,reader}),measurement={fixture:'Synthetic pinned v9, 9,999 mints, two wallet/9,997 vault NFTs, two independent HTTP peers; no network latency',unit:'physical mocked HTTP RPC requests'};
 let started=performance.now(),state=await index.sync();measurement.first={requests:wire.requests,milliseconds:performance.now()-started,indexed:Object.values(state.tokens).filter(t=>t.minted&&!t.burned).length,totalSupply:state.totalSupply};assert.equal(state.complete,true);assert.equal(state.tokens['3'].depositor.toLowerCase(),owner.toLowerCase());
 wire.resetRequests();wire.at+=5n;started=performance.now();state=await index.sync();measurement.warm={requests:wire.requests,milliseconds:performance.now()-started,indexed:Object.values(state.tokens).filter(t=>t.minted&&!t.burned).length,totalSupply:state.totalSupply};assert.equal(state.complete,true);wire.corrupt=true;await assert.rejects(index.sync(),e=>e.name==='RpcTrustError');
 fs.writeFileSync('artifacts/phase5-v3-wire-scan.json',JSON.stringify(measurement,null,2)+'\n');console.log('PASS actual Explore RPC wire: both-peer mutable identity rejection, guarded safe-block logs/levels/custody/supply; '+JSON.stringify(measurement));
}finally{globalThis.fetch=original;}
