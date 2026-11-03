// OFFLINE: synthetic code hashes only in a test bundle. Production pins/ABIs are unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { keccak256, decodeFunctionData, encodeFunctionResult, encodeAbiParameters, encodeEventTopics, toHex, zeroAddress } from 'viem';
import { multicall3Abi } from 'viem';
import { PROFILES } from '../sdk/deployments.js';
import { IMPLEMENTATION_SLOT, ADMIN_SLOT } from '../sdk/verify.js';
import { createRpcContext } from '../sdk/rpc.js';
import { core9Abi, issuance9Abi, nft9Abi, staking9Abi, token9Abi } from '../sdk/abi-v9.js';
import { createDiscoveryStore } from '../sdk/discovery.js';
import { runReadTool, STAKING_ACTIONS } from '../sdk/tool-runtime.js';
const profile=structuredClone(PROFILES['sepolia-v9']);
const codes=new Map();let next=1;
for(const pin of Object.values(profile.identities.pins)) {
 const code='0x60'+(next++).toString(16).padStart(2,'0');codes.set(pin.address.toLowerCase(),code);pin.runtimeCodeHash=keccak256(code);
 if(pin.implCodeHash){const impl='0x60'+(next++).toString(16).padStart(2,'0');codes.set(pin.implSlot.toLowerCase(),impl);pin.implCodeHash=keccak256(impl);}
}
const stringify=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?`__bigint:${x}`:x).replace(/"__bigint:(\d+)"/g,'$1n');
const result=await build({entryPoints:['sdk/v9.js'],bundle:true,write:false,platform:'node',format:'esm',packages:'external',plugins:[{name:'synthetic-record-only',setup(b){b.onLoad({filter:/sdk\/deployments\.js$/},()=>({contents:`const profile=${stringify(profile)};export const PROFILES={'sepolia-v9':profile};export const DEFAULT_PROFILE='sepolia-v9';export const getProfile=()=>profile;`,loader:'js'}));}}]});
fs.mkdirSync('.cache',{recursive:true});fs.writeFileSync('.cache/v9-safety.mjs',result.outputFiles[0].text);
const {createSqueek9}=await import('../.cache/v9-safety.mjs');
const owner='0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54',other='0x1111111111111111111111111111111111111111';
const at=12056257n,hash='0x'+'ab'.repeat(32),snapshot={blockNumber:at,blockHash:hash};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const abis={core:core9Abi,issuance:issuance9Abi,staking:staking9Abi,nft:nft9Abi,token:token9Abi};
function fake() {
 const flags={approved:false,all:false,allowance:0n,mergesOpen:true,paused:false,settled:true,fee:2n,empty:false,wrongDepositor:false};const calls=[];
 const track=(name,fn)=>async req=>{if(req?.blockNumber!=null)assert.equal(req.blockNumber,at,name);calls.push({name,...req});return fn(req);};
 const client={
 getChainId:async()=>11155111,
 getBlock:track('getBlock',()=>({number:at,hash,timestamp:1000n})),
 getBalance:track('getBalance',()=>10n**18n),
 getCode:track('getCode',({address})=>codes.get(address.toLowerCase())),
 getStorageAt:track('getStorageAt',({address,slot})=>{const pin=Object.values(profile.identities.pins).find(p=>same(p.address,address));return '0x'+'0'.repeat(24)+(slot===IMPLEMENTATION_SLOT?pin.implSlot:pin.adminSlot).slice(2);}),
 readContract:track('readContract',req=>{
 const {address,functionName:fn,args=[]}=req;const pin=Object.values(profile.identities.pins).find(p=>same(p.address,address));
 if(fn==='proxyAdmin')return pin.adminSlot;
 if(fn==='implementationCodeAddress')return pin.implSlot;
 if(fn==='implementationCodeVersion'||fn==='implementationStorageLayoutDigest')return pin[fn];
 if(Object.hasOwn(pin?.wiring??{},fn))return pin.wiring[fn];
 if(fn==='state')return same(address,profile.addresses.core)?{settledThroughRound:20n,blockHeight:100n,blockProgress:0n,workPerThousandBlocks:1000,paused:flags.paused}:{minted:100n,gachaFunded:50n,stakingFunded:50n,processedThroughRound:19n,fundedBlocks:50n};
 if(fn==='curve')return {targetPower:10000n,floorBps:10};
 if(fn==='checkpointStatus')return [flags.paused,20n,flags.settled];
 if(fn==='totalSupply')return 100n;if(fn==='cap')return 1000n;if(fn==='MAXIMUM_LEVEL')return 10;
 if(fn==='mergesOpen')return flags.mergesOpen;
 if(fn==='cooldownBlocks')return BigInt(args[0])*3n;
 if(fn==='basePower')return 1000n*BigInt(args[1]);
 if(fn==='balanceOf')return flags.empty?0n:same(address,profile.addresses.nft)?2n:100n;
 if(fn==='ownerOf')return BigInt(args[0])<3n?owner:profile.addresses.staking;
 if(fn==='depositor'){assert.ok(same(args[0],profile.addresses.nft));return flags.wrongDepositor?other:owner;}
 if(fn==='level')return 1;if(fn==='nextMergeHeight')return 0n;
 if(fn==='claimable')return 12n;if(fn==='claimRecipient')return owner;
 if(fn==='accountPower')return [2000n,100n];if(fn==='stakeOf')return [100n,50n,25n];
 if(fn==='isApprovedForAll')return flags.all;if(fn==='getApproved')return flags.approved?profile.addresses.staking:zeroAddress;
 if(fn==='allowance')return flags.allowance;if(fn==='quoteUnstake')return [flags.fee,10n-flags.fee];
 if(fn==='tokenURI')return 'data:application/json;base64,'+Buffer.from(JSON.stringify({name:'Mock Squeek',image:'data:image/svg+xml;base64,PHN2Zy8+'})).toString('base64');
 throw new Error('Unmocked '+fn);
 }),
 simulateContract:track('simulateContract',({functionName})=>({result:['claim','claimAndStake'].includes(functionName)?9n:undefined})),
 estimateGas:track('estimateGas',()=>100000n),
 getContractEvents:track('getContractEvents',({eventName,args,fromBlock,toBlock})=>{
 if(flags.empty||at<fromBlock||at>toBlock)return [];
 if(eventName==='Transfer')return args.from?[]:[1n,2n].map((tokenId,logIndex)=>({blockNumber:at,logIndex,eventName,args:{from:other,to:owner,tokenId}}));
 return eventName==='Deposited'?[3n,4n].map((tokenId,logIndex)=>({blockNumber:at,logIndex,eventName,args:{account:owner,collection:profile.addresses.nft,tokenId}})):[];
 }),
 };
 client.multicall=track('multicall',async({contracts,allowFailure})=>Promise.all(contracts.map(async req=>{try{const result=await client.readContract({...req,blockNumber:at});return allowFailure===false?result:{status:'success',result};}catch(error){if(allowFailure===false)throw error;return{status:'failure',error};}})));
 return {client,flags,calls};
}
const make=(f=fake(),options={})=>({f,sdk:createSqueek9({rpcContext:{client:f.client,snapshot:async()=>snapshot,check:async()=>{}},discoveryCache:createDiscoveryStore(null),...options})});
const {f,sdk}=make();
for(const action of ['merge','mergeDeposited'])assert.throws(()=>sdk.actionPreview(owner,action,{survivor:'1',donor:'2'}),/BURN-2/);
assert.equal(f.calls.length,0,'burn guard runs before any network/calldata');
const verify=await sdk.verify();assert.equal(verify.trusted,true);assert.equal(verify.cacheHit,false);
assert.equal((await sdk.verify()).cacheHit,true);
const wallet=await sdk.walletStatus(owner);assert.deepEqual(wallet.squeeks.map(t=>[t.tokenId,t.custody]),[['1','Wallet'],['2','Wallet'],['3','Staked'],['4','Staked']]);assert.equal(wallet.totals.power,'2100');assert.equal(wallet.totals.deposited,2);
assert.equal(wallet.net.policy.levels[1].cooldownBlocks,'6');
let preview=await sdk.actionPreview(owner,'deposit',{tokenIds:['1','2']});assert.equal(preview.approvalRequired,true);assert.deepEqual(preview.tokenIds,['1','2']);
const cases=[['approveNft',{tokenId:'1'},'nft','approve'],['approveAll',{},'nft','setApprovalForAll'],['approveSqk',{amount:'10'},'token','approve'],['withdraw',{tokenIds:['3']},'staking','withdraw'],['merge',{survivor:'1',donor:'2',confirm:'BURN-2'},'nft','merge'],['mergeDeposited',{survivor:'3',donor:'4',confirm:'BURN-4'},'staking','mergeDeposited'],['claim',{},'staking','claim'],['claimAndStake',{},'staking','claimAndStake'],['checkpoint',{},'issuance','checkpoint'],['unstake',{amount:'10'},'staking','unstake']];
for(const[action,input,contract,fn]of cases){const p=await sdk.actionPreview(owner,action,input);assert.equal(p.ok,true,action);assert.ok(same(p.tx.to,profile.addresses[contract]));assert.equal(decodeFunctionData({abi:abis[contract],data:p.tx.data}).functionName,fn);assert.ok(f.calls.some(c=>c.name==='simulateContract'&&c.functionName===fn));}
f.flags.approved=true;assert.equal((await sdk.actionPreview(owner,'deposit',{tokenIds:['1']})).ok,true);
assert.equal((await sdk.actionPreview(owner,'stake',{amount:'10'})).approvalRequired,true);f.flags.allowance=10n;assert.equal((await sdk.actionPreview(owner,'stake',{amount:'10'})).ok,true);
const quote=await sdk.actionPreview(owner,'unstake',{amount:'10'});assert.equal(quote.maxFee,'2');assert.equal(quote.net.base,'8');assert.equal(quote.deadline,'1600');assert.deepEqual(decodeFunctionData({abi:staking9Abi,data:quote.tx.data}).args,[10n,2n,1600n]);
f.flags.fee=3n;assert.equal((await sdk.actionPreview(owner,'unstake',{amount:'10',maxFee:quote.maxFee,deadline:quote.deadline})).ok,false);
await assert.rejects(sdk.actionPreview(owner,'unstake',{amount:'10',deadline:'999'}),/expired/);
f.flags.mergesOpen=false;assert.equal((await sdk.actionPreview(owner,'merge',{survivor:'1',donor:'2',confirm:'BURN-2'})).reasonCode,'mergesClosed');
f.flags.paused=true;assert.equal((await sdk.checkpointPreview(owner)).reasonCode,'paused');assert.equal((await sdk.claimPreview(owner)).total.base,'9','pause does not block funded claims');
f.flags.paused=false;f.flags.settled=false;assert.equal((await sdk.checkpointPreview(owner)).reasonCode,'unsettled');
f.flags.wrongDepositor=true;await assert.rejects(sdk.actionPreview(owner,'withdraw',{tokenIds:['3']}),/depositor/);
for(const kind of ['slot','admin','code','version','layout','wiring','chain','final']) {
 const t=fake(),cache=new Map();
 if(kind==='chain')t.client.getChainId=async()=>1;
 else if(kind==='slot'||kind==='admin'){const read=t.client.getStorageAt;t.client.getStorageAt=req=>req.slot===(kind==='slot'?IMPLEMENTATION_SLOT:ADMIN_SLOT)?Promise.resolve('0x'+'0'.repeat(63)+'1'):read(req);}
 else if(kind==='code')t.client.getCode=async()=> '0x6000';
 else if(kind!=='final'){const read=t.client.readContract;t.client.readContract=req=>req.functionName===({version:'implementationCodeVersion',layout:'implementationStorageLayoutDigest',wiring:'mining'})[kind]?Promise.resolve(kind==='version'?999n:zeroAddress):read(req);}
 const x=make(t,{verificationCache:cache,...(kind==='final'?{rpcContext:{client:t.client,snapshot:async()=>snapshot,check:async()=>{throw new Error('Final hash mismatch');}}}:{})});
 await assert.rejects(x.sdk.verify(),/mismatch|Sepolia|slot|hash/i,kind);assert.equal(cache.size,0,kind);
}
for(const [key]of Object.entries(STAKING_ACTIONS)){const inputs={owner,amount:'10',tokenId:'1',tokenIds:['1'],survivor:'3',donor:'4',confirm:'BURN-4'};const adapter={actionPreview:async(_owner,action)=>({action})};assert.equal((await runReadTool(adapter,`squeek_${key}_preview`,inputs)).action,STAKING_ACTIONS[key]);assert.equal((await runReadTool(adapter,`squeek_prepare_${key}`,inputs)).action,STAKING_ACTIONS[key]);}
console.log('PASS v9 offline ABI calldata, every action/approval, fee/deadline guard, actual claim payout, custody, policy, snapshot identity/cache rejection and shared tool dispatch');

// Count actual JSON-RPC requests through viem batching + production snapshot/chain guards.
const t=fake(),wire=[],realFetch=globalThis.fetch;
const abiFor=address=>abis[Object.entries(profile.addresses).find(([key,value])=>abis[key]&&same(value,address))?.[0]];
function fill(field,value){if(field.type==='tuple')return Object.fromEntries(field.components.map((c,i)=>[c.name,fill(c,value?.[c.name]??value?.[i])]));if(field.type.endsWith('[]'))return value??[];if(value!=null)return field.type.startsWith('uint')?BigInt(value):value;if(field.type.startsWith('uint'))return 0n;if(field.type==='bool')return false;if(field.type==='address')return zeroAddress;if(field.type.startsWith('bytes'))return '0x'+'00'.repeat(Number(field.type.slice(5))||0);return '';}
async function callWire(address,data){if(same(address,'0xca11bde05977b3631167028862be2a173976ca11')) {const {functionName,args}=decodeFunctionData({abi:multicall3Abi,data});if(functionName==='getEthBalance')return encodeFunctionResult({abi:multicall3Abi,functionName,result:10n**18n});const values=await Promise.all(args[0].map(async c=>({success:true,returnData:await callWire(c.target,c.callData)})));return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:values});}
 const abi=abiFor(address),{functionName,args=[]}=decodeFunctionData({abi,data});const output=await t.client.readContract({address,functionName,args,blockNumber:at});const fields=abi.find(f=>f.type==='function'&&f.name===functionName).outputs;return encodeFunctionResult({abi,functionName,result:fields.length===1?fill(fields[0],output):fields.map((field,i)=>fill(field,output?.[i]))});}
globalThis.fetch=async(_url,init)=>{const r=JSON.parse(init.body);wire.push(r);const{method,params=[]}=r;let result;
 if(method==='eth_chainId')result='0xaa36a7';else if(method==='eth_blockNumber')result=toHex(at+12n);
 else if(method==='eth_getBlockByNumber')result={number:params[0],hash,timestamp:'0x3e8',transactions:[]};
 else if(method==='eth_getStorageAt')result=await t.client.getStorageAt({address:params[0],slot:params[1],blockNumber:BigInt(params[2])});
 else if(method==='eth_getCode')result=await t.client.getCode({address:params[0],blockNumber:BigInt(params[1])});
 else if(method==='eth_getBalance')result=toHex(10n**18n);
 else if(method==='eth_call')result=await callWire(params[0].to,params[0].data);
 else if(method==='eth_getLogs'){
 const q=params[0],isNft=same(q.address,profile.addresses.nft),abi=isNft?nft9Abi:staking9Abi;
 const eventName=isNft?'Transfer':['Deposited','Withdrawn','DepositedMerge'].find(name=>encodeEventTopics({abi,eventName:name})[0]===q.topics[0]);
 const args=isNft?(q.topics[1]?{from:owner}:{to:owner}):{account:owner};
 const logs=await t.client.getContractEvents({eventName,args,fromBlock:BigInt(q.fromBlock),toBlock:BigInt(q.toBlock)});
 result=logs.map(log=>{const fields=abi.find(x=>x.type==='event'&&x.name===eventName).inputs.filter(x=>!x.indexed);const values=fields.map(field=>fill(field,log.args[field.name]));return {address:q.address,blockNumber:toHex(at),blockHash:hash,transactionHash:hash,transactionIndex:'0x0',logIndex:toHex(log.logIndex),removed:false,topics:encodeEventTopics({abi,eventName,args:log.args}),data:encodeAbiParameters(fields,values)};});
 }else throw new Error('Unmocked wire '+method);
 return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,result}),{headers:{'content-type':'application/json'}});
};
try {
 const x=createSqueek9({rpcContext:createRpcContext(),discoveryCache:createDiscoveryStore(null)});
 await x.networkStatus();const coldNetwork=wire.length;wire.length=0;
 await x.networkStatus();const warmNetwork=wire.length;assert.ok(warmNetwork<=25,'warm network '+warmNetwork);wire.length=0;
 await x.walletStatus(owner);const coldWallet=wire.length;wire.length=0;
 const wallet=await x.walletStatus(owner);const warmWallet=wire.length;assert.equal(wallet.totals.count,4);assert.ok(warmWallet<=25,'warm wallet '+warmWallet);
 const budget={profile:'sepolia-v9',fixture:'2 wallet + 2 staked NFTs',coldNetwork,warmNetwork,coldWallet,warmWallet,limit:25};
 fs.writeFileSync('docs/audit/v9-request-budget.json',JSON.stringify(budget,null,2)+'\n');console.log('PASS v9 actual wire budget: '+JSON.stringify(budget));
}finally{globalThis.fetch=realFetch;}
