import {anySignal,throwIfAborted} from './cancellation.js';
import { DAY,DISPLAY_TTL,displayKey,createDisplayCache } from './display-cache.js';
import { retryAfterMs } from './retry-after.js';
const BASE='https://api.squeekchain.com/v1';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const uint=v=>typeof v==='string'&&/^\d{1,78}$/.test(v)&&BigInt(v)<2n**256n;
const hash=v=>/^0x[\da-f]{64}$/i.test(v??'');
export class DisplayError extends Error{constructor(kind,message){super(message);this.kind=kind;if(kind==='mismatch')this.name='RpcTrustError';}}
const requireData=(ok,message)=>{if(!ok)throw new DisplayError('schema',message);};
const requirePin=(ok,message)=>{if(!ok)throw new DisplayError('mismatch',message);};
const identity=(actual,expected,field,fold=true)=>requirePin(fold?same(actual,expected):actual===expected,`API identity mismatch: ${field}`);
// No implicit CDN expansion. URL policy is checked on fresh and cached metadata,
// and again at the image fetch boundary (including callers with a stub API).
export function artworkUrl(value){
 requireData(typeof value==='string'&&value.length>0&&value.length<=2048,'Invalid artwork URL');
 let url;try{url=new URL(value,'https://api.squeekchain.com');}catch{throw new DisplayError('schema','Invalid artwork URL');}
 requireData(url.origin==='https://api.squeekchain.com'&&!url.username&&!url.password,'Untrusted artwork origin');return url.href;
}
function metadataImage(metadata){if(metadata?.status!=='available')return;
 if(metadata.cardImageUrl!=null)artworkUrl(metadata.cardImageUrl);
 requireData(typeof metadata.cardImageUrl==='string'||(typeof metadata.imageDataUri==='string'&&metadata.imageDataUri.length<=262144&&/^data:image\/svg\+xml;base64,/.test(metadata.imageDataUri)),'Invalid metadata image');
}

export function validateEconomyEnvelope(data,profile,version){
 requireData(data?.schemaVersion===version,'Unsupported display schema');
 if(data.status!=='available')throw new DisplayError('unavailable','API source unavailable');
 identity(data.release?.id,profile.identities.release,'release.id',false);
 const i=data.identities,p=profile.identities.pins;
 for(const [field,name] of [['core','core'],['token','token'],['genesis','nft']])identity(i?.[field],profile.addresses[name],`identities.${field}`);
 for(const [field,name] of [['mining','issuance'],['staking','staking']])for(const [key,expected] of Object.entries({proxy:p[name].address,implementation:p[name].implSlot,implementationVersion:p[name].implementationCodeVersion,storageLayoutDigest:p[name].implementationStorageLayoutDigest}))identity(i?.[field]?.[key],expected,`identities.${field}.${key}`,key!=='implementationVersion');
 if(i?.launch!=null)identity(i.launch,profile.addresses.launch,'identities.launch');
 identity(data.chain?.chainId,'11155111','chain.chainId',false);identity(data.chain?.target,'sepolia','chain.target',false);
 requireData(uint(data.chain?.safeThroughBlock),'Invalid API chain context');
 requireData(typeof data.installationId==='string'&&data.installationId.length>0,'Missing installation context');
 return data;
}
const GENESIS_PHASES=['awaiting_inventory','pending','open','waiting_for_hamster','randomness_pending','processing','claimable','cancelled'];
const GENESIS_REASONS=['indexer_disabled','not_yet_safe','indexer_unavailable','indexer_mismatch','unsupported_contract_version','projection_rebuilding','launch_unconfigured'];
function genesisEnvelope(data){
 requireData(data?.schemaVersion===2,'Unsupported Genesis schemaVersion');
 if(data.status==='unavailable'){requireData(GENESIS_REASONS.includes(data.reason),'Invalid Genesis unavailable reason');return;}
 requireData(data.status==='available','Invalid Genesis status');const s=data.snapshot;
 requireData(s&&s.confirmations===12&&['blockNumber','blockTimestamp','indexedThroughBlock','indexedThroughTimestamp','stateBlockNumber','stateBlockTimestamp'].every(k=>uint(s[k]))&&hash(s.blockHash)&&hash(s.stateBlockHash),'Invalid Genesis snapshot');
}
// All budgets are below the published per-IP ceilings. Shared across profiles in a tab.
const limits={publicFast:[30,60],publicHeavy:[5,20],metadata:[20,40],observations:[2,4]}, buckets=new Map();
export function createDisplayApi({profile,fetcher=globalThis.fetch,cache=createDisplayCache(),now=Date.now,signal,rateBuckets=buckets}={}){
 let context=null;const pending=new Map(),memory=new Map(),counts={api:0,rpc:0,cache:0};
 const check=()=>throwIfAborted(signal);
 const classFor=path=>path.startsWith('/measurement/')?'observations':path.startsWith('/squeeks/')?'metadata':/^\/(accounts|events|settlements)/.test(path)?'publicHeavy':'publicFast';
 function budget(path){const kind=classFor(path),[rate,burst]=limits[kind],at=now(),b=rateBuckets.get(kind)??{at,tokens:burst,retryAt:0};b.tokens=Math.min(burst,b.tokens+Math.max(0,at-b.at)*rate/1000);b.at=at;rateBuckets.set(kind,b);if(at<b.retryAt||b.tokens<1)throw new DisplayError('transport','Display API cooldown');b.tokens--;return b;}
 async function request(path,{validator,store=true}={}){
  check();const key=displayKey(profile,path),noStore=/^\/accounts\//.test(path)||path.startsWith('/measurement/')||path.startsWith('/genesis-launch');
  if(pending.has(key))return pending.get(key);
  const operation=(async()=>{let saved=noStore?null:memory.get(key)??await cache.get(key);check();
   if(saved&&now()-saved.at>DISPLAY_TTL)saved=null;
   const deadline=anySignal([signal],10000);
   let received=false;try{const b=budget(path);counts.api++;const response=await fetcher(BASE+path,{method:'GET',credentials:'omit',cache:noStore?'no-store':'no-cache',headers:{accept:'application/json',...(!noStore&&saved?.etag?{'If-None-Match':saved.etag}:{})},signal:deadline.signal});check();
    if([429,503].includes(response.status))b.retryAt=now()+retryAfterMs(response.headers.get('Retry-After'),now());
    if(response.status===409){const body=await response.json();if((body.code??(typeof body.error==='string'?body.error:body.error?.code))==='cursor_invalidated')throw new DisplayError('cursor','History changed');}
    if(!response.ok&&response.status!==304)throw new DisplayError('transport',`Display API HTTP ${response.status}`);
    requireData(response.status!==304||Boolean(saved),'304 without a validated body');
    let data;if(response.status===304)data=saved.data;else{try{data=await response.json();}catch{throw new DisplayError('schema','Malformed display JSON');}}check();received=true;validator?.(data);
    const result={data,at:now(),etag:response.headers.get('ETag')??saved?.etag??null};
    if(!noStore&&store){memory.set(key,result);await cache.set(key,result);check();}
    return result;
   }catch(error){check();if(error instanceof DisplayError&&error.kind!=='transport'){memory.delete(key);await cache.delete(key);throw error;}
    if(received&&!(error instanceof DisplayError))throw error;
    if(saved){try{validator?.(saved.data);counts.cache++;return {...saved,stale:true};}catch{memory.delete(key);await cache.delete(key);}}
    if(error instanceof DisplayError)throw error;throw new DisplayError('transport','Display API transport unavailable');}finally{deadline.dispose();}
  })().finally(()=>pending.delete(key));pending.set(key,operation);return operation;
 }
 function bind(data){validateEconomyEnvelope(data,profile,2);if(context)identity(data.installationId,context.installationId,'installationId',false);requireData([data.supply?.liveSupplyBaseUnits,data.supply?.capBaseUnits,data.supply?.miningMintedBaseUnits,data.staking?.totalStakedBaseUnits].every(v=>v==null||uint(v))&&uint(data.nft?.live)&&typeof data.nft.mergesOpen==='boolean'&&uint(data.mining?.processedThroughRound)&&uint(data.schedule?.issuedBaseUnits)&&Number.isInteger(data.nft?.maximumLevel)&&data.nft.maximumLevel>=1&&data.nft.maximumLevel<=100&&data.nft.basePower?.length===data.nft.maximumLevel&&data.nft.cooldownBlocks?.length===data.nft.maximumLevel&&data.nft.basePower.every(uint)&&data.nft.cooldownBlocks.every(uint),'Invalid economy display');context={installationId:data.installationId};}
 function installation(data){requireData(context,'No validated economy context');identity(data.installationId,context.installationId,'installationId',false);if(data.release)identity(data.release.id,profile.identities.release,'release.id',false);}
 async function economy(){const result=await request('/economy/state',{validator:bind});const key=displayKey(profile,'static-configuration');let configuration=await cache.get(key);check();if(!configuration||now()-configuration.at>=DAY){configuration={at:now(),value:{release:profile.identities.release,addresses:profile.addresses,expectedIdentities:profile.identities.pins,maximumLevel:result.data.nft.maximumLevel,basePower:result.data.nft.basePower,cooldownBlocks:result.data.nft.cooldownBlocks}};await cache.set(key,configuration);}return {...result,configuration:configuration.value};}
 async function ensureContext(){if(!context)await economy();}
 async function core(){await ensureContext();return request('/core',{validator:data=>{requireData(data.schemaVersion===1,'Unsupported core schema');if(data.status!=='available')throw new DisplayError('unavailable','Core unavailable');installation(data);const pin=profile.identities.pins.core;for(const [field,actual,expected] of [['identities.core',data.identities?.core,pin.address],['identities.proxyImplementation',data.identities?.proxyImplementation,pin.implSlot],['identities.proxyAdminSlot',data.identities?.proxyAdminSlot,pin.adminSlot],['implementation.codeAddress',data.implementation?.codeAddress,pin.implSlot],['implementation.runtimeHash',data.implementation?.runtimeHash,pin.implCodeHash],['implementation.storageLayoutDigest',data.implementation?.storageLayoutDigest,pin.implementationStorageLayoutDigest],['implementation.codeVersion',data.implementation?.codeVersion,pin.implementationCodeVersion]])identity(actual,expected,field,field!=='implementation.codeVersion');requireData(['settledThroughRound','blockHeight','blockProgress','workPerThousandBlocks'].every(k=>uint(data.core?.[k]))&&uint(data.configuration?.genesisTimestamp)&&uint(data.configuration?.roundDuration)&&typeof data.core.paused==='boolean','Invalid core display');}});}
 async function status(){await ensureContext();return request('/status',{validator:data=>{requireData(data.schemaVersion===1,'Unsupported status schema');installation(data);if(data.status!=null&&data.status!=='available')throw new DisplayError('unavailable','Status unavailable');const m=data.measurement;if(m===null)throw new DisplayError('unavailable','No device reading');requireData(m&&['online','stale'].includes(m.freshness)&&['ACTIVE','IDLE','COUNTER_FAULT'].includes(m.coreStatus)&&['rpmMilli','speedMmPerSecond','distanceMm'].every(k=>Number.isSafeInteger(m[k])&&m[k]>=0)&&Number.isFinite(Date.parse(m.receivedAt)),'Invalid measurement display');}});}
 async function blocks(){await ensureContext();return request('/measurement/blocks',{validator:data=>{requireData(data.schemaVersion==='game-block-projection.v1','Unsupported projection schema');installation(data);if(data.status!=='available'||data.freshness!=='fresh')throw new DisplayError('unavailable','Projection unavailable');identity(data.roundSchedule?.genesisTimestamp,profile.identities.pins.issuance.wiring.bindings.genesisTimestamp,'roundSchedule.genesisTimestamp',false);identity(data.roundSchedule?.roundDurationSeconds,600,'roundSchedule.roundDurationSeconds',false);identity(data.chain?.chainId,'11155111','chain.chainId',false);identity(data.chain?.coreAddress,profile.addresses.core,'chain.coreAddress');requireData(Array.isArray(data.blocks)&&data.blocks.length<=120&&data.blocks.every(b=>uint(b.height)&&uint(b.roundId)&&uint(b.workThreshold)),'Invalid projected blocks');}});}
 async function feed(path='/events?category=all&limit=40'){await ensureContext();return request(path,{validator:data=>{validateEconomyEnvelope(data,profile,path.startsWith('/accounts/')?2:3);installation(data);requireData(Array.isArray(data.events??data.activity),'Invalid activity feed');}});}
 async function settlements(range){
  requireData(range==null||range==='7d','Unsupported settlement range');await ensureContext();
  return request('/settlements'+(range?'?range=7d':''),{validator:data=>{
   requireData(data.schemaVersion===3,'Unsupported settlements schema');if(data.status!=='available')throw new DisplayError('unavailable','Settlements unavailable');installation(data);
   for(const [field,actual,expected] of [['chain.chainId',data.chain?.chainId,'11155111'],['chain.target',data.chain?.target,'sepolia'],['mining.economy.releaseId',data.mining?.economy?.releaseId,profile.identities.release],['mining.economy.mining',data.mining?.economy?.mining,profile.addresses.issuance],['mining.economy.token',data.mining?.economy?.token,profile.addresses.token]])identity(actual,expected,field);
   if(!range){requireData(Array.isArray(data.recentSettlements),'Invalid settlements');return;}
   const w=data.window,start=Date.parse(w?.startAt),end=Date.parse(w?.endAt);
   requireData(Number.isFinite(start)&&end-start===7*86400000&&w?.bucketSeconds===21600&&Array.isArray(data.buckets)&&data.buckets.length<=28,'Invalid seven-day settlement window');
   const seen=new Set();for(const bucket of data.buckets){const at=Date.parse(bucket.startAt);requireData(Number.isFinite(at)&&at>=start&&at<end&&(at-start)%21600000===0&&Date.parse(bucket.endAt)===at+21600000&&!seen.has(at)&&[bucket.completedBlockCount,bucket.sqkMintedBaseUnits].every(v=>v==null||uint(v)),'Invalid settlement bucket');seen.add(at);}
  }});
 }
 // Both Genesis endpoints are display-only schema v2 and never stored, including on transport failure.
 async function genesis(){await ensureContext();return request('/genesis-launch',{validator:data=>{
  genesisEnvelope(data);if(data.status==='unavailable')return;
  const b=data.bindings,p=profile.addresses;
  for(const [field,expected] of Object.entries({chainId:'11155111',launch:p.launch,launchRuntimeHash:profile.identities.pins.launch.runtimeCodeHash,nft:p.nft,core:p.core,mining:p.issuance,staking:p.staking}))identity(b?.[field],expected,`bindings.${field}`);
  requireData(GENESIS_PHASES.includes(data.state?.phase)&&uint(data.inventory?.totalIssued)&&data.inventory.drawAllocation==='7777'&&data.inventory.fwaAllocation==='1111'&&data.inventory.protocolReserve==='1111','Invalid Genesis display');
 }});}
 async function genesisWallet(owner){
  requireData(/^0x[0-9a-f]{40}$/i.test(owner??''),'Invalid Genesis wallet');await ensureContext();
  return request(`/genesis-launch/wallet/${owner.toLowerCase()}`,{validator:data=>{
   genesisEnvelope(data);if(data.status==='unavailable')return;
   identity(data.wallet,owner,'wallet');identity(data.launch,profile.addresses.launch,'launch');
   requireData(hash(data.snapshotId)&&Array.isArray(data.receipts)&&data.receipts.length<=100&&(data.nextCursor===null||typeof data.nextCursor==='string'&&data.nextCursor.length>0&&data.nextCursor.length<=512),'Invalid Genesis wallet display');
   const ids=new Set();for(const r of data.receipts){identity(r.depositor,owner,'receipts.depositor');requireData(uint(r.receiptId)&&!ids.has(r.receiptId)&&uint(r.firstEntry)&&uint(r.quantity)&&BigInt(r.quantity)>=1n&&BigInt(r.quantity)<=32n&&typeof r.claimed==='boolean'&&typeof r.refunded==='boolean'&&Array.isArray(r.entries)&&r.entries.length===Number(r.quantity),'Invalid Genesis receipt');ids.add(r.receiptId);const entries=new Set();for(const e of r.entries){requireData(uint(e.entryId)&&!entries.has(e.entryId)&&BigInt(e.entryId)>=BigInt(r.firstEntry)&&BigInt(e.entryId)<BigInt(r.firstEntry)+BigInt(r.quantity)&&(e.allocatedTokenId===null||uint(e.allocatedTokenId))&&typeof e.delivered==='boolean'&&typeof e.refunded==='boolean','Invalid Genesis entry');entries.add(e.entryId);}}
  }});
 }
 async function account(owner){await ensureContext();let cursor=null,first,tokens=[],snapshot,seen=new Set();for(let page=0;page<100;page++){
  const result=await request(`/accounts/${owner.toLowerCase()}?limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{store:false,validator:data=>{validateEconomyEnvelope(data,profile,2);installation(data);requirePin(same(data.account,owner),'Account context mismatch');requireData(hash(data.chain.safeBlockHash)&&Array.isArray(data.tokens)&&data.tokens.length<=100&&(data.nextCursor===null||typeof data.nextCursor==='string'),'Invalid account page');}});check();const d=result.data,at=d.chain.safeThroughBlock+':'+d.chain.safeBlockHash;if(snapshot&&snapshot!==at)throw new DisplayError('unavailable','Account snapshot changed');snapshot=at;first??=result;
  for(const token of d.tokens){requireData(uint(token.tokenId)&&BigInt(token.tokenId)>0n&&['wallet','staking'].includes(token.custody)&&Number.isInteger(token.level)&&token.level>0&&uint(token.nextMergeHeight),'Invalid account token');if(seen.has(token.tokenId))throw new DisplayError('schema','Duplicate account token');seen.add(token.tokenId);tokens.push(token);}
  cursor=d.nextCursor;if(cursor===null){requireData(uint(d.tokenCounts?.wallet)&&uint(d.tokenCounts?.staking)&&BigInt(d.tokenCounts.wallet)+BigInt(d.tokenCounts.staking)===BigInt(tokens.length),'Incomplete display account');return {...first,data:{...first.data,tokens}};}
 }throw new DisplayError('unavailable','Account pagination limit');}
 async function accountActivity(owner,cursor=null){await ensureContext();requireData(/^0x[\da-f]{40}$/i.test(owner),'Invalid account');requireData(cursor==null||(typeof cursor==='string'&&cursor.length<=2048),'Invalid cursor');return request(`/accounts/${owner.toLowerCase()}/activity?limit=25${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{validator:data=>{validateEconomyEnvelope(data,profile,2);installation(data);requirePin(same(data.account,owner),'Activity account mismatch');requireData(Array.isArray(data.activity)&&data.activity.length<=100&&(data.nextCursor===null||typeof data.nextCursor==='string'),'Invalid activity');const ids=new Set();for(const item of data.activity){requireData(typeof item.id==='string'&&item.id.length<=256&&!ids.has(item.id)&&typeof item.kind==='string'&&hash(item.source?.transactionHash)&&item.source.confirmationStatus==='safe'&&Number.isFinite(Date.parse(item.source.blockTimestamp)),'Invalid activity entry');ids.add(item.id);for(const field of ['amountBaseUnits','feeBaseUnits','netBaseUnits','tokenId','survivorTokenId','donorTokenId','level'])if(item[field]!=null)requireData(uint(item[field]),'Invalid activity amount');}}});}
 async function squeek(id,level){await ensureContext();const artKey=displayKey(profile,`art:${id}:${level}`),saved=await cache.get(artKey);check();if(level!=null&&saved&&now()-saved.at<DAY){validateEconomyEnvelope(saved.data,profile,2);installation(saved.data);requirePin(saved.data.tokenId===String(id)&&saved.data.level===level,'Cached artwork identity mismatch');try{metadataImage(saved.data.metadata);}catch(error){await cache.delete(artKey);throw error;}counts.cache++;return saved;}
  const result=await request(`/squeeks/${id}`,{validator:data=>{validateEconomyEnvelope(data,profile,2);installation(data);requirePin(data.tokenId===String(id),'Squeek ID mismatch');requireData(Number.isInteger(data.level)&&data.level>0&&data.level<=100,'Invalid Squeek level');metadataImage(data.metadata);}});
  if(level!=null&&result.data.level!==level)throw new DisplayError('unavailable','Squeek changed level; refresh account');
  const metadata=result.data.metadata;if(metadata?.status==='available'&&typeof metadata.imageDataUri==='string'&&/^data:image\/svg\+xml;base64,/.test(metadata.imageDataUri)&&metadata.imageDataUri.length<=262144)await cache.set(displayKey(profile,`art:${id}:${result.data.level}`),result);
  return result;
 }
 async function invalidateArt(ids){for(const id of ids){const key=displayKey(profile,`/squeeks/${id}`);memory.delete(key);await cache.delete(key);for(let level=1;level<=100;level++)await cache.delete(displayKey(profile,`art:${id}:${level}`));}}
 return {economy,core,status,blocks,feed,settlements,genesis,genesisWallet,account,accountActivity,squeek,invalidateArt,counts,get context(){return context;}};
}
export function apiNetwork(coreResult,economyResult){const c=coreResult.data,e=economyResult.data,settled=BigInt(c.core.settledThroughRound),processed=BigInt(e.mining.processedThroughRound),usable=!coreResult.stale&&!economyResult.stale&&c.chain?.safeThroughBlock===e.chain?.safeThroughBlock&&hash(c.chain?.safeBlockHash)&&same(c.chain.safeBlockHash,e.chain?.safeBlockHash),amount=v=>({base:v,sqk:decimalEther(v)});return {core:{...c.core,genesisTimestamp:c.configuration.genesisTimestamp,roundDuration:c.configuration.roundDuration},mining:{processedThroughRound:String(processed),lagRounds:usable?String(settled>processed?settled-processed:0n):null,issued:amount(e.supply?.miningMintedBaseUnits),minted:amount(e.supply?.liveSupplyBaseUnits),supplyCap:amount(e.supply?.capBaseUnits)},supply:{total:amount(e.supply?.liveSupplyBaseUnits),issued:amount(e.supply?.miningMintedBaseUnits),staked:amount(e.staking?.totalStakedBaseUnits)},policy:{maximumLevel:e.nft.maximumLevel,mergesOpen:e.nft.mergesOpen,levels:e.nft.basePower.map((basePower,i)=>({level:i+1,basePower,cooldownBlocks:e.nft.cooldownBlocks[i]}))},nft:{totalSupply:e.nft.live},checkpoint:{canCheckpoint:usable&&!c.core.paused&&settled>processed,nextRound:String(processed+1n),roundSettled:settled>processed,corePaused:c.core.paused},source:{kind:'api',at:Math.min(coreResult.at,economyResult.at),stale:!usable},snapshot:{blockNumber:c.chain?.safeThroughBlock,timestamp:Number.isFinite(Date.parse(e.chain.safeBlockTimestamp))?String(Math.floor(Date.parse(e.chain.safeBlockTimestamp)/1000)):null}};}
function decimalEther(value){if(!uint(value))return null;const n=BigInt(value);return `${n/10n**18n}.${String(n%10n**18n).padStart(18,'0').replace(/0+$/,'')||'0'}`;}
export function apiWallet(result,net,owner){const d=result.data;for(const field of [d.power?.nftPower,d.power?.sqkPower,d.stake?.principalBaseUnits,d.rewards?.claimableBaseUnits])requireData(uint(field),'Invalid account totals');for(const field of [d.stake?.freshBaseUnits,d.stake?.matureBaseUnits,...d.tokens.map(t=>t.basePower)])if(field!=null)requireData(uint(field),'Invalid optional account amount');const amount=v=>({base:v,sqk:decimalEther(v)});return {owner,net,earnings:d.earnings,rewards:d.rewards,claimRecipient:d.claimRecipient,nftPower:d.power.nftPower,source:{kind:'api',at:result.at},squeeks:d.tokens.map(t=>({tokenId:t.tokenId,level:t.level,custody:t.custody==='staking'?'Staked':'Wallet',deposited:t.custody==='staking',nextMergeHeight:t.nextMergeHeight,basePower:t.basePower,mergeState:t.mergeState})),totals:{count:d.tokens.length,deposited:d.tokens.filter(t=>t.custody==='staking').length,power:String(BigInt(d.power.nftPower)+BigInt(d.power.sqkPower)),claimable:amount(d.rewards.claimableBaseUnits)},staking:{principal:amount(d.stake.principalBaseUnits),fresh:d.stake.freshBaseUnits!=null?amount(d.stake.freshBaseUnits):null,mature:d.stake.matureBaseUnits!=null?amount(d.stake.matureBaseUnits):null},mergePlan:{pairs:[],note:'Choose IDs to preview; eligibility is checked on-chain.'}};}
