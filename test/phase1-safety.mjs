// Phase 1 safety, ported to the single published Sepolia graph (sdk/squeekchain.js + createChainVerifier).
// OFFLINE: synthetic runtime code only in a TEST profile clone / test bundle. Production pins are unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { keccak256, zeroAddress, encodeAbiParameters, encodeEventTopics, toHex, decodeFunctionData, encodeFunctionResult, multicall3Abi } from 'viem';
import { createSqueekchain, requireBurn } from '../sdk/squeekchain.js';
import { createRpcContext, chainCheckedRequest, createSnapshotGuard, RpcTrustError, requireSepolia, PUBLIC_RPCS } from '../sdk/rpc.js';
import { coreAbi, miningAbi, nftAbi, stakingAbi, tokenAbi } from '../sdk/abi-core-20261103.js';
import { createChainVerifier, IMPLEMENTATION_SLOT, ADMIN_SLOT } from '../sdk/verify-chain.js';
import { DEFAULT_PROFILE, PROFILES } from '../sdk/deployments.js';
import { createDiscoveryStore } from '../sdk/discovery.js';
import { TOOL_SPECS } from '../sdk/tools.js';
import { parseSqueekMetadata } from '../sdk/metadata.js';

function assertGasFree(value){if(value&&typeof value==='object')for(const[key,item]of Object.entries(value)){assert.ok(!['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas'].includes(key),'Gas field in preview: '+key);assertGasFree(item);}}
const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const other = '0x1111111111111111111111111111111111111111';
const hash = `0x${'ab'.repeat(32)}`, wrongHash = `0x${'cd'.repeat(32)}`;
const blockNumber = 12101024n;
const snapshot = { blockNumber, blockHash: hash };
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

// Synthetic code for every published pin; a synthetic implementationCodeVersion so the version stop stays tested.
const profile = structuredClone(PROFILES['sepolia']);
const codes = new Map(); let next = 1;
for (const pin of Object.values(profile.identities.pins)) {
  const code = '0x60' + (next++).toString(16).padStart(2, '0'); codes.set(pin.address.toLowerCase(), code); pin.runtimeCodeHash = keccak256(code);
  if (pin.implCodeHash) { pin.implementationCodeVersion = String(next); const impl = '0x60' + (next++).toString(16).padStart(2, '0'); codes.set(pin.implSlot.toLowerCase(), impl); pin.implCodeHash = keccak256(impl); }
}
// Single definition of the strict snapshot-pinned client fixture lives in test/v9-safety.mjs.
const source = fs.readFileSync('test/v9-safety.mjs', 'utf8');
const fakeText = source.slice(source.indexOf('function fake()'), source.indexOf('\nconst make='));
const fillText = source.slice(source.indexOf('function fill('), source.indexOf('\nconst respond='));
const rawLogText = source.slice(source.indexOf('function rawLog('), source.indexOf('\nasync function callWire('));
const abis = { core: coreAbi, issuance: miningAbi, staking: stakingAbi, nft: nftAbi, token: tokenAbi };
const fake = new Function('assert','profile','codes','same','owner','other','IMPLEMENTATION_SLOT','ADMIN_SLOT','encodeAbiParameters','encodeEventTopics','toHex','zeroAddress','stakingAbi','at','hash',
  `${fakeText}\n${fillText.split('\nasync function callWire(')[0]}\n${rawLogText}\nreturn fake;`)(assert,profile,codes,same,owner,other,IMPLEMENTATION_SLOT,ADMIN_SLOT,encodeAbiParameters,encodeEventTopics,toHex,zeroAddress,stakingAbi,blockNumber,hash);

assert.equal(DEFAULT_PROFILE, 'sepolia');
assert.deepEqual(Object.keys(PROFILES).sort(), ['mainnet', 'sepolia'], 'no v6/v9 profiles');
assert.equal(PROFILES.mainnet.addresses, null, 'mainnet never guesses addresses');
for (const action of ['claim','merge','checkpoint','deposit','withdraw','stake','unstake']) { assert.equal(PROFILES['sepolia'].capabilities[action], true); assert.equal(PROFILES.mainnet.capabilities[action], false); }
assert.throws(() => createSqueekchain({ profileKey: 'mainnet' }), /Sepolia deployment required/);
const gated = createSqueekchain();
for (const name of ['claimPreview','mergePreview','actionPreview']) assert.equal(typeof gated[name],'function');
assert.throws(() => gated.mergePreview(owner,'1','2'), /BURN-2/);
assert.ok(PUBLIC_RPCS.length >= 3);
assert.throws(() => requireSepolia(1), /Sepolia/);
requireSepolia('0xaa36a7');
assert.throws(() => createSqueekchain({ skipVerification: true }), /cannot be disabled/);
assert.throws(() => createSqueekchain({ addresses: { mining: other } }), /published deployment/);
for (const confirm of [undefined, '', '2', 'burn-2', 'BURN-1']) assert.throws(() => requireBurn('2', confirm), /BURN-2/);
requireBurn('2', 'BURN-2');
assert.ok(TOOL_SPECS.find(tool => tool.name === 'squeek_merge_preview').inputSchema.required.includes('confirm'));
console.log('PASS gates: one deployed Sepolia profile, mainnet not deployed; guarded action surface; BURN guard before network/calldata; no verification bypass or address override');

const peer = (blockHash = hash, chainId = 11155111) => ({ getChainId: async () => chainId, getBlock: async ({ blockNumber: at }) => ({ number: at, hash: blockHash }) });
const primary = { ...peer(), getBlockNumber: async () => blockNumber + 12n };
const guard = createSnapshotGuard(primary, [peer(), peer()]);
assert.equal((await guard.snapshot()).blockNumber, blockNumber);
await assert.rejects(createSnapshotGuard(primary, [peer(), peer(wrongHash), peer()]).snapshot(), /hash mismatch/);
await assert.rejects(createSnapshotGuard(primary, [peer(hash, 1), peer(), peer()]).snapshot(), /chainId/);
await assert.rejects(createSnapshotGuard(primary, [peer()]).snapshot(), /two independent/);
const changeable = peer();
const reorgGuard = createSnapshotGuard(primary, [peer(), changeable]);
const before = await reorgGuard.snapshot();
changeable.getBlock = async ({ blockNumber: at }) => ({ number: at, hash: wrongHash });
await assert.rejects(reorgGuard.check(before), /hash mismatch/);
console.log('PASS RPC trust: wrong chain, peer disagreement, insufficient peers and reorganization fail closed');


// Same-block identity verification (createChainVerifier replaces verifyGraphAt).
const verified = await createChainVerifier(new Map(), profile).prepare(fake().client, snapshot);
assert.equal(verified.value.ok, true); assert.equal(verified.value.chainId, profile.chainId);
const mutated = (alter) => { const t = fake(); alter(t.client); return t.client; };
const onRead = (fn, value) => client => { const read = client.readContract; client.readContract = req => req.functionName === fn ? Promise.resolve(typeof value === 'function' ? value(req) : value) : read(req); };
const onSlot = (slot, value) => client => { const read = client.getStorageAt; client.getStorageAt = req => req.slot === slot ? Promise.resolve(value) : read(req); };
for (const [label, alter] of [
  ['implementation runtime hash', client => { const read = client.getCode; client.getCode = req => same(req.address, profile.identities.pins.core.implSlot) ? Promise.resolve('0x60ff') : read(req); }],
  ['token runtime hash', client => { const read = client.getCode; client.getCode = req => same(req.address, profile.addresses.token) ? Promise.resolve('0x60ff') : read(req); }],
  ['layout', onRead('implementationStorageLayoutDigest', wrongHash)],
  ['version', onRead('implementationCodeVersion', 999n)],
  ['reported implementation', onRead('implementationCodeAddress', other)],
  ['implementation slot', onSlot(IMPLEMENTATION_SLOT, `0x${'0'.repeat(63)}1`)],
  ['admin slot', onSlot(ADMIN_SLOT, `0x${'0'.repeat(63)}1`)],
  ['reported admin', onRead('proxyAdmin', other)],
  ['wiring', onRead('sqkCore', other)],
  ['configuration', onRead('configuration', req => same(req.address, profile.addresses.core) ? { ...profile.identities.pins.core.wiring.configuration, streamId: wrongHash } : undefined)],
  ['mining bindings', onRead('bindings', { ...profile.identities.pins.issuance.wiring.bindings, staking: other })],
]) {
  const cache = new Map();
  await assert.rejects(createChainVerifier(cache, profile).prepare(mutated(alter), snapshot), RpcTrustError, label);
  assert.equal(cache.size, 0, label + ' cannot seed the cache');
}
await assert.rejects(createChainVerifier(new Map(), profile).prepare({ getChainId: async () => 1 }, snapshot), /Sepolia|chainId/);
// Two-peer identity reads: fewer than two peers, or one disagreeing peer, stops.
const good = fake().client, values = async (snap, requests) => Promise.all(requests.map(r => r.method === 'eth_getCode' ? good.getCode({ address: r.params[0], blockNumber }) : good.getStorageAt({ address: r.params[0], slot: r.params[1], blockNumber })));
assert.equal((await createChainVerifier(new Map(), profile).prepare(good, snapshot, async (snap, req) => [await values(snap, req), await values(snap, req)])).value.ok, true);
await assert.rejects(createChainVerifier(new Map(), profile).prepare(good, snapshot, async (snap, req) => [await values(snap, req)]), /two identity peers/);
await assert.rejects(createChainVerifier(new Map(), profile).prepare(good, snapshot, async (snap, req) => { const a = await values(snap, req), b = [...a]; b[0] = `0x${'0'.repeat(63)}1`; return [a, b]; }), RpcTrustError);
// Production pins are NOT the synthetic ones: real pins never verify synthetic code.
await assert.rejects(createChainVerifier(new Map(), PROFILES['sepolia']).prepare(fake().client, snapshot), RpcTrustError, 'production pins reject synthetic runtime code');
console.log('PASS same-block verification: runtime/layout/version/implementation/admin slots/reported admin/wiring/configuration/bindings mismatches and wrong chain stop; two peers required; no cache seed');

// Bundle the unchanged production SDK with the TEST-ONLY synthetic profile (deployments.js swapped in the bundle only).
const stringify = v => JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? `__bigint:${x}` : x).replace(/"__bigint:(\d+)"/g, '$1n');
const bundled = await build({ entryPoints: ['sdk/squeekchain.js'], bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'synthetic-profile-only', setup(b) {
  b.onLoad({ filter: /sdk\/deployments\.js$/ }, () => ({ contents: `const profile=${stringify(profile)};export const PROFILES={'sepolia':profile};export const DEFAULT_PROFILE='sepolia';export const getProfile=()=>profile;export const PUBLISHED_ABIS=profile.abis;`, loader: 'js' }));
} }] });
fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync('.cache/phase1-safety.mjs', bundled.outputFiles[0].text);
const { createSqueekchain: createFixtureSdk } = await import('../.cache/phase1-safety.mjs');
const fixtureSdk = (client, options = {}) => createFixtureSdk({ rpcContext: { client, snapshot: async () => snapshot, check: async () => {} }, discoveryCache: createDiscoveryStore(null), accountSource: null, ...options });
{
  const t = fake(); let checks = 0;
  const sdk = fixtureSdk(t.client, { rpcContext: { client: t.client, snapshot: async () => snapshot, check: async () => { checks++; } } });
  assert.equal(sdk.buildMerge, undefined, 'no unchecked public builders');
  const claim = await sdk.claimPreview(owner);
  assert.equal(claim.total.base, '9', 'amount is the simulated payout, not a claimable estimate');
  assert.ok(t.calls.some(c => c.name === 'simulateContract' && c.functionName === 'claim' && same(c.account, owner)), 'claim simulated as the owner');
  assert.equal((await sdk.mergePreview(owner, '1', '2', { confirm: 'BURN-2' })).ok, true);
  assert.ok(same(t.calls.find(r => r.name === 'simulateContract' && r.functionName === 'merge')?.account, owner), 'merge simulation uses the owner as sender');
  await assert.rejects(sdk.mergePreview(owner, '1', '1', { confirm: 'BURN-1' }), /different/);
  t.flags.wrongDepositor = true; await assert.rejects(sdk.actionPreview(owner, 'withdraw', { tokenIds: ['3'] }), /depositor/); t.flags.wrongDepositor = false;
  assert.equal((await sdk.checkpointPreview(owner)).ok, true);
  const status = await sdk.walletStatus(owner); assert.equal(status.totals.count, 4); assert.equal(status.chainId, profile.chainId, 'wallet chainId comes from the profile');
  const detail = await sdk.squeekStatus('1'); assert.equal(detail.token.tokenId, '1'); assert.ok(same(detail.owner, owner));
  assert.equal((await sdk.art('1')).tokenId, '1');
  const tx = (await sdk.actionPreview(owner, 'claim')).tx; assert.equal(tx.chainId, profile.chainId, 'prepared tx chainId comes from the profile'); assert.equal(tx.value, '0');
  assert.ok(checks >= 5, 'every operation runs the final snapshot guard'); assertGasFree(claim); assertGasFree(status);
  assert.equal(t.calls.some(r => r.name === 'estimateGas'), false);
}
{
  const t = fake(); t.client.simulateContract = async () => { throw new Error('Fixture revert'); };
  await assert.rejects(fixtureSdk(t.client).claimPreview(owner), /Fixture revert/);
  assert.equal(t.calls.some(r => r.name === 'estimateGas'), false);
  const final = fixtureSdk(fake().client, { rpcContext: { client: fake().client, snapshot: async () => snapshot, check: async () => { throw new RpcTrustError('Reorg mismatch'); } } });
  await assert.rejects(final.claimPreview(owner), /Reorg mismatch/);
}
console.log('PASS SDK: snapshot-pinned reads/simulation (no gas estimation), simulated payout, owner-as-sender, distinct merge ids, depositor custody, checkpoint, art, profile chainId, reverts and final hash guard');

for (const file of ['src/cli.js', 'src/actions.js', 'src/chain.js', 'src/config.js', 'mcp/server.js', 'web/app.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /privateKeyToAccount|createWalletClient|KEEPER_PRIVATE_KEY|process\.env\.PRIVATE_KEY|getWallet|writeContract/);
}
for (const command of [['mine'], ['claim', '--live'], ['merge', '--owner', owner, '--survivor', '1', '--donor', '2', '--confirm', '2']]) {
  const result = spawnSync(process.execPath, ['src/cli.js', ...command], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported|Unknown|BURN/);
}
const keeper = spawnSync(process.execPath, ['keeper/checkpoint.mjs'], { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
assert.equal(keeper.status, 1); assert.match(keeper.stderr, /Keeper OFF/);
assert.throws(() => parseSqueekMetadata('data:application/json;base64,' + Buffer.from(JSON.stringify({ image: 'https://evil.test/art.svg' })).toString('base64')), /Unsupported art/);
console.log('PASS key isolation: unsigned owner CLI/MCP, no mine/live signing, keeper off, isolated-image metadata restriction');

// Transport probes are shared once per endpoint, invalidated on errors, never per eth_call.
const chainCache = new Map();
let probes = 0, fail = false, chain = '0xaa36a7';
const checkedRequest = chainCheckedRequest(async ({ method }) => {
  if (method === 'eth_chainId') { probes++; return chain; }
  if (fail) throw new Error('Transport failure');
  return '0x1';
}, { key: 'test', chainCache });
await Promise.all(Array.from({ length: 20 }, () => checkedRequest({ method: 'eth_blockNumber' })));
assert.equal(probes, 1);
fail = true;
await assert.rejects(checkedRequest({ method: 'eth_blockNumber' }), /Transport failure/);
assert.equal(probes, 2);
chainCache.clear(); chain = '0x1'; fail = false;
await assert.rejects(checkedRequest({ method: 'eth_blockNumber' }), /chainId/);
console.log('PASS chain cache: shared probes, error recheck, wrong-chain rejection');


// A wrong-chain endpoint is a trust stop: wrapped trust errors must not be retried away through other RPCs.
{
  const realFetch = globalThis.fetch, contacted = [];
  globalThis.fetch = async (url, init) => { contacted.push(url); const request = JSON.parse(init.body); const answer = r => ({ jsonrpc: '2.0', id: r.id, result: r.method === 'eth_chainId' ? '0x1' : '0x1' }); return new Response(JSON.stringify(Array.isArray(request) ? request.map(answer) : answer(request)), { headers: { 'content-type': 'application/json' } }); };
  try { await assert.rejects(createRpcContext().snapshot(), /chainId|Sepolia/); assert.equal(new Set(contacted).size, 1, 'wrapped trust errors must not be retried away through other RPCs'); }
  finally { globalThis.fetch = realFetch; }
}
console.log('PASS wrong-chain RPC stops without failover');

// A changed implementation/admin must not reuse the session's verified identities; a failed final guard cannot seed trust.
for (const [slot, pattern] of [[IMPLEMENTATION_SLOT, /implementation slot/], [ADMIN_SLOT, /admin slot/]]) {
  const t = fake(), cache = new Map(), sdk = fixtureSdk(t.client, { verificationCache: cache });
  await sdk.networkStatus(); assert.equal(cache.size, 1);
  const read = t.client.getStorageAt; t.client.getStorageAt = req => req.slot === slot ? Promise.resolve(`0x${'0'.repeat(63)}1`) : read(req);
  await assert.rejects(fixtureSdk(t.client, { verificationCache: cache }).networkStatus(), pattern);
}
{
  const uncommitted = new Map(), t = fake();
  const reorgSdk = fixtureSdk(t.client, { verificationCache: uncommitted, rpcContext: { client: t.client, snapshot: async () => snapshot, check: async () => { throw new Error('Final hash mismatch'); } } });
  await assert.rejects(reorgSdk.networkStatus(), /Final hash mismatch/);
  assert.equal(uncommitted.size, 0, 'failed final snapshot guard cannot populate the verification cache');
}
console.log('PASS cache integrity: proxy implementation/admin slot changes and final-guard failures do not reuse/seed trust');
