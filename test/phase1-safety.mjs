import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { keccak256 } from 'viem';
import { DEPLOYMENT, CORE_CONFIGURATION } from '../sdk/record.js';
import { createSqueekchain, requireBurn } from '../sdk/squeekchain.js';
import { createSqueek9 } from '../sdk/v9.js';
import { createSnapshotGuard, RpcTrustError, requireSepolia, PUBLIC_RPCS } from '../sdk/rpc.js';
import { verifyGraphAt, IMPLEMENTATION_SLOT } from '../sdk/verify.js';
import { DEFAULT_PROFILE, PROFILES } from '../sdk/deployments.js';
import { TOOL_SPECS } from '../sdk/tools.js';
import { parseSqueekMetadata } from '../sdk/metadata.js';

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
    estimateGas: tracked('estimateGas', () => 100000n),
    getContractEvents: tracked('getContractEvents', request => {
      assert.equal(request.toBlock, blockNumber);
      return [1n, 2n].map(tokenId => ({ args: { tokenId, to: owner } }));
    }),
  };
  client.getCode = tracked('getCode', ({ address }) => {
    const name = Object.entries(DEPLOYMENT.implementations).find(([, value]) => same(value, address))?.[0];
    return codes[name] ?? '0x6000';
  });
  client.multicall = tracked('multicall', async ({ contracts, blockNumber: at }) => Promise.all(contracts.map(async contract => {
    try { return { status: 'success', result: await client.readContract({ ...contract, blockNumber: at }) }; }
    catch (error) { return { status: 'failure', error }; }
  })));
  return client;
}

assert.equal(DEFAULT_PROFILE, 'sepolia-v6');
assert.equal(PROFILES['sepolia-v6'].kind, 'supported');
assert.equal(PROFILES.sepolia.kind, 'read-only (unverified)');
for (const action of ['claim', 'merge', 'checkpoint', 'transfer', 'deposit']) assert.equal(PROFILES.sepolia.capabilities[action], false);
const v9 = createSqueek9();
for (const name of ['buildTransfer', 'buildCheckpoint', 'buildMerge', 'claimPreview', 'mergePreview']) assert.equal(v9[name], undefined);
assert.ok(PUBLIC_RPCS.length >= 3);
assert.throws(() => requireSepolia(1), /Sepolia/);
requireSepolia('0xaa36a7');
assert.throws(() => createSqueekchain({ skipVerification: true }), /cannot be disabled/);
assert.throws(() => createSqueekchain({ addresses: { mining: other } }), /published deployment/);
for (const confirm of [undefined, '', '2', 'burn-2', 'BURN-1']) assert.throws(() => requireBurn('2', confirm), /BURN-2/);
requireBurn('2', 'BURN-2');
assert.throws(() => createSqueekchain().mergePreview(owner, '1', '2'), /BURN-2/);
assert.ok(TOOL_SPECS.find(tool => tool.name === 'squeek_merge_preview').inputSchema.required.includes('confirm'));
console.log('PASS gates: supported default v6; all v9 transaction paths absent; BURN guard before network/calldata; no verification bypass');

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
await assert.rejects(sdk.mergePreview(owner, '1', '1', { confirm: 'BURN-1' }), /distinct/);
assert.equal((await sdk.checkpointPreview(owner)).ok, true);
assert.equal((await sdk.walletStatus(owner)).totals.count, 2);
assert.match((await sdk.art('1')).artworkIntegrity, /Unknown/);
const many = await sdk.claimPreview(owner, Array.from({ length: 33 }, (_, i) => String(i + 1)));
assert.deepEqual(many.batches.map(batch => batch.tokenIds.length), [32, 1]);
assert.ok(checks >= 5);
const failedSimulation = fakeClient({ alter: (request, value) => { if (request.name === 'simulateContract') throw new Error('Fixture revert'); return value; } });
const failedSdk = createFixtureSdk({ rpcContext: { client: failedSimulation, snapshot: async () => snapshot, check: async () => {} } });
await assert.rejects(failedSdk.claimPreview(owner, ['1']), /Fixture revert/);
assert.ok(!failedSimulation.requests.some(request => request.name === 'estimateGas'));
const finalMismatch = createFixtureSdk({ rpcContext: { client: fakeClient(), snapshot: async () => snapshot, check: async () => { throw new RpcTrustError('Reorg mismatch'); } } });
await assert.rejects(finalMismatch.claimPreview(owner, ['1']), /Reorg mismatch/);
console.log('PASS SDK: pinned read/storage/code/multicall/simulation/gas/balance, sorted batches, actual payout, ownership, merge, checkpoint, art, reverts and final hash guard');

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
