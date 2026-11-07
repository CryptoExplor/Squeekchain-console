// Phase 10 prescanned snapshot: compact, DISPLAY-ONLY seed for the Explore index.
// Nothing decoded here is ever used to build a transaction. The client accepts a
// snapshot only after it matches the pinned release/revision/addresses and two RPC
// peers agree that block N has exactly the published blockHash; then it scans N+1..head.
export const SNAPSHOT_FORMAT=1;
export const SNAPSHOT_MAX_AGE_SECONDS=7*86400;
const hash=v=>/^0x[0-9a-f]{64}$/i.test(v??''),addr=v=>/^0x[0-9a-f]{40}$/i.test(v??''),uint=v=>/^(0|[1-9]\d*)$/.test(String(v??''));
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
// Field codes: a = address (index into addrs), i = decimal string stored as a JSON number, n = JSON number kept, s = decimal string kept.
export const EVENT_SCHEMA={
 Transfer:[['from','a'],['to','a'],['tokenId','i']],
 Merged:[['survivor','i'],['donor','i'],['level','n'],['nextMergeHeight','s']],
 Deposited:[['account','a'],['collection','a'],['tokenId','i'],['level','n'],['basePower','s'],['power','s']],
 Withdrawn:[['account','a'],['collection','a'],['tokenId','i'],['level','n'],['basePower','s'],['power','s']],
 Recovered:[['account','a'],['collection','a'],['tokenId','i'],['level','n'],['basePower','s'],['power','s']],
 DepositedMerge:[['account','a'],['collection','a'],['survivor','i'],['donor','i'],['level','n'],['powerDelta','s']],
 PositionsMerged:[['collection','s'],['survivor','i'],['donor','i'],['level','n'],['nextMergeHeight','s']],
};
const NAMES=Object.keys(EVENT_SCHEMA);
const FLAG={minted:1,burned:2,deposited:4,vault:8,stray:16};
const MERGES=new Set(['Merged','DepositedMerge','PositionsMerged']);

export function encodeSnapshot(state,profile,{generatedAt=new Date().toISOString()}={}){
 if(!state?.complete)throw new Error('Only a complete index can be published');
 const addrs=[],addrIndex=new Map(),A=v=>{if(v==null)return -1;if(!addr(v))throw new Error('Bad address');const k=v.toLowerCase();if(!addrIndex.has(k)){addrIndex.set(k,addrs.length);addrs.push(v);}return addrIndex.get(k);};
 const blocks=[],blockIndex=new Map(),txs=[],txIndex=new Map();let previous=BigInt(profile.startBlock);
 const events=state.events.map(e=>{
  const schema=EVENT_SCHEMA[e.eventName];if(!schema)throw new Error('Unknown event '+e.eventName);
  if(!blockIndex.has(e.blockNumber)){const n=BigInt(e.blockNumber);if(n<previous)throw new Error('Events out of order');blockIndex.set(e.blockNumber,blocks.length);blocks.push([Number(n-previous),e.blockHash.slice(2).toLowerCase(),0]);previous=n;}
  const b=blocks[blockIndex.get(e.blockNumber)];if(e.timestamp!=null&&MERGES.has(e.eventName))b[2]=Number(e.timestamp);
  if(!txIndex.has(e.transactionHash)){txIndex.set(e.transactionHash,txs.length);txs.push(e.transactionHash.slice(2).toLowerCase());}
  return [blockIndex.get(e.blockNumber),Number(e.logIndex),txIndex.get(e.transactionHash),NAMES.indexOf(e.eventName),...schema.map(([k,t])=>{const v=e.args[k];return v==null?null:t==='a'?A(v):t==='i'?Number(v):t==='n'?v:String(v);})];
 });
 const tokens=Object.values(state.tokens).sort((a,b)=>Number(a.tokenId)-Number(b.tokenId)).map(t=>[Number(t.tokenId),A(t.owner),A(t.chainOwner),A(t.depositor),t.level??-1,t.nextMergeHeight??'',(t.minted?FLAG.minted:0)|(t.burned?FLAG.burned:0)|(t.deposited?FLAG.deposited:0)|(t.custody==='vault'?FLAG.vault:0)|(t.stray?FLAG.stray:0)]);
 return {format:SNAPSHOT_FORMAT,release:profile.identities.release,revision:profile.identities.revision,chainId:profile.chainId,deploymentBlock:String(profile.startBlock),nft:profile.addresses.nft.toLowerCase(),staking:profile.addresses.staking.toLowerCase(),
  blockNumber:String(state.snapshot.blockNumber),blockHash:state.snapshot.blockHash.toLowerCase(),timestamp:String(state.snapshot.timestamp),generatedAt,
  network:state.network,addrs,blocks,txs,tokens,events};
}

// Throws on anything unexpected; the caller treats any throw as "no snapshot" and full-scans.
export function snapshotMismatch(snap,profile){
 if(!snap||typeof snap!=='object')return 'missing';
 if(snap.format!==SNAPSHOT_FORMAT)return 'format';
 if(snap.release!==profile.identities?.release||snap.revision!==profile.identities?.revision)return 'release';
 if(Number(snap.chainId)!==Number(profile.chainId))return 'chain';
 if(String(snap.deploymentBlock)!==String(profile.startBlock))return 'deployment block';
 if(!same(snap.nft,profile.addresses?.nft)||!same(snap.staking,profile.addresses?.staking))return 'addresses';
 if(!uint(snap.blockNumber)||BigInt(snap.blockNumber)<BigInt(profile.startBlock)||!hash(snap.blockHash)||!uint(snap.timestamp))return 'header';
 return null;
}

export function decodeSnapshot(snap,profile){
 const why=snapshotMismatch(snap,profile);if(why)throw new Error('Snapshot rejected: '+why);
 const {addrs,blocks,txs,tokens:rows,events:list,network}=snap,N=BigInt(snap.blockNumber);
 if(![addrs,blocks,txs,rows,list].every(Array.isArray)||list.length>200000||rows.length>9999)throw new Error('Snapshot rejected: shape');
 if(!network?.policy||!Number.isInteger(network.policy.maximumLevel)||!Array.isArray(network.policy.levels)||!uint(network.totalSupply))throw new Error('Snapshot rejected: network');
 for(const a of addrs)if(!addr(a))throw new Error('Snapshot rejected: address');
 const A=i=>{if(i===-1)return null;const v=addrs[i];if(v===undefined)throw new Error('Snapshot rejected: address index');return v;};
 let n=BigInt(profile.startBlock);const numbers=blocks.map(([d,h,ts])=>{if(!Number.isInteger(d)||d<0||!/^[0-9a-f]{64}$/.test(h)||!Number.isInteger(ts)||ts<0)throw new Error('Snapshot rejected: block');n+=BigInt(d);if(n>N)throw new Error('Snapshot rejected: block after N');return {number:String(n),hash:'0x'+h,timestamp:ts?String(ts):null};});
 for(const t of txs)if(!/^[0-9a-f]{64}$/.test(t))throw new Error('Snapshot rejected: tx');
 const events=list.map(row=>{
  const [bi,logIndex,ti,type,...values]=row,b=numbers[bi],name=NAMES[type],schema=EVENT_SCHEMA[name];
  if(!b||!schema||txs[ti]===undefined||!Number.isInteger(logIndex)||logIndex<0||values.length!==schema.length)throw new Error('Snapshot rejected: event');
  const args={};schema.forEach(([k,t],i)=>{const v=values[i];if(v===null)return;if(t==='a')args[k]=A(v);else if(t==='i'){if(!Number.isInteger(v)||v<0)throw new Error('Snapshot rejected: arg');args[k]=String(v);}else if(t==='n'){if(!Number.isInteger(v))throw new Error('Snapshot rejected: arg');args[k]=v;}else{if(!uint(v))throw new Error('Snapshot rejected: arg');args[k]=v;}});
  const e={eventName:name,args,blockNumber:b.number,blockHash:b.hash,logIndex,transactionHash:'0x'+txs[ti],removed:false};
  if(b.timestamp&&MERGES.has(name))e.timestamp=b.timestamp;
  return e;
 });
 const powerOf=level=>network.policy.levels.find(p=>p.level===level)?.basePower??null,tokens={};
 for(const [id,owner,chainOwner,depositor,level,next,flags] of rows){
  if(!Number.isInteger(id)||id<1||id>9999||tokens[id]||!Number.isInteger(level)||!Number.isInteger(flags)||(next!==''&&!uint(next)))throw new Error('Snapshot rejected: token');
  const t={tokenId:String(id),owner:A(owner)?.toLowerCase()??null,depositor:A(depositor)?.toLowerCase()??null,deposited:Boolean(flags&FLAG.deposited),level:level===-1?null:level,nextMergeHeight:next===''?null:next,burned:Boolean(flags&FLAG.burned),minted:Boolean(flags&FLAG.minted),chainOwner:A(chainOwner)?.toLowerCase()??null};
  if(t.minted&&!t.burned){if(!addr(t.owner)||!addr(t.chainOwner)||t.level==null||t.level<1||t.level>network.policy.maximumLevel||t.nextMergeHeight==null)throw new Error('Snapshot rejected: live token');t.custody=flags&FLAG.vault?'vault':'wallet';t.stray=Boolean(flags&FLAG.stray);t.basePower=powerOf(t.level);t.hydratedAtBlock=String(N);}
  tokens[t.tokenId]=t;
 }
 const live=Object.values(tokens).filter(t=>t.minted&&!t.burned).length;if(String(live)!==String(network.totalSupply))throw new Error('Snapshot rejected: supply');
 return {blockNumber:String(N),blockHash:snap.blockHash.toLowerCase(),timestamp:String(snap.timestamp),network:structuredClone(network),tokens,events};
}
