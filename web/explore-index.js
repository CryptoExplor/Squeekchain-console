// Browser-local, display-only event projection. No transaction construction or ownership authority.
const ZERO='0x'+'0'.repeat(40),uint=v=>/^(0|[1-9]\d*)$/.test(String(v??'')),hash=v=>/^0x[0-9a-f]{64}$/i.test(v??''),addr=v=>/^0x[0-9a-f]{40}$/i.test(v??'');
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
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
export function createExploreIndex({profile,store,reader,signal,progress=()=>{},now=()=>performance.now()}){
 let flight;const check=()=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
 async function perform({restart=false}={}){
  const started=now();check();let cached=restart?null:await store.get(indexKey(profile));if(!validCache(cached,profile))cached=null;
  const snapshot=await reader.begin(profile.abiSet==='v6'&&cached?.complete?BigInt(cached.lastBlock):undefined);check();const target=BigInt(snapshot.blockNumber),start=BigInt(profile.startBlock);
  if(target<start)throw new Error('Index incomplete');
  let state=cached?structuredClone(cached):{version:3,key:indexKey(profile),lastBlock:String(start-1n),lastHash:null,tokens:{},events:[],complete:false};let cursor=cached?BigInt(cached.lastBlock)+1n:start,reorg=false;
  if(cached){const anchor=BigInt(cached.lastBlock);if(anchor>target||!same(await reader.hash(anchor),cached.lastHash)){
   reorg=true;let rewind=anchor-63n;if(rewind<start)rewind=start;
   const base=rewind-1n,baseValid=base<start||cached.baseBlock===String(base)&&hash(cached.baseHash)&&same(await reader.hash(base),cached.baseHash);
   if(!baseValid)rewind=start;state.tokens={};state.events=state.events.filter(e=>BigInt(e.blockNumber)<rewind);for(const e of state.events)applyExploreEvent(state.tokens,e,profile);cursor=rewind;state.complete=false;
  }}
  if(profile.abiSet==='v6'&&cached?.complete&&!reorg){const network=await reader.network();state.complete=Object.values(state.tokens).filter(t=>t.minted&&!t.burned).length===Number(network.totalSupply);await reader.finish();return {...state,snapshot:cached.snapshot,metrics:{milliseconds:now()-started,reorg:false,cached:true},status:state.complete?'complete':'incomplete'};}
  let chunk=45000n;const changed=new Set();
  while(cursor<=target){check();const end=cursor+chunk-1n>target?target:cursor+chunk-1n;let events;
   try{events=await reader.logs(cursor,end);}catch(error){check();if(end>cursor&&reader.rangeError(error)){chunk=(end-cursor+1n)/2n;continue;}throw error;}
   const unique=new Map();for(const event of events){if(!uint(event.blockNumber)||BigInt(event.blockNumber)<cursor||BigInt(event.blockNumber)>end||!uint(event.logIndex)||!hash(event.blockHash)||!hash(event.transactionHash)||event.removed)throw new Error('Non-canonical index history');const key=event.blockNumber+':'+event.logIndex;if(unique.has(key))throw new Error('Duplicate index history');unique.set(key,event);}
   const ordered=[...unique.values()].sort((a,b)=>BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)>BigInt(b.blockNumber)?1:Number(a.logIndex)-Number(b.logIndex));
   for(const e of ordered){applyExploreEvent(state.tokens,e,profile);for(const field of ['tokenId','survivor','donor'])if(e.args[field]!=null)changed.add(String(e.args[field]));}
   state.events.push(...ordered);if(state.events.length>200000)throw new Error('Index history limit reached');state.lastBlock=String(end);state.lastHash=await reader.hash(end);state.complete=false;check();await store.set(indexKey(profile),structuredClone(state));cursor=end+1n;progress({done:String(end-start+1n),total:String(target-start+1n)});
  }
  const network=await reader.network(),live=Object.values(state.tokens).filter(t=>t.minted&&!t.burned),hydrate=live.filter(t=>changed.has(t.tokenId)||t.level==null||t.nextMergeHeight==null||t.deposited&&!t.depositor);
  // Canonical reads at this exact safe block establish displayed level/custody, never guesses from mint ordering.
  for(let i=0;i<hydrate.length;i+=120){check();const batch=hydrate.slice(i,i+120),values=await reader.hydrate(batch);if(values.length!==batch.length)throw new Error('Index incomplete');for(let j=0;j<batch.length;j++){
   const t=batch[j],v=values[j];if(!same(t.chainOwner,v.chainOwner)||!Number.isInteger(v.level)||v.level<1||v.level>network.policy.maximumLevel||!uint(v.nextMergeHeight)||!addr(v.owner))throw new Error('Index incomplete');Object.assign(t,v);
  }progress({done:String(target-start+1n),total:String(target-start+1n),tokens:Math.min(i+120,hydrate.length),tokenTotal:hydrate.length});}
  for(const t of live)t.basePower=profile.abiSet==='v6'?t.activeWeight:network.policy.levels.find(p=>p.level===t.level)?.basePower??null;
  // Timestamps are exact block reads, not wall-clock/block-time estimates. Reuse only hash-scoped entries.
  const blocks=new Map();for(const e of state.events)if(e.timestamp==null){if(!blocks.has(e.blockNumber))blocks.set(e.blockNumber,await reader.block(BigInt(e.blockNumber)));const b=blocks.get(e.blockNumber);if(!same(b.hash,e.blockHash))throw new Error('Index history hash mismatch');e.timestamp=String(b.timestamp);}
  check();state.totalSupply=String(network.totalSupply);state.snapshot={blockNumber:String(target),blockHash:snapshot.blockHash,timestamp:String(snapshot.timestamp)};state.network=network;
  const base=target-64n;state.baseBlock=String(base);state.baseHash=base>=start?await reader.hash(base):null;
  state.complete=BigInt(live.length)===BigInt(state.totalSupply)&&live.every(t=>addr(t.owner)&&uint(t.basePower));await reader.finish();check();await store.set(indexKey(profile),structuredClone(state));
  return {...state,status:state.complete?'complete':'incomplete',metrics:{milliseconds:now()-started,reorg,cached:false}};
 }
 return {sync(options){if(flight)return flight;flight=perform(options).finally(()=>flight=null);return flight;},history(state,id){return state?.events?.filter(e=>['tokenId','survivor','donor'].some(k=>String(e.args[k])===String(id)))??[];}};
}
export function exploreSummary(state){
 if(!state?.complete)return null;const tokens=Object.values(state.tokens).filter(t=>t.minted&&!t.burned),wallets=new Map(),max=state.network.policy.maximumLevel,height=BigInt(state.network.core.blockHeight);let stakedPower=0n,stakedCount=0,vaultCount=0;
 for(const t of tokens){const key=t.owner.toLowerCase();if(!wallets.has(key))wallets.set(key,{address:key,totalPower:0n,stakedPower:0n,count:0,highestLevel:0,pairs:0,groups:new Map()});const w=wallets.get(key),power=BigInt(t.basePower);w.totalPower+=power;w.count++;w.highestLevel=Math.max(w.highestLevel,t.level);if(t.deposited||t.custody==='vault')vaultCount++;if(t.deposited){w.stakedPower+=power;stakedPower+=power;stakedCount++;}if(t.stray||t.pendingRound!=null&&t.pendingRound!=='0')w.unknownPairs=true;if(!t.stray&&t.level<max&&state.network.policy.mergesOpen&&(!t.pendingRound||t.pendingRound==='0')&&BigInt(t.nextMergeHeight)<=height){const k=t.level+':'+t.deposited;w.groups.set(k,(w.groups.get(k)??0)+1);}}
 for(const w of wallets.values()){w.pairs=w.unknownPairs?null:[...w.groups.values()].reduce((a,n)=>a+Math.floor(n/2),0);delete w.unknownPairs;delete w.groups;}
 const at=Number(state.snapshot.timestamp),merges=state.events.filter(e=>e.eventName==='Merged'||e.eventName==='PositionsMerged'&&String(e.args.collection)==='0');
 const end=Math.floor(at/3600)*3600,hours=Array.from({length:48},(_,i)=>{const start=end-(47-i)*3600;return {start,count:merges.filter(e=>Number(e.timestamp)>=start&&Number(e.timestamp)<Math.min(start+3600,at+1)).length};});
 return {tokens,wallets:[...wallets.values()],live:tokens.length,burned:Object.values(state.tokens).filter(t=>t.burned&&merges.some(e=>String(e.args.donor)===t.tokenId)).length,holders:wallets.size,topShare:tokens.length?Math.max(0,...[...wallets.values()].map(w=>w.count))/tokens.length*100:0,stakedPower:String(stakedPower),stakedCount,vaultCount,merges24:merges.filter(e=>Number(e.timestamp)>at-86400).length,merges1:merges.filter(e=>Number(e.timestamp)>at-3600).length,hours};
}
export function rankWallets(wallets,sort='totalPower'){const field=['totalPower','stakedPower','count','highestLevel','pairs'].includes(sort)?sort:'totalPower';return [...wallets].sort((a,b)=>a[field]==null?b[field]==null?a.address.localeCompare(b.address):1:b[field]==null?-1:BigInt(a[field])>BigInt(b[field])?-1:BigInt(a[field])<BigInt(b[field])?1:a.address.localeCompare(b.address));}
