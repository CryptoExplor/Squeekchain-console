// Browser-local, display-only event projection. No transaction construction or ownership authority.
const ZERO='0x'+'0'.repeat(40),uint=v=>/^(0|[1-9]\d*)$/.test(String(v??'')),hash=v=>/^0x[0-9a-f]{64}$/i.test(v??''),addr=v=>/^0x[0-9a-f]{40}$/i.test(v??'');
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const MERGE_EVENTS=new Set(['Merged','DepositedMerge','PositionsMerged']);
import {decodeSnapshot,SNAPSHOT_MAX_AGE_SECONDS} from './explore-snapshot.js';
export const indexKey=profile=>'explore:v3:'+profile.key+':'+JSON.stringify([profile.addresses,profile.identities,String(profile.startBlock)]);
export function applyExploreEvent(tokens,event,profile){
 const a=event.args,get=id=>{if(!/^[1-9]\d{0,3}$/.test(String(id))||BigInt(id)>9999n)throw new Error('Invalid indexed token');return tokens[String(id)]??={tokenId:String(id),owner:null,depositor:null,deposited:false,level:null,nextMergeHeight:null,burned:false};};
 if(event.eventName==='Transfer'){
  const t=get(a.tokenId);if(!addr(a.from)||!addr(a.to))throw new Error('Invalid transfer');
  if(same(a.from,ZERO)&&t.minted)throw new Error('Duplicate mint');
  if(!same(a.from,ZERO)&&(!t.minted||t.burned||!same(t.chainOwner,a.from)))throw new Error('Transfer history gap');
  if(same(a.from,ZERO))t.minted=true;t.chainOwner=a.to.toLowerCase();t.burned=same(a.to,ZERO);t.deposited=!t.burned&&same(a.to,profile.addresses.staking);t.owner=t.deposited?t.depositor:t.burned?null:a.to.toLowerCase();
 }else if(event.eventName==='Merged'||event.eventName==='PositionsMerged'){
  if(event.eventName==='PositionsMerged'&&String(a.collection)!=='0')return;
  const t=get(a.survivor);t.level=Number(a.level);t.nextMergeHeight=String(a.nextMergeHeight??a.nextMergeBlock);
 }else if(event.eventName==='Deposited'){
  if(!same(a.collection,profile.addresses.nft))return;const t=get(a.tokenId);if(!addr(a.account))throw new Error('Invalid depositor');t.owner=t.depositor=a.account.toLowerCase();t.deposited=true;
 }else if(event.eventName==='Withdrawn'||event.eventName==='Recovered'){
  if(!same(a.collection,profile.addresses.nft))return;const t=get(a.tokenId);t.depositor=null;t.deposited=false;t.owner=(a.account??a.to)?.toLowerCase()??null;
 }else if(event.eventName==='DepositedMerge'){
  if(!same(a.collection,profile.addresses.nft))return;const t=get(a.survivor);t.depositor=t.owner=a.account.toLowerCase();t.deposited=true;
 }
}
function validCache(value,profile){return value?.version===3&&value.key===indexKey(profile)&&uint(value.lastBlock)&&hash(value.lastHash)&&Array.isArray(value.events)&&value.events.length<=200000&&value.tokens&&typeof value.tokens==='object'&&!Array.isArray(value.tokens);}
// A public peer answering 429 is backpressure, not a failed scan: wait out
// Retry-After (bounded) and let the next peer serve the retry.
export const RATE_LIMIT_WAIT_MS=10000;
const rateLimited=error=>Boolean(error)&&(error.name==='RpcAvailabilityError'||error.kind==='cooldown'||[429,503].includes(Number(error.httpStatus??error.status))||/rate limit|too many requests|retry-after|cooldown/i.test(String(error.message??'')));
const retryWait=error=>Math.min(Number(error?.retryAfterMs)>0?Number(error.retryAfterMs):1000,RATE_LIMIT_WAIT_MS);
export function createExploreIndex({profile,store,reader,signal,seed=null,progress=()=>{},now=()=>performance.now(),finalTimeoutMs=20000,historyWindowSeconds=172800,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 let flight,seedDisabled=false,usedSeed=false;
 // One bounded backoff per call site; a second 429 fails over to the caller's next peer.
 const withBackoff=async work=>{try{return await work();}catch(error){if(!rateLimited(error))throw error;await sleep(retryWait(error));check();return work();}};
 const check=()=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
 async function bounded(work,ms=30000){check();let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Explore step timed out'),{name:'TimeoutError'})),ms);})]);}finally{clearTimeout(timer);}}
 // Phase 10: a prescanned snapshot is a display-only seed. It is used only when there is no
 // usable local cache, its release/revision/addresses match the pins, it is at most 7 days
 // older than the scan block, and two RPC peers agree block N has its blockHash. Any
 // failure returns null and the caller full-scans from the deployment block.
 async function loadSeed(target){
  if(!seed||seedDisabled)return {state:null,reason:'off'};
  try{
   const raw=await bounded(()=>seed(),15000);if(raw==null)return {state:null,reason:'missing'};
   const snap=decodeSnapshot(raw,profile),N=BigInt(snap.blockNumber);
   if(N>BigInt(target.blockNumber))return {state:null,reason:'ahead'};
   if(Number(target.timestamp)-Number(snap.timestamp)>SNAPSHOT_MAX_AGE_SECONDS)return {state:null,reason:'stale'};
   const onChain=await bounded(()=>withBackoff(()=>reader.hash(N)));
   if(!hash(onChain)||!same(onChain,snap.blockHash))return {state:null,reason:'hash mismatch'};
   const header={blockNumber:snap.blockNumber,blockHash:snap.blockHash,timestamp:snap.timestamp};
   return {state:{version:3,key:indexKey(profile),lastBlock:snap.blockNumber,lastHash:snap.blockHash,tokens:snap.tokens,events:snap.events,complete:false,network:snap.network,totalSupply:snap.network.totalSupply,snapshot:header,seedBlock:snap.blockNumber},reason:null};
  }catch(error){check();if(error?.name==='AbortError')throw error;return {state:null,reason:String(error?.message??error)};}
 }
 async function perform({restart=false}={}){
  const started=now();check();let cached=restart?null:await bounded(()=>store.get(indexKey(profile)));
  if(!validCache(cached,profile)||cached?.validationFailed||cached?.totalSupply!=null&&!cached.complete&&!cached.scanSnapshot)cached=null;
  let resuming=Boolean(cached&&!cached.complete&&cached.scanSnapshot);
  let snapshot=await bounded(()=>reader.begin(resuming?BigInt(cached.scanSnapshot.blockNumber):undefined));
  if(resuming&&!same(snapshot.blockHash,cached.scanSnapshot.blockHash)){cached=null;resuming=false;snapshot=await bounded(()=>reader.begin());}
  check();const target=BigInt(snapshot.blockNumber),start=BigInt(profile.startBlock);
  if(target<start)throw new Error('Index incomplete');
  const serialSnapshot={blockNumber:String(target),blockHash:snapshot.blockHash,timestamp:String(snapshot.timestamp)};
  let state=cached?structuredClone(cached):{version:3,key:indexKey(profile),lastBlock:String(start-1n),lastHash:null,tokens:{},events:[],complete:false};
  let cursor=cached?BigInt(cached.lastBlock)+1n:start,reorg=false,seeded=false,seedReason=cached?'cache':restart?'restart':null;
  if(!cached&&!restart){const result=await loadSeed(serialSnapshot);seedReason=result.reason;if(result.state){state=result.state;seeded=usedSeed=true;cursor=BigInt(state.lastBlock)+1n;
   const live=Object.values(state.tokens).filter(t=>t.minted&&!t.burned).length;progress({phase:'seed',done:String(cursor-start),total:String(target-start+1n),resumed:false,tokens:live,tokenTotal:live,state});}}
  const save=()=>bounded(()=>{check();return store.set(indexKey(profile),structuredClone(state));});
  const notify=(phase,extra={})=>{check();progress({phase,done:String(cursor-start),total:String(target-start+1n),resumed:resuming,...extra});};
  if(cached){const anchor=BigInt(cached.lastBlock);if(anchor>target||!same(await bounded(()=>reader.hash(anchor)),cached.lastHash)){
   reorg=true;let rewind=anchor-63n;if(rewind<start)rewind=start;
   const base=rewind-1n,baseValid=base<start||cached.baseBlock===String(base)&&hash(cached.baseHash)&&same(await bounded(()=>reader.hash(base)),cached.baseHash);
   // A seeded cache has no reliable event history at or before its snapshot block: rewinding there means a full scan.
   if(!baseValid||cached.seedBlock!=null&&rewind<=BigInt(cached.seedBlock)){rewind=start;delete state.seedBlock;}state.tokens={};state.events=state.events.filter(e=>BigInt(e.blockNumber)<rewind);for(const e of state.events)applyExploreEvent(state.tokens,e,profile);cursor=rewind;state.complete=false;
  }}
  if(!resuming)delete state.hydrationPending;state.complete=false;state.scanSnapshot=serialSnapshot;state.snapshot=serialSnapshot;
  // Busy deployments return >10k logs per ~7k blocks, and public peers answer an oversized
  // range with a slow generic error, so start small and halve on any log-range failure.
  let chunk=4000n;const changed=new Set();
  while(cursor<=target){check();const end=cursor+chunk-1n>target?target:cursor+chunk-1n;let events;
   notify('logs');try{events=await bounded(()=>withBackoff(()=>reader.logs(cursor,end)),15000);}catch(error){check();if(end>cursor&&(reader.rangeError(error)||error?.name==='TimeoutError'||error?.name==='UnknownRpcError')){chunk=(end-cursor+1n)/2n;continue;}throw error;}
   const unique=new Map();for(const event of events){if(!uint(event.blockNumber)||BigInt(event.blockNumber)<cursor||BigInt(event.blockNumber)>end||!uint(event.logIndex)||!hash(event.blockHash)||!hash(event.transactionHash)||event.removed)throw new Error('Non-canonical index history');const key=event.blockNumber+':'+event.logIndex;if(unique.has(key))throw new Error('Duplicate index history');unique.set(key,event);}
   const ordered=[...unique.values()].sort((a,b)=>BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)>BigInt(b.blockNumber)?1:Number(a.logIndex)-Number(b.logIndex));
   for(const e of ordered){applyExploreEvent(state.tokens,e,profile);for(const field of ['tokenId','survivor','donor'])if(e.args[field]!=null){const id=String(e.args[field]);changed.add(id);if(state.tokens[id])delete state.tokens[id].hydratedAtBlock;}}
   state.events.push(...ordered);if(state.events.length>200000)throw new Error('Index history limit reached');state.lastBlock=String(end);state.lastHash=await bounded(()=>withBackoff(()=>reader.hash(end)));cursor=end+1n;await save();notify('logs');
  }
  const network=await bounded(()=>withBackoff(()=>reader.network()));state.network=network;state.totalSupply=String(network.totalSupply);
  const base=target-64n;state.baseBlock=String(base);state.baseHash=base>=start?await bounded(()=>reader.hash(base)):null;
  const live=Object.values(state.tokens).filter(t=>t.minted&&!t.burned),chunkKey=slot=>indexKey(profile)+':hydration:'+target+':'+slot;
  // A log checkpoint is written once; small independent hydration chunks avoid
  // cloning/writing the entire event history after every 120 token reads.
  if(resuming){const slots=[...new Set(live.map(t=>Math.floor((Number(t.tokenId)-1)/120)))];for(let i=0;i<slots.length;i+=8){const keys=slots.slice(i,i+8),entries=await Promise.all(keys.map(slot=>bounded(()=>store.get(chunkKey(slot)))));for(const entry of entries){
   if(!entry||!same(entry.blockHash,snapshot.blockHash)||!Array.isArray(entry.tokens))continue;
   for(const t of entry.tokens){const old=state.tokens[t.tokenId];if(old&&same(old.chainOwner,t.chainOwner)&&t.hydratedAtBlock===String(target)&&Number.isInteger(t.level)&&t.level>=1&&t.level<=network.policy.maximumLevel&&addr(t.owner)&&uint(t.basePower)&&uint(t.nextMergeHeight))Object.assign(old,t);}
  }}}
  const pendingIds=state.hydrationPending?new Set(state.hydrationPending):null;
  const hydrate=live.filter(t=>resuming&&pendingIds?pendingIds.has(t.tokenId)&&t.hydratedAtBlock!==String(target):!t.hydratedAtBlock||changed.has(t.tokenId)||t.level==null||t.nextMergeHeight==null||t.deposited&&!t.depositor);
  if(!pendingIds)state.hydrationPending=hydrate.map(t=>t.tokenId);await save();
  const ready=()=>live.filter(t=>addr(t.owner)&&uint(t.basePower)&&t.hydratedAtBlock!=null).length,groups=new Map();
  for(const t of hydrate){const slot=Math.floor((Number(t.tokenId)-1)/120);if(!groups.has(slot))groups.set(slot,[]);groups.get(slot).push(t);}
  notify('hydrate',{tokens:ready(),tokenTotal:live.length,state});
  // Three hydration multicalls in flight: within the public RPC budget, about a third of the serial wall clock.
  const slots=[...groups.entries()];
  for(let i=0;i<slots.length;i+=3){
    await Promise.all(slots.slice(i,i+3).map(async([slot,batch])=>{
      check();const values=await bounded(()=>withBackoff(()=>reader.hydrate(batch)));if(values.length!==batch.length)throw new Error('Index incomplete');
      for(let j=0;j<batch.length;j++){const t=batch[j],v=values[j];if(!same(t.chainOwner,v.chainOwner)||!Number.isInteger(v.level)||v.level<1||v.level>network.policy.maximumLevel||!uint(v.nextMergeHeight)||!addr(v.owner))throw new Error('Index incomplete');Object.assign(t,v);t.basePower=network.policy.levels.find(p=>p.level===t.level)?.basePower??null;t.hydratedAtBlock=String(target);}
      await bounded(()=>{check();return store.set(chunkKey(slot),{blockHash:snapshot.blockHash,tokens:structuredClone(batch)});});
    }));
    check();notify('hydrate',{tokens:ready(),tokenTotal:live.length,state});
  }
  // Holders and power first (Ravi, 2026-11-07): hydration above renders the grid and leaderboard,
  // then merge timestamps for the 48 h chart fill in. A failed header read leaves times unknown instead of failing the scan.
  // This used to run AFTER 100% hydration: one serial request per historical
  // event block, followed by a two-peer header read. Do this explicitly first.
  // The chart is the only consumer of timestamps during a scan, so only events
  // inside the last 48 hours are fetched here. Per-Squeek history fills its own
  // timestamps lazily when that detail page opens (see history()).
  // Walk distinct event blocks newest-first and stop at the first block older
  // than the 48h chart window. Timestamps for older events stay unfetched and
  // are loaded lazily by history() when that Squeek detail page opens.
  // 12 parallel header reads: measured 2026-11-07 vs live peers, 240 headers 9.3 s at 6 → 5.4 s at 12, no errors (18 gained nothing).
  const HEADER_BATCH=12;
  const cutoff=Number(snapshot.timestamp)-historyWindowSeconds;
  // Only merges need a time during the scan (the 48 h chart); other events get theirs lazily in history().
  const ordered=[...new Set(state.events.filter(e=>MERGE_EVENTS.has(e.eventName)&&e.timestamp==null&&!e.timeUnknown).map(e=>e.blockNumber))]
    .sort((a,b)=>BigInt(a)>BigInt(b)?-1:BigInt(a)<BigInt(b)?1:0),blocks=new Map();
  for(let i=0;i<ordered.length;i+=HEADER_BATCH){
    notify('history',{headers:i,headerTotal:ordered.length,tokens:live.length,tokenTotal:live.length,state});
    const batch=ordered.slice(i,i+HEADER_BATCH);
    let values;try{values=await Promise.all(batch.map(n=>bounded(()=>withBackoff(()=>reader.block(BigInt(n))))));}catch(error){check();if(error?.name==='AbortError')throw error;break;}
    batch.forEach((n,j)=>blocks.set(n,values[j]));
    if(values.some(value=>Number(value.timestamp)<cutoff))break;
  }
  for(const e of state.events)if(e.timestamp==null&&MERGE_EVENTS.has(e.eventName)){
    const b=blocks.get(e.blockNumber);
    if(!b){e.timeUnknown=true;continue;}
    if(!same(b.hash,e.blockHash))throw new Error('Index history hash mismatch');
    if(Number(b.timestamp)>=cutoff)e.timestamp=String(b.timestamp);else e.timeUnknown=true;
  }
  for(const t of live)t.basePower=network.policy.levels.find(p=>p.level===t.level)?.basePower??null;
  // No historical RPC work is allowed after hydration reaches 100%. The local
  // commit is NOT inside the network budget: a full IndexedDB write plus a
  // two-peer check in 4s was the old failure. The check now gets its own window
  // and is retried once before the UI offers Retry.
  notify('final',{tokens:live.length,tokenTotal:live.length,state});
  await save();
  const validate=()=>bounded(async()=>{check();await reader.finish();check();
    return BigInt(live.length)===BigInt(state.totalSupply)&&live.every(t=>addr(t.owner)&&uint(t.basePower));},finalTimeoutMs);
  let complete;
  // RPC peers rate-limit (429) at this step; back off and retry, then keep the hydrated data as partial instead of throwing it away.
  complete=false;
  for(let attempt=0;attempt<4;attempt++){
   try{complete=await validate();break;}
   catch(error){check();if(error?.name==='AbortError')throw error;if(attempt===3)break;await sleep(1500*(attempt+1));}
  }
  state.complete=complete;state.validationFailed=!complete;
  await save();
  return {...state,status:state.complete?'complete':'incomplete',metrics:{milliseconds:now()-started,reorg,cached:false,resumed:resuming,seeded,seedReason}};
 }
 // A seeded scan that throws (e.g. a snapshot token whose history no longer chains) is
 // retried once as a full scan with the seed switched off for this index's lifetime.
 async function run(options){usedSeed=false;try{return await perform(options);}catch(error){check();if(!usedSeed||seedDisabled||error?.name==='AbortError')throw error;seedDisabled=true;return perform({...options,restart:true});}}
 return {
  // Last complete index saved on this device, shown at once (display only) while a scan catches up.
  async peek(){try{const value=await bounded(()=>store.get(indexKey(profile)),5000);return validCache(value,profile)&&value.complete&&!value.validationFailed&&value.snapshot?value:null;}catch{return null;}},
  sync(options){if(flight)return flight;flight=run(options).finally(()=>flight=null);return flight;},
  // Per-Squeek history is resolved when its page opens, not during the scan.
  async history(state,id){
    const events=state?.events?.filter(e=>['tokenId','survivor','donor'].some(k=>String(e.args[k])===String(id)))??[];
    if(!state)return events;
    const pending=[...new Set(events.filter(e=>e.timestamp==null&&!e.timeUnknown).map(e=>e.blockNumber))].slice(0,40);
    for(const block of pending){
      try{
        const value=await withBackoff(()=>reader.block(BigInt(block)));
        if(events.some(e=>String(e.blockNumber)===String(block)&&!same(value.hash,e.blockHash)))throw new Error('History hash mismatch');
        for(const e of state.events)if(String(e.blockNumber)===String(block)){e.timestamp=String(value.timestamp);delete e.timeUnknown;}
      }catch(error){
        if(error?.name==='AbortError')throw error;
        for(const e of state.events)if(String(e.blockNumber)===String(block))e.timeUnknown=true;
      }
    }
    return events;
  }};
}
export function exploreSummary(state,{partial=false}={}){
 if(!state?.complete&&!(partial&&state?.network&&state?.snapshot))return null;const tokens=Object.values(state.tokens).filter(t=>t.minted&&!t.burned&&(state.complete||t.hydratedAtBlock!=null&&addr(t.owner)&&uint(t.basePower))),wallets=new Map(),max=state.network.policy.maximumLevel,height=BigInt(state.network.core.blockHeight);let stakedPower=0n,stakedCount=0,vaultCount=0;
 for(const t of tokens){const key=t.owner.toLowerCase();if(!wallets.has(key))wallets.set(key,{address:key,totalPower:0n,stakedPower:0n,count:0,highestLevel:0,pairs:0,groups:new Map()});const w=wallets.get(key),power=BigInt(t.basePower);w.totalPower+=power;w.count++;w.highestLevel=Math.max(w.highestLevel,t.level);if(t.deposited||t.custody==='vault')vaultCount++;if(t.deposited){w.stakedPower+=power;stakedPower+=power;stakedCount++;}if(t.stray||t.pendingRound!=null&&t.pendingRound!=='0')w.unknownPairs=true;if(!t.stray&&t.level<max&&state.network.policy.mergesOpen&&(!t.pendingRound||t.pendingRound==='0')&&BigInt(t.nextMergeHeight)<=height){const k=t.level+':'+t.deposited;w.groups.set(k,(w.groups.get(k)??0)+1);}}
 for(const w of wallets.values()){w.pairs=w.unknownPairs?null:[...w.groups.values()].reduce((a,n)=>a+Math.floor(n/2),0);delete w.unknownPairs;delete w.groups;}
 const at=Number(state.snapshot.timestamp),merges=state.events.filter(e=>e.eventName==='Merged'||e.eventName==='PositionsMerged'&&String(e.args.collection)==='0');
 const end=Math.floor(at/3600)*3600,hours=Array.from({length:48},(_,i)=>{const start=end-(47-i)*3600;return {start,count:merges.filter(e=>Number(e.timestamp)>=start&&Number(e.timestamp)<Math.min(start+3600,at+1)).length};});
 return {tokens,wallets:[...wallets.values()],live:tokens.length,burned:Object.values(state.tokens).filter(t=>t.burned&&merges.some(e=>String(e.args.donor)===t.tokenId)).length,holders:wallets.size,topShare:tokens.length?Math.max(0,...[...wallets.values()].map(w=>w.count))/tokens.length*100:0,stakedPower:String(stakedPower),stakedCount,vaultCount,merges24:merges.filter(e=>Number(e.timestamp)>at-86400).length,merges1:merges.filter(e=>Number(e.timestamp)>at-3600).length,hours};
}
export function rankWallets(wallets,sort='totalPower'){const field=['totalPower','stakedPower','count','highestLevel','pairs'].includes(sort)?sort:'totalPower';return [...wallets].sort((a,b)=>a[field]==null?b[field]==null?a.address.localeCompare(b.address):1:b[field]==null?-1:BigInt(a[field])>BigInt(b[field])?-1:BigInt(a[field])<BigInt(b[field])?1:a.address.localeCompare(b.address));}
