import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getProfile} from '../sdk/deployments.js';
import {createExploreIndex,exploreSummary,indexKey} from '../web/explore-index.js';
import {encodeSnapshot,decodeSnapshot} from '../web/explore-snapshot.js';
const zero='0x'+'0'.repeat(40),address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
function fixture(kind='v9',count=64){
 // One published Sepolia graph; kind only selects the v9-era event shapes the index still accepts.
 const profile=getProfile('sepolia'),start=profile.startBlock,memory=new Map(),calls=[],policy={maximumLevel:10,mergesOpen:true,levels:Array.from({length:10},(_,i)=>({level:i+1,basePower:String(1000*(i+1))}))};let tip=start+70000n,epoch=0,fail=false,supply=count-1,range=false;
 const bh=n=>hash(n+(epoch&&n>start+69990n?100000000n:0n));const events=()=>{let i=0;const event=(name,args,block=start)=>({eventName:name,args,blockNumber:String(block),blockHash:bh(block),logIndex:i++,transactionHash:hash(100000n+BigInt(i)),removed:false});const rows=Array.from({length:count},(_,i)=>event('Transfer',{from:zero,to:address(i%40+1),tokenId:String(i+1)}));
  if(kind==='v9'){rows.push(event('Transfer',{from:address(1),to:profile.addresses.staking,tokenId:'1'}));rows.push(event('Deposited',{collection:profile.addresses.nft,account:address(1),tokenId:'1'}));}
  rows.push(event('Transfer',{from:address(24),to:zero,tokenId:'64'},start+69994n));rows.push(event(kind==='v9'?'Merged':'PositionsMerged',{survivor:'2',donor:'64',level:2,nextMergeHeight:'102',nextMergeBlock:'102',collection:'0'},start+69994n));if(epoch)rows.push(event('Transfer',{from:address(2),to:address(99),tokenId:'2'},start+69998n));return rows;};
 const store={get:async key=>structuredClone(memory.get(key)),set:async(key,value)=>memory.set(key,structuredClone(value))};
 const reader={begin:async block=>{calls.push(['begin',block]);const n=block??tip;return {blockNumber:n,blockHash:bh(n),timestamp:1700000000n+(n-start)*12n};},hash:async n=>{calls.push(['hash',n]);return bh(n);},rangeError:e=>e.range,
 logs:async(from,to)=>{calls.push(['logs',from,to]);if(range&&to-from>20000n)throw Object.assign(new Error('range'),{range:true});if(fail&&from>start)throw new Error('interrupted');return events().filter(e=>BigInt(e.blockNumber)>=from&&BigInt(e.blockNumber)<=to);},
 network:async()=>{calls.push(['network']);return {totalSupply:String(supply),policy,core:{blockHeight:'100'}};},hydrate:async tokens=>{calls.push(['hydrate',tokens.length]);return tokens.map(t=>({chainOwner:t.chainOwner,owner:t.deposited?address(1):t.chainOwner,depositor:t.deposited?address(1):null,deposited:t.deposited,level:t.tokenId==='2'?2:1,nextMergeHeight:t.tokenId==='2'?'102':'0',...(kind==='v6'?{activeWeight:'1000',pendingRound:'0'}:{})}));},
 block:async n=>{calls.push(['block',n]);return {hash:bh(n),timestamp:String(1700000000n+(n-start)*12n)};},finish:async()=>{calls.push(['finish']);}};
 return {profile,store,reader,calls,memory,start,get tip(){return tip;},set tip(v){tip=v;},set fail(v){fail=v;},set supply(v){supply=v;},set range(v){range=v;},reorg(){epoch++;},service:(o={})=>createExploreIndex({profile,store,reader,...o})};
}
// Phase 10: prescanned snapshot seed. Display only: valid seed scans only N+1..head;
// hash mismatch, stale, missing, wrong release, or a broken seed all fall back to the full scan.
const reference=fixture();const full=await reference.service().sync();assert.equal(full.status,'complete');const want=exploreSummary(full);
const prescan=fixture();const N=prescan.start+69990n;prescan.tip=N;prescan.supply=64;const prescanned=await prescan.service().sync();assert.equal(prescanned.complete,true);assert.equal(prescanned.snapshot.blockNumber,String(N));
const snap=JSON.parse(JSON.stringify(encodeSnapshot(prescanned,prescan.profile,{generatedAt:'2026-11-07T00:00:00Z'})));
assert.equal(snap.release,'core-sepolia-20261103');assert.equal(snap.revision,prescan.profile.identities.revision);assert.equal(snap.chainId,11155111);assert.equal(snap.blockNumber,String(N));assert.equal(snap.blockHash,prescanned.snapshot.blockHash);
{const d=decodeSnapshot(snap,prescan.profile);assert.equal(Object.values(d.tokens).filter(t=>t.minted&&!t.burned).length,Number(prescanned.totalSupply));assert.equal(d.events.length,prescanned.events.length);
 for(const t of Object.values(prescanned.tokens).filter(t=>t.minted&&!t.burned))for(const k of ['owner','chainOwner','depositor','deposited','level','nextMergeHeight','custody','basePower'])if(t[k]!==undefined)assert.deepEqual(d.tokens[t.tokenId][k],t[k],'round trip '+t.tokenId+' '+k);}
const summary=s=>{const x=exploreSummary(s);return {live:x.live,holders:x.holders,burned:x.burned,stakedPower:x.stakedPower,merges24:x.merges24,hours:x.hours,owners:x.tokens.map(t=>t.tokenId+':'+t.owner+':'+t.level).sort()};};
async function seededRun(mutate=s=>s,{seed}={}){
 const f=fixture(),phases=[];let seedSummary;
 const s=await f.service({seed:seed??(async()=>mutate(structuredClone(snap))),progress:p=>{phases.push(p.phase);if(p.phase==='seed')seedSummary=exploreSummary(p.state,{partial:true});}}).sync();
 return {f,s,phases,seedSummary,firstLog:f.calls.find(c=>c[0]==='logs')};
}
{const {f,s,phases,seedSummary,firstLog}=await seededRun();
 assert.equal(s.status,'complete');assert.equal(s.metrics.seeded,true);assert.equal(s.metrics.seedReason,null);assert.equal(phases[0],'seed');
 assert.ok(seedSummary&&seedSummary.live===Number(prescanned.totalSupply),'holders and power render from the snapshot before any log scan');
 assert.equal(firstLog[1],N+1n,'only N+1..head is scanned');assert.ok(f.calls.filter(c=>c[0]==='logs').every(c=>c[1]>N));
 assert.ok(f.calls.some(c=>c[0]==='hash'&&c[1]===N),'block N hash re-read through the reader (two-peer snapshot path)');
 assert.ok(f.calls.filter(c=>c[0]==='hydrate').reduce((n,c)=>n+c[1],0)<=2,'only Squeeks touched after N are re-read');
 assert.deepEqual(summary(s),summary(full),'seeded result equals the full scan');
 // A later tick is the ordinary warm gap.
 f.calls.length=0;f.tip+=3n;const warm=await f.service({seed:async()=>{throw new Error('seed must not be read with a valid cache');}}).sync();assert.equal(warm.status,'complete');assert.deepEqual(f.calls.filter(c=>c[0]==='logs').map(c=>c.slice(1)),[[f.tip-2n,f.tip]]);
 // A reorg reaching the seed block cannot be replayed from partial history: full scan from the deployment block.
 f.calls.length=0;const saved=f.memory.get(indexKey(f.profile));f.memory.set(indexKey(f.profile),{...saved,lastHash:'0x'+'ee'.repeat(32),lastBlock:String(N+5n)});const replay=await f.service().sync();assert.equal(replay.metrics.reorg,true);assert.equal(f.calls.find(c=>c[0]==='logs')[1],f.start);assert.equal(replay.seedBlock,undefined);assert.deepEqual(summary(replay),summary(full));}
for(const [label,mutate,reason] of [
 ['hash mismatch',s=>({...s,blockHash:'0x'+'ab'.repeat(32)}),/hash mismatch/],
 ['stale (>7 days before the scan block)',s=>({...s,timestamp:String(1700000000+70000*12-8*86400)}),/stale/],
 ['wrong release',s=>({...s,release:'core-sepolia-20260101'}),/release/],
 ['wrong revision',s=>({...s,revision:s.revision+1}),/release/],
 ['wrong chain',s=>({...s,chainId:1}),/chain/],
 ['wrong NFT address',s=>({...s,nft:'0x'+'11'.repeat(20)}),/addresses/],
 ['missing file',()=>null,/missing/],
 ['supply does not add up',s=>({...s,network:{...s.network,totalSupply:'1'}}),/supply/],
 ['ahead of the chain',s=>({...s,blockNumber:String(N+100n)}),/ahead|after N/],
]){const {s,firstLog}=await seededRun(mutate);assert.equal(s.status,'complete',label);assert.equal(s.metrics.seeded,false,label);assert.match(String(s.metrics.seedReason),reason,label);assert.equal(firstLog[1],reference.start,label+' falls back to the full scan');assert.deepEqual(summary(s),summary(full),label);}
{const {s,firstLog}=await seededRun(null,{seed:async()=>{throw new TypeError('Failed to fetch');}});assert.equal(s.metrics.seeded,false);assert.equal(firstLog[1],reference.start);}
// A seed whose token history no longer chains (bad owner) throws in the scan; the index retries once as a full scan.
{const {s}=await seededRun(x=>{const i=x.tokens.findIndex(t=>t[0]===64);const alt=x.addrs.findIndex(a=>a.toLowerCase()!==x.addrs[x.tokens[i][2]].toLowerCase());x.tokens[i]=[...x.tokens[i]];x.tokens[i][1]=x.tokens[i][2]=alt;return x;});assert.equal(s.status,'complete');assert.equal(s.metrics.seeded,false);assert.deepEqual(summary(s),summary(full));}
// Display only: no transaction/SDK path may import the snapshot.
for(const dir of ['sdk','src'])for(const file of fs.readdirSync(dir).filter(f=>/\.m?js$/.test(f))){const text=fs.readFileSync(`${dir}/${file}`,'utf8');assert.ok(!/explore-snapshot|snapshot\/sepolia/.test(text),`${dir}/${file} must not read the display snapshot`);}
// The committed snapshot, when present, decodes against the pinned profile.
if(fs.existsSync('web/snapshot/sepolia.json')){const live=JSON.parse(fs.readFileSync('web/snapshot/sepolia.json','utf8'));const d=decodeSnapshot(live,getProfile('sepolia'));assert.ok(Object.keys(d.tokens).length>0);}
console.log('PASS Phase 10 snapshot: N+1..head only on a verified seed; hash mismatch, stale, missing, release/chain/address mismatch and broken seeds fall back to the full scan; display only');
