import assert from 'node:assert/strict';
import fs from 'node:fs';
const requestBudgets=JSON.parse(fs.readFileSync(new URL('./budgets.json',import.meta.url)));
import {spawnSync} from 'node:child_process';
import {encodeErrorResult,decodeFunctionData,encodeFunctionResult,multicall3Abi,toHex} from 'viem';
import {nftAbi} from '../sdk/abi-core-20261103.js';
import {createRpcContext} from '../sdk/rpc.js';
import {createDiscoveryStore} from '../sdk/discovery.js';
import {stakingAbi} from '../sdk/abi-core-20261103.js';
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
await runPublicReadTool('squeek_wallet_status',{owner,profile:'sepolia'},{createAdapter});assert.equal(selected,'sepolia');
assert.match((await runPublicReadTool('squeek_verify',{owner,profile:'mainnet'},{createAdapter})).error,/not deployed/);
assert.deepEqual(await runPublicReadTool('squeek_verify',{owner},{createAdapter:()=>{throw new Error('private wallet/session diagnostics');}}),{error:'Public read unavailable'});
console.log('PASS cross-origin public policy: five explicit-owner reads, no previews/prepares/requests, no UI defaults, sanitized failure');
const data=encodeErrorResult({abi:stakingAbi,errorName:'DeadlineExpired',args:[]});
for(const error of [{data},{cause:{data}},{code:-32000,data:{originalError:{data}}},{cause:{data:{errorName:'DeadlineExpired',args:[]}}}]) {
 assert.deepEqual(unstakeQuoteError(error),{reasonCode:'quoteExpired',reason:'Quote expired'});
 assert.equal(feeLimitExceeded(error),null,'legacy fee-only decoder keeps its meaning');
}
assert.equal(unstakeQuoteError(new Error('DeadlineExpired text is not decoded evidence')),null);
assert.equal(unstakeQuoteError({data:{errorName:'DeadlineExpired',args:[1n]}}),null);
const cycle={};cycle.cause=cycle;assert.equal(unstakeQuoteError(cycle),null);
console.log('PASS official zero-argument DeadlineExpired decoded through simulation/wallet causes; text alone is not evidence');
// The separate connect-only dual-profile inventory (sdk/profile-selection.js) was deleted with v6/v9.
// Its invariant (proven zero NFT power reads no deposit history and no account API, at one snapshot)
// is asserted on walletStatus in test/v9-safety.mjs.
assert.equal(fs.existsSync('sdk/profile-selection.js'),false);
assert.match(fs.readFileSync('sdk/squeekchain.js','utf8'),/nftPower===0n\?\[\]:depositedIds\(/,'zero NFT power skips deposit history');
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
