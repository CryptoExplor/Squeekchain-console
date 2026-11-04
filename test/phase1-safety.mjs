import assert from 'node:assert/strict';
import fs from 'node:fs';
const requestBudgets=JSON.parse(fs.readFileSync(new URL('./budgets.json',import.meta.url)));
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { encodeFunctionResult, decodeFunctionData, multicall3Abi, encodeEventTopics, parseAbi, toHex, keccak256 } from 'viem';
import { DEPLOYMENT, CORE_CONFIGURATION } from '../sdk/record.js';
import { createSqueekchain, requireBurn } from '../sdk/squeekchain.js';
import { createSqueek9 } from '../sdk/v9.js';
import { createRpcContext, chainCheckedRequest, createSnapshotGuard, RpcTrustError, requireSepolia, PUBLIC_RPCS } from '../sdk/rpc.js';
import { coreAbi, miningAbi, nftAbi, tokenAbi } from '../sdk/abi.js';
import { verifyGraphAt, IMPLEMENTATION_SLOT } from '../sdk/verify.js';
import { DEFAULT_PROFILE, PROFILES } from '../sdk/deployments.js';
import { TOOL_SPECS } from '../sdk/tools.js';
import { parseSqueekMetadata } from '../sdk/metadata.js';

function assertGasFree(value){if(value&&typeof value==='object')for(const[key,item]of Object.entries(value)){assert.ok(!['gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas'].includes(key),'Gas field in preview: '+key);assertGasFree(item);}}

const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const other = '0x0000000000000000000000000000000000000001';
const hash = `0x${'ab'.repeat(32)}`, wrongHash = `0x${'cd'.repeat(32)}`;
const blockNumber = 11902300n;
const snapshot = { blockNumber, blockHash: hash };
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? String(item) : item);
const codes = { core: '0x6001', mining: '0x6002' };
// Synthetic runtimes for offline positive-path tests only. Production pins are not overridden.
const fixtureRecord = { ...DEPLOYMENT, runtimeHashes: { core: keccak256(codes.core), mining: keccak256(codes.mining) } };
const policy = { nft: DEPLOYMENT.nft, maximumLevel: 10, maxSupply: 9999,
  levels: [1000, 3000, 7000, 15000, 31000, 63000, 127000, 255000, 511000, 1023000].map((weight, i) => ({ weight: BigInt(weight), cooldownBlocks: BigInt(i === 9 ? 0 : (i + 1) * 2) })) };
const miningConfig = { core: DEPLOYMENT.core, token: DEPLOYMENT.token, genesisCollection: DEPLOYMENT.nft, governance: DEPLOYMENT.timelock, ...CORE_CONFIGURATION, genesisMaximumLevel: 10, minimumTimelockDelay: 60 };

function fakeClient({ alter = (_request, value) => value } = {}) {
  const requests = [];
  const tracked = (name, handler) => async request => {
    requests.push({ name, ...request });
    if (['readContract', 'getCode', 'getStorageAt', 'multicall', 'getBalance', 'simulateContract', 'estimateGas'].includes(name)) assert.equal(request.blockNumber, blockNumber, `${name} must pin the snapshot`);
    return alter({ name, ...request }, await handler(request));
  };
  const client = {
    requests,
    getChainId: async () => 11155111,
    getBlockNumber: async () => blockNumber + 12n,
    getBlock: async ({ blockNumber: at }) => ({ number: at, hash }),
    getStorageAt: tracked('getStorageAt', ({ address, slot }) => {
      const name = same(address, DEPLOYMENT.core) ? 'core' : 'mining';
      return `0x${'0'.repeat(24)}${(slot === IMPLEMENTATION_SLOT ? DEPLOYMENT.implementations[name] : DEPLOYMENT.proxyAdmins[name]).slice(2)}`;
    }),
    getBalance: tracked('getBalance', () => 1000000000000000000n),
    readContract: tracked('readContract', ({ address, functionName: fn, args = [] }) => {
      const name = same(address, DEPLOYMENT.core) ? 'core' : 'mining';
      if (fn === 'implementationCodeAddress') return DEPLOYMENT.implementations[name];
      if (fn === 'implementationCodeVersion') return DEPLOYMENT.versions[name];
      if (fn === 'implementationStorageLayoutDigest') return DEPLOYMENT.layoutDigests[name];
      if (fn === 'proxyAdmin') return DEPLOYMENT.proxyAdmins[name];
      if (fn === 'owner' || fn === 'governance') return DEPLOYMENT.timelock;
      if (fn === 'guardian') return CORE_CONFIGURATION.guardian;
      if (fn === 'core' || fn === 'sqkCore') return DEPLOYMENT.core;
      if (fn === 'mining') return DEPLOYMENT.mining;
      if (fn === 'renderer' || fn === 'art') return DEPLOYMENT[fn];
      if (fn === 'collectionPolicy') return structuredClone(policy);
      if (fn === 'configuration') return same(address, DEPLOYMENT.core) ? { ...CORE_CONFIGURATION } : { ...miningConfig };
      if (fn === 'ownerOf') return BigInt(args[0]) === 777n ? other : owner;
      if (fn === 'totalSupply') return 9972n;
      if(fn==='getEthBalance')return 10n**18n;
 if (fn === 'balanceOf') return same(address, DEPLOYMENT.nft) ? 2n : 10n ** 18n;
      if (fn === 'claimable') return 2n * 10n ** 18n;
      if (fn === 'checkpointStatus') return [false, 5n, true];
      if (fn === 'REWARD_PER_BLOCK') return 10n ** 18n;
      if (fn === 'SUPPLY_CAP') return 1000000n * 10n ** 18n;
      if (fn === 'accounting') return { miningBalance: 100n };
      if (fn === 'position') return { level: 1, activeWeight: 1000n, pendingWeight: 0n, pendingRound: 0n, nextMergeBlock: 5n };
      if (fn === 'state') return same(address, DEPLOYMENT.core)
        ? { settledThroughRound: 5n, blockHeight: 20n, cumulativeBlockUnits: 20000000000n, blockProgress: 0n, paused: false }
        : { processedThroughRound: 4n, totalWeight: 2000n, rewardIndex: 1n, minted: 100n, paid: 0n, weightActivationCount: 0n, weightActivationCursor: 0n };
      if (fn === 'tokenURI') return `data:application/json;base64,${Buffer.from(JSON.stringify({ name: 'Fixture', image: 'data:image/svg+xml;base64,PHN2Zy8+', attributes: [] })).toString('base64')}`;
      throw new Error(`Unmocked ${fn}`);
    }),
    simulateContract: tracked('simulateContract', () => ({ result: 10n ** 18n })),
    estimateGas: tracked('estimateGas', () => {throw new Error('Gas estimation is forbidden');}),
    getContractEvents: tracked('getContractEvents', request => {
      assert.equal(request.toBlock, blockNumber);
      return request.args.from ? [] : [1n, 2n].map((tokenId, logIndex) => ({ blockNumber, logIndex, args: { tokenId, from: other, to: owner } }));
    }),
  };
  client.getCode = tracked('getCode', ({ address }) => {
    const name = Object.entries(DEPLOYMENT.implementations).find(([, value]) => same(value, address))?.[0];
    return codes[name] ?? '0x6000';
  });
  client.multicall = tracked('multicall', async ({ contracts, blockNumber: at, allowFailure }) => Promise.all(contracts.map(async contract => {
    try { const result = await client.readContract({ ...contract, blockNumber: at }); return allowFailure === false ? result : { status: 'success', result }; }
    catch (error) { if (allowFailure === false) throw error; return { status: 'failure', error }; }
  })));
  return client;
}

assert.equal(DEFAULT_PROFILE, 'sepolia-v9');
assert.equal(PROFILES['sepolia-v6'].label, 'Sepolia v6');
assert.equal(PROFILES['sepolia-v9'].label, 'Sepolia v9');
for (const action of ['claim','merge','checkpoint','deposit','withdraw','stake','unstake']) assert.equal(PROFILES['sepolia-v9'].capabilities[action],true);
const v9 = createSqueek9();
for (const name of ['claimPreview','mergePreview','actionPreview']) assert.equal(typeof v9[name],'function');
assert.throws(()=>v9.mergePreview(owner,'1','2'),/BURN-2/);
assert.ok(PUBLIC_RPCS.length >= 3);
assert.throws(() => requireSepolia(1), /Sepolia/);
requireSepolia('0xaa36a7');
assert.throws(() => createSqueekchain({ skipVerification: true }), /cannot be disabled/);
assert.throws(() => createSqueekchain({ addresses: { mining: other } }), /published deployment/);
for (const confirm of [undefined, '', '2', 'burn-2', 'BURN-1']) assert.throws(() => requireBurn('2', confirm), /BURN-2/);
requireBurn('2', 'BURN-2');
assert.throws(() => createSqueekchain().mergePreview(owner, '1', '2'), /BURN-2/);
assert.ok(TOOL_SPECS.find(tool => tool.name === 'squeek_merge_preview').inputSchema.required.includes('confirm'));
console.log('PASS gates: equal deployed profiles; v9 guarded action surface present; BURN guard before network/calldata; no verification bypass');

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

const verified = await verifyGraphAt(fakeClient(), snapshot, fixtureRecord);
assert.equal(verified.ok, true);
for (const [label, mutate] of [
  ['runtime hash', (r, value) => r.name === 'getCode' && same(r.address, DEPLOYMENT.implementations.core) ? '0x6003' : value],
  ['layout', (r, value) => r.functionName === 'implementationStorageLayoutDigest' ? wrongHash : value],
  ['version', (r, value) => r.functionName === 'implementationCodeVersion' ? 99 : value],
  ['reported implementation', (r, value) => r.functionName === 'implementationCodeAddress' ? other : value],
  ['implementation slot', (r, value) => r.slot === IMPLEMENTATION_SLOT ? `0x${'0'.repeat(63)}1` : value],
  ['admin owner', (r, value) => r.functionName === 'owner' ? other : value],
  ['reported admin', (r, value) => r.functionName === 'proxyAdmin' ? other : value],
  ['wiring', (r, value) => r.functionName === 'sqkCore' ? other : value],
  ['configuration', (r, value) => r.functionName === 'configuration' ? { ...value, streamId: wrongHash } : value],
  ['policy', (r, value) => r.functionName === 'collectionPolicy' ? { ...value, maximumLevel: 9 } : value],
]) {
  await assert.rejects(verifyGraphAt(fakeClient({ alter: mutate }), snapshot, fixtureRecord), RpcTrustError, label);
}
await assert.rejects(verifyGraphAt({ getChainId: async () => 1 }, snapshot, fixtureRecord), /chainId/);
console.log('PASS same-block verification: identity/runtime/layout/version/admin/configuration/policy/wiring mismatches stop');

// Bundle the unchanged production SDK with a TEST-ONLY deployment-record fixture.
// This exercises complete success paths without teaching production code to accept overrides or fake hashes.
const bundled = await build({ entryPoints: ['sdk/squeekchain.js'], bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'synthetic-test-record', setup(builder) {
  builder.onLoad({ filter: /sdk\/record\.js$/ }, () => ({ contents: `export const DEPLOYMENT = {...${stringify(fixtureRecord)}, nftStartBlock: 11902282n}; export const CORE_CONFIGURATION = ${stringify(CORE_CONFIGURATION)};`, loader: 'js' }));
} }] });
// Keep relative bare-module resolution rooted in the repository; scratch file is ignored.
fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync('.cache/sdk-safety-fixture.mjs', bundled.outputFiles[0].text);
const { createSqueekchain: createFixtureSdk } = await import('../.cache/sdk-safety-fixture.mjs');
const client = fakeClient();
let checks = 0;
const sdk = createFixtureSdk({ rpcContext: { client, snapshot: async () => snapshot, check: async () => { checks++; } } });
assert.equal(sdk.buildMerge, undefined, 'no unchecked public builders');
const claim = await sdk.claimPreview(owner, ['2', '1', '2']);
assert.deepEqual(claim.batches[0].tokenIds, ['1', '2']);
assert.equal(claim.total.base, String(10n ** 18n), 'amount is simulated payout, not claimable estimate');
assert.equal(claim.batches[0].estimate.base, String(2n * 10n ** 18n));
await assert.rejects(sdk.claimPreview(owner, ['777']), /does not own/);
assert.equal((await sdk.mergePreview(owner, '1', '2', { confirm: 'BURN-2' })).ok, true);
assert.equal(client.requests.find(r=>r.name==='simulateContract'&&r.functionName==='merge')?.account?.toLowerCase(),owner.toLowerCase(),'merge simulation uses the owner as sender');
await assert.rejects(sdk.mergePreview(owner, '1', '1', { confirm: 'BURN-1' }), /distinct/);
assert.equal((await sdk.checkpointPreview(owner)).ok, true);
assert.equal((await sdk.walletStatus(owner)).totals.count, 2);const detail=await sdk.squeekStatus('1');assert.equal(detail.token.tokenId,'1');assert.equal(detail.owner.toLowerCase(),owner.toLowerCase());assert.ok(detail.token.claimable.base!=null);
assert.match((await sdk.art('1')).artworkIntegrity, /Unknown/);
const many = await sdk.claimPreview(owner, Array.from({ length: 33 }, (_, i) => String(i + 1)));
assert.deepEqual(many.batches.map(batch => batch.tokenIds.length), [32, 1]);
assert.ok(checks >= 5);assertGasFree(claim);assertGasFree(many);assert.equal(client.requests.some(r=>r.name==='estimateGas'),false);assert.equal(client.requests.filter(r=>r.name==='simulateContract').length,5);
const failedSimulation = fakeClient({ alter: (request, value) => { if (request.name === 'simulateContract') throw new Error('Fixture revert'); return value; } });
const failedSdk = createFixtureSdk({ rpcContext: { client: failedSimulation, snapshot: async () => snapshot, check: async () => {} } });
await assert.rejects(failedSdk.claimPreview(owner, ['1']), /Fixture revert/);
assert.ok(!failedSimulation.requests.some(request => request.name === 'estimateGas'));
const finalMismatch = createFixtureSdk({ rpcContext: { client: fakeClient(), snapshot: async () => snapshot, check: async () => { throw new RpcTrustError('Reorg mismatch'); } } });
await assert.rejects(finalMismatch.claimPreview(owner, ['1']), /Reorg mismatch/);
console.log('PASS SDK: pinned read/storage/code/multicall/simulation/balance (no gas estimation), sorted batches, actual payout, ownership, merge, checkpoint, art, reverts and final hash guard');

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

// Count actual JSON-RPC requests through the real viem transport, NOT mock method calls.
// The wire fixture uses the same synthetic pinned runtimes as the positive SDK tests.
const realFetch = globalThis.fetch;
const wire = [], wireClient = fakeClient();
const adminAbi = parseAbi(['function owner() view returns (address)']);
const abiFor = address => same(address, DEPLOYMENT.core) ? coreAbi : same(address, DEPLOYMENT.mining) ? miningAbi : same(address, DEPLOYMENT.nft) ? nftAbi : same(address, DEPLOYMENT.token) ? tokenAbi : adminAbi;
function fill(parameter, value) {
  if (parameter.type.endsWith('[]')) return (value ?? []).map(item => fill({ ...parameter, type: parameter.type.slice(0, -2) }, item));
  if (parameter.type === 'tuple') return Object.fromEntries(parameter.components.map(component => [component.name, fill(component, value?.[component.name])]));
  if (value != null) return value;
  if (parameter.type === 'bool') return false;
  if (parameter.type === 'address') return other;
  if (parameter.type.startsWith('bytes')) return parameter.type === 'bytes' ? '0x' : `0x${'00'.repeat(Number(parameter.type.slice(5)))}`;
  return 0n;
}
async function callWire(address, data, at, from) {
  if (same(address, '0xca11bde05977b3631167028862be2a173976ca11')) {
    const decoded = decodeFunctionData({ abi: multicall3Abi, data });
    if (decoded.functionName === 'getEthBalance') return encodeFunctionResult({ abi: multicall3Abi, functionName: 'getEthBalance', result: 10n ** 18n });
    const [calls] = decoded.args;
    const results = await Promise.all(calls.map(async call => {
      try { return { success: true, returnData: await callWire(call.target, call.callData, at) }; }
      catch (error) { if (!call.allowFailure) throw error; return { success: false, returnData: '0x' }; }
    }));
    return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: results });
  }
  const abi = abiFor(address);
  const { functionName, args = [] } = decodeFunctionData({ abi, data });
  const mutable=abi.find(item=>item.type==='function'&&item.name===functionName).stateMutability;
  if(functionName==='merge')assert.equal(from?.toLowerCase(),owner.toLowerCase(),'wire merge eth_call carries the owner sender');
  const result = ['nonpayable','payable'].includes(mutable)?(await wireClient.simulateContract({address,abi,functionName,args,blockNumber:at,account:from})).result:await wireClient.readContract({ address, abi, functionName, args, blockNumber: at });
  const outputs = abi.find(item => item.type === 'function' && item.name === functionName).outputs;
  const values = outputs.map((output, index) => fill(output, outputs.length === 1 ? result : result[index]));
  return encodeFunctionResult({ abi, functionName, result: outputs.length === 1 ? values[0] : values });
}
globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(init.body); wire.push(request);
  const respond=async request=>{
  const { method, params = [] } = request;
  let result;
  if (method === 'eth_chainId') result = '0xaa36a7';
  else if (method === 'eth_blockNumber') result = toHex(blockNumber + 12n);
  else if (method === 'eth_getBlockByNumber') result = { hash, number: params[0], transactions: [], timestamp: '0x1' };
  else if (method === 'eth_getStorageAt') result = await wireClient.getStorageAt({ address: params[0], slot: params[1], blockNumber: BigInt(params[2]) });
  else if (method === 'eth_getCode') result = await wireClient.getCode({ address: params[0], blockNumber: BigInt(params[1]) });
  else if (method === 'eth_getBalance') result = toHex(10n ** 18n);
  else if(method==='eth_estimateGas')throw new Error('Unexpected eth_estimateGas');
  else if (method === 'eth_call') {assert.equal(params[1],toHex(blockNumber));result = await callWire(params[0].to, params[0].data, BigInt(params[1]), params[0].from);}
  else if (method === 'eth_getLogs') {
    result = params[0].topics[2] ? [1n, 2n].map((id, index) => ({
      address: DEPLOYMENT.nft, blockNumber: toHex(blockNumber), blockHash: hash,
      transactionHash: hash, transactionIndex: '0x0', logIndex: toHex(index), removed: false, data: '0x',
      topics: encodeEventTopics({ abi: nftAbi, eventName: 'Transfer', args: { from: other, to: owner, tokenId: id } }),
    })) : [];
  } else throw new Error(`Unmocked wire RPC ${method}`);
  return {jsonrpc:'2.0',id:request.id,result};};
  return new Response(JSON.stringify(Array.isArray(request)?await Promise.all(request.map(respond)):await respond(request)), { headers: { 'content-type': 'application/json' } });
};
try {
  const context = createRpcContext();
  const wireSdk = createFixtureSdk({ rpcContext: context });
  const network = await wireSdk.networkStatus();
  assert.equal(network.nft.totalSupply,'9972','v6 supply comes from same-block NFT totalSupply');
  assert.equal(network.snapshot.timestamp,'1');
  assert.equal(network.core.roundDuration,String(CORE_CONFIGURATION.roundDuration));
  const cold = wire.length;
  wire.length = 0;
  const warm = await wireSdk.networkStatus();
  assert.equal(warm.verification.cacheHit, true);
  assert.ok(wire.length <= requestBudgets.v6.limit, `Warm v6 page load exceeded RPC budget: ${wire.length}`);
  assert.equal(wire.flatMap(request=>Array.isArray(request)?request:[request]).filter(request => request.method === 'eth_getStorageAt').length, 8);
  assert.equal(wire.flatMap(request=>Array.isArray(request)?request:[request]).filter(request => request.method === 'eth_getCode').length, 0);
  assert.equal(wire.flatMap(request=>Array.isArray(request)?request:[request]).filter(request => request.method === 'eth_chainId').length, 0);
  const warmCount = wire.length;
  wire.length = 0;
  const batch = await wireSdk.artBatch(['1', '2', '3']);
  assert.equal(batch.length, 3);
  assert.equal(wire.filter(request => request.method === 'eth_call').length, 1, 'all art in one multicall/snapshot');
  wire.length = 0;
  await wireSdk.walletStatus(owner);
  assert.ok(wire.length <= requestBudgets.v6.limit, `Warm wallet page load exceeded RPC budget: ${wire.length}`);
  assert.ok(cold<=requestBudgets.v6.coldNetwork);assert.ok(warmCount<=requestBudgets.v6.warmNetwork);assert.ok(wire.length<=requestBudgets.v6.wallet);
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/v6-request-budget.json',JSON.stringify({profile:'sepolia-v6',coldNetwork:cold,warmNetwork:warmCount,wallet:wire.length,limit:25},null,2)+'\n');
  console.log(`PASS actual wire budget: cold network ${cold}; warm network ${warmCount}; wallet ${wire.length} requests; art batch one eth_call`);
  // Feature-isolated SDK fallback: cold detail + art; warm detail reuses cached art.
  const pageSdk=createFixtureSdk({rpcContext:createRpcContext()});wire.length=0;await pageSdk.squeekStatus('1');await pageSdk.art('1');const pageCold=wire.length;wire.length=0;await pageSdk.squeekStatus('1');const pageWarm=wire.length;assert.ok(pageWarm<=requestBudgets.v6.limit);assert.ok(pageCold<=requestBudgets.v6SqueekPage.cold);assert.ok(pageWarm<=requestBudgets.v6SqueekPage.warm);fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/v6-squeek-page-budget.json',JSON.stringify({profile:'sepolia-v6',scope:'Synthetic actual-HTTP SDK detail+art cold; detail-only with cached art warm. Excludes app shell.',cold:pageCold,warm:pageWarm},null,2)+'\n');console.log(`PASS v6 Squeek page SDK HTTP: cold ${pageCold}, warm ${pageWarm}`);
  const actions=[['checkpoint',()=>wireSdk.checkpointPreview(owner)],['claim-32',()=>wireSdk.claimPreview(owner,Array.from({length:32},(_,i)=>String(i+1)))],['claim-33',()=>wireSdk.claimPreview(owner,Array.from({length:33},(_,i)=>String(i+1)))],['merge',()=>wireSdk.mergePreview(owner,'1','2',{confirm:'BURN-2'})]],actionCounts=[];
  for(const[action,preview]of actions){wire.length=0;const simulationsBefore=wireClient.requests.filter(r=>r.name==='simulateContract').length;const result=await preview();assert.equal(result.ok,true,action);assertGasFree(result);assert.equal(wireClient.requests.filter(r=>r.name==='simulateContract').length-simulationsBefore,result.batches?.length??1,action+' keeps snapshot simulation');const requests=wire.flat();assert.equal(requests.some(r=>r.method==='eth_estimateGas'),false);assert.equal(result.batches?.length??1,action==='claim-33'?2:1);actionCounts.push({action,httpRequests:wire.length,estimateGasRequests:requests.filter(r=>r.method==='eth_estimateGas').length,simulations:result.batches?.length??1});}
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/gas-cleanup-v6-requests.json',JSON.stringify(actionCounts,null,2)+'\n');console.log('PASS v6 action previews: every snapshot simulation retained; no eth_estimateGas or gas fields');
  const wireFetch = globalThis.fetch, contacted = [];
  globalThis.fetch = async (url, init) => {
    contacted.push(url);
    const request = JSON.parse(init.body);
    if (request.method === 'eth_chainId') return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x1' }), { headers: { 'content-type': 'application/json' } });
    return wireFetch(url, init);
  };
  await assert.rejects(createRpcContext().snapshot(), /chainId|Sepolia/);
  assert.equal(new Set(contacted).size, 1, 'wrapped trust errors must not be retried away through other RPCs');
  globalThis.fetch = wireFetch;

} finally { globalThis.fetch = realFetch; }

// A changed implementation/admin must not reuse the session's verified identities.
const cacheClient = fakeClient();
let slotChanged = false;
const getSlot = cacheClient.getStorageAt;
cacheClient.getStorageAt = request => slotChanged && request.slot === IMPLEMENTATION_SLOT ? Promise.resolve(`0x${'0'.repeat(63)}1`) : getSlot(request);
const cachedSdk = createFixtureSdk({ rpcContext: { client: cacheClient, snapshot: async () => snapshot, check: async () => {} } });
await cachedSdk.networkStatus();
slotChanged = true;
await assert.rejects(cachedSdk.networkStatus(), /implementation/);
console.log('PASS graph cache: proxy slot changes fail closed instead of trusting cached verification');

const adminClient = fakeClient();
let adminChanged = false;
const adminSlotRead = adminClient.getStorageAt;
adminClient.getStorageAt = request => adminChanged && request.slot !== IMPLEMENTATION_SLOT ? Promise.resolve(`0x${'0'.repeat(63)}1`) : adminSlotRead(request);
const adminSdk = createFixtureSdk({ rpcContext: { client: adminClient, snapshot: async () => snapshot, check: async () => {} } });
await adminSdk.networkStatus(); adminChanged = true;
await assert.rejects(adminSdk.networkStatus(), /proxy admin/);
const uncommitted = new Map();
const reorgSdk = createFixtureSdk({ verificationCache: uncommitted, rpcContext: { client: fakeClient(), snapshot: async () => snapshot, check: async () => { throw new Error('Final hash mismatch'); } } });
await assert.rejects(reorgSdk.networkStatus(), /Final hash mismatch/);
assert.equal(uncommitted.size, 0, 'failed final snapshot guard cannot populate the verification cache');
console.log('PASS cache integrity: proxy admin changes and final-guard failures do not reuse/seed trust');
