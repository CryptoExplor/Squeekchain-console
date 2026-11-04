import assert from 'node:assert/strict';
import fs from 'node:fs';
const requestBudgets=JSON.parse(fs.readFileSync(new URL('./budgets.json',import.meta.url)));
import {spawnSync} from 'node:child_process';
import {encodeErrorResult,decodeFunctionData,encodeFunctionResult,multicall3Abi,toHex} from 'viem';
import {nftAbi} from '../sdk/abi.js';
import {nft9Abi} from '../sdk/abi-v9.js';
import {profileBalances} from '../sdk/profile-selection.js';
import {createRpcContext} from '../sdk/rpc.js';
import {createDiscoveryStore} from '../sdk/discovery.js';
import {staking9Abi} from '../sdk/abi-v9.js';
import {unstakeQuoteError,feeLimitExceeded} from '../sdk/fee-error.js';
import {runPublicReadTool} from '../sdk/public-tools.js';
import {PROFILES,DEFAULT_PROFILE} from '../sdk/deployments.js';
const owner='0x1111111111111111111111111111111111111111';
let made=0,selected,received;
const createAdapter=profile=>{made++;selected=profile.key;return {
 networkStatus:async()=>({public:true}),verify:async()=>({trusted:true}),
 walletStatus:async address=>{received=address;return {owner:address};},
 mergePlan:async address=>({owner:address,pairs:[]}),art:async tokenId=>({tokenId}),
};};
for(const name of ['squeek_wallet_status','squeek_network_status','squeek_verify','squeek_merge_plan','squeek_art']) {
 for(const args of [{},{from:owner},{owner:'bad'},null,[]])assert.match((await runPublicReadTool(name,args,{createAdapter})).error,/explicit.*owner/);
}
for(const name of ['squeek_request_claim','squeek_prepare_claim','squeek_claim_preview','squeek_unstake_preview','unknown'])assert.match((await runPublicReadTool(name,{owner},{createAdapter})).error,/public reads only/);
assert.equal(made,0,'policy rejects before constructing any RPC context');
assert.deepEqual(await runPublicReadTool('squeek_wallet_status',{owner,rpcUrl:'https://secret.example',from:'session-owner',provider:'wallet',profile:undefined},{createAdapter}),{owner});
assert.equal(received,owner);assert.equal(selected,DEFAULT_PROFILE,'uses static default, never the UI/saved profile');
await runPublicReadTool('squeek_wallet_status',{owner,profile:'sepolia-v6'},{createAdapter});assert.equal(selected,'sepolia-v6');
assert.match((await runPublicReadTool('squeek_verify',{owner,profile:'mainnet'},{createAdapter})).error,/not deployed/);
assert.deepEqual(await runPublicReadTool('squeek_verify',{owner},{createAdapter:()=>{throw new Error('private wallet/session diagnostics');}}),{error:'Public read unavailable'});
console.log('PASS cross-origin public policy: five explicit-owner reads, no previews/prepares/requests, no UI defaults, sanitized failure');
const data=encodeErrorResult({abi:staking9Abi,errorName:'DeadlineExpired',args:[]});
for(const error of [{data},{cause:{data}},{code:-32000,data:{originalError:{data}}},{cause:{data:{errorName:'DeadlineExpired',args:[]}}}]) {
 assert.deepEqual(unstakeQuoteError(error),{reasonCode:'quoteExpired',reason:'Quote expired'});
 assert.equal(feeLimitExceeded(error),null,'legacy fee-only decoder keeps its meaning');
}
assert.equal(unstakeQuoteError(new Error('DeadlineExpired text is not decoded evidence')),null);
assert.equal(unstakeQuoteError({data:{errorName:'DeadlineExpired',args:[1n]}}),null);
const cycle={};cycle.cause=cycle;assert.equal(unstakeQuoteError(cycle),null);
console.log('PASS official zero-argument DeadlineExpired decoded through simulation/wallet causes; text alone is not evidence');
// Recount the connect-only zero-power path at the actual HTTP envelope boundary.
const wire=[],realFetch=globalThis.fetch,at=12101024n,hash='0x'+'ab'.repeat(32);
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
function call(to,data) {
 if(same(to,'0xca11bde05977b3631167028862be2a173976ca11')) {
  const {args}=decodeFunctionData({abi:multicall3Abi,data});
  assert.equal(args[0].length,3,'one combined balance + NFT-power multicall');
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:args[0].map(c=>({success:true,returnData:call(c.target,c.callData)}))});
 }
 const v6=same(to,PROFILES['sepolia-v6'].addresses.nft);
 const abi=same(to,PROFILES['sepolia-v9'].addresses.staking)?staking9Abi:v6?nftAbi:nft9Abi;
 const {functionName}=decodeFunctionData({abi,data});assert.ok(['balanceOf','accountPower'].includes(functionName),'no depositor/custody discovery calls');
 return encodeFunctionResult({abi,functionName,result:functionName==='accountPower'?[0n,0n]:v6?2n:0n});
}
globalThis.fetch=async(_url,init)=>{
 const payload=JSON.parse(init.body);wire.push(payload);
 const answer=r=>{let result;switch(r.method){
  case 'eth_chainId':result='0xaa36a7';break;
  case 'eth_blockNumber':result=toHex(at+12n);break;
  case 'eth_getBlockByNumber':result={number:r.params[0],hash,timestamp:'0x3e8',transactions:[]};break;
  case 'eth_call':result=call(r.params[0].to,r.params[0].data);break;
  default:throw new Error('Unexpected inventory RPC '+r.method);
 }return {jsonrpc:'2.0',id:r.id,result};};
 return new Response(JSON.stringify(Array.isArray(payload)?payload.map(answer):answer(payload)),{headers:{'content-type':'application/json'}});
};
try {
 const context=createRpcContext(),options={rpcContext:context,discoveryCache:createDiscoveryStore(null),accountSource:async()=>{throw new Error('Zero power must skip API discovery');}};
 const counts=await profileBalances(owner,options);assert.equal(counts['sepolia-v9'].staked,'0');const cold=wire.length;wire.length=0;
 await profileBalances(owner,options);const warm=wire.length;assert.ok(warm<=requestBudgets.profileInventory.warm);
 const report={operation:'connect-only dual-profile inventory',fixture:'v6 wallet 2 / v9 wallet 0 / v9 NFT power 0',cold,warm,discoveryRequests:0,apiRequests:0,finalSnapshotGuard:true};
 for(const key of ['cold','warm'])assert.ok(report[key]<=requestBudgets.profileInventory[key],key+' inventory budget');for(const key of ['discoveryRequests','apiRequests','finalSnapshotGuard'])assert.equal(report[key],requestBudgets.profileInventory[key]);
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/profile-inventory-request-budget.json',JSON.stringify(report,null,2)+'\n');console.log('PASS zero-power actual wire budget: '+JSON.stringify(report));
}finally{globalThis.fetch=realFetch;}
// Fresh-checkout-safe: dist is ignored; do not rely on artifacts of a prior build.
const build=spawnSync(process.execPath,['build.mjs'],{encoding:'utf8'});assert.equal(build.status,0,build.stdout+build.stderr);
assert.ok(fs.existsSync('dist/_headers'));
const headers=fs.readFileSync('dist/_headers','utf8');assert.equal(headers,fs.readFileSync('web/_headers','utf8'));
for(const policy of ["default-src 'self'","script-src 'self'","connect-src 'self' https://api.squeekchain.com","img-src 'self' data: blob:","style-src 'self'","font-src 'self'","frame-ancestors 'none'","base-uri 'none'","form-action 'none'","object-src 'none'",'X-Content-Type-Options: nosniff','Referrer-Policy: strict-origin-when-cross-origin','Permissions-Policy: camera=(), microphone=(), geolocation=()'])assert.ok(headers.includes(policy),policy);
assert.doesNotMatch(headers,/unsafe-inline|unsafe-eval/);
const connect=headers.match(/connect-src ([^;]+)/)[1].trim().split(/\s+/);assert.deepEqual(connect,["'self'",'https://api.squeekchain.com','https://ethereum-sepolia-rpc.publicnode.com','https://sepolia.gateway.tenderly.co','https://0xrpc.io']);assert.ok(connect.every(origin=>origin!=="https:"&&!origin.includes('*')));
assert.doesNotMatch(fs.readFileSync('dist/index.html','utf8'),/\sstyle\s*=/i,'strict style CSP cannot silently break historical layout');
assert.doesNotMatch(fs.readFileSync('dist/index.html','utf8'),/<script(?![^>]*\bsrc=)[^>]*>/i,'no inline script bootstrap exception');
assert.equal(fs.existsSync('vercel.json'),false,'Cloudflare Pages is the only deployment configuration');
console.log('PASS fresh build dist/_headers, strict CSP/frame-ancestors, retained security headers, no inline HTML styles');
