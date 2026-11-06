import assert from 'node:assert/strict';
import { createAccountTokenSource } from '../sdk/account-discovery.js';
import { createDiscoveryStore, discoverOwnedIds } from '../sdk/discovery.js';
import { RpcTrustError } from '../sdk/rpc.js';
import { retryAfterMs } from '../sdk/retry-after.js';
import { nftAbi } from '../sdk/abi-core-20261103.js';

const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const other = '0x0000000000000000000000000000000000000001';
const nft = '0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6';
const hash = `0x${'ab'.repeat(32)}`;
const page = (tokens = [{ tokenId: '1', custody: 'wallet' }, { tokenId: '2', custody: 'wallet' }], nextCursor = null) => ({
  schemaVersion: 2, status: 'available', account: owner.toLowerCase(),
  chain: { target: 'sepolia', chainId: '11155111', safeThroughBlock: '10', safeBlockHash: hash },
  identities: { genesis: nft.toLowerCase(), mining: { proxy: other } },
  release: { id: 'api-release-is-not-a-deployment-pin' }, tokens, nextCursor,
  // Deliberately bogus fields: none may supply rewards, levels, addresses or calldata.
  rewards: { claimableBaseUnits: '99999999999999999999' }, tx: { to: other, data: '0xdead' },
});
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const requested = [], checks = [], store = createDiscoveryStore(null);
let sourceCalls = 0, badOwner = false, logsFail = true;
const client = {
  readContract: async request => { checks.push(request); assert.equal(request.functionName, 'balanceOf'); assert.equal(request.blockNumber, 10n); return 2n; },
  getContractEvents: async query => {
    if (logsFail) throw new Error('fetch failed');
    return query.args.to ? [1n, 2n].map((tokenId, index) => ({ blockNumber: 2n, logIndex: index, args: { tokenId, from: other, to: owner } })) : [];
  },
  getBlock: async ({ blockNumber }) => ({ number: blockNumber, hash }),
  multicall: async request => {
    checks.push(request); assert.equal(request.blockNumber, 10n); assert.equal(request.allowFailure, false);
    assert.deepEqual(request.contracts.map(contract => contract.functionName), ['ownerOf', 'ownerOf']);
    assert.ok(request.contracts.every(contract => contract.address === nft));
    return request.contracts.map(() => badOwner ? other : owner);
  },
};
const source = createAccountTokenSource({ fetcher: async (url, options) => {
  sourceCalls++; requested.push({ url, options });
  return response(new URL(url).searchParams.has('cursor')
    ? page([{ tokenId: '2', custody: 'wallet' }, { tokenId: '3', custody: 'staking' }])
    : page([{ tokenId: '1', custody: 'wallet' }, { tokenId: '1', custody: 'wallet' }], 'page_2'));
} });
const args = { client, snapshot: { blockNumber: 10n, blockHash: hash }, nft, abi: nftAbi, owner, startBlock: 1n, namespace: 'api-fallback', store };
assert.deepEqual(await discoverOwnedIds({ ...args, accountSource: source }), [1n, 2n]);
assert.equal(sourceCalls, 2);
assert.equal(checks.filter(check => check.functionName === 'balanceOf').length, 1);
assert.equal(checks.filter(check => check.contracts).length, 1);
assert.equal(new URL(requested[0].url).pathname, `/v1/accounts/${owner.toLowerCase()}`);
assert.equal(new URL(requested[0].url).searchParams.get('limit'), '100');
assert.equal(new URL(requested[1].url).searchParams.get('cursor'), 'page_2');
assert.equal(requested[0].options.cache, 'no-store');
assert.equal(requested[0].options.credentials, 'omit');
const key = `11155111:api-fallback:${nft}:${owner}`.toLowerCase();
assert.deepEqual((await store.get(key)).ids, ['1', '2']);
assert.equal((await store.get(key)).lastScannedBlock, '10', 'checkpoint is the validated RPC snapshot, not API metadata');
await discoverOwnedIds({ ...args, accountSource: source });
assert.equal(sourceCalls, 2, 'same-block validated cache does not call logs or API again');
assert.equal(checks.filter(check => check.contracts).length, 2, 'cached IDs are still owner-confirmed');

// Bad/missing/extra IDs and unavailable API must not become an empty/owned set.
for (const candidates of [[], [1n], [1n, 2n, 3n], [1n, 2n]]) {
  const isolated = createDiscoveryStore(null);
  badOwner = candidates.length === 2;
  await assert.rejects(discoverOwnedIds({ ...args, store: isolated, accountSource: async () => candidates }), /fetch failed/);
  assert.equal(await isolated.get(key), undefined);
}
badOwner = false;
await assert.rejects(discoverOwnedIds({ ...args, store: createDiscoveryStore(null), accountSource: async () => { throw new Error('API unavailable'); } }), /fetch failed/);
let hints = 0;
logsFail = false;
assert.deepEqual(await discoverOwnedIds({ ...args, store: createDiscoveryStore(null), accountSource: async () => { hints++; return []; } }), [1n, 2n]);
assert.equal(hints, 0, 'healthy logs remain primary');
const trustClient = { ...client, getContractEvents: async () => { throw new RpcTrustError('snapshot block hash mismatch'); } };
await assert.rejects(discoverOwnedIds({ ...args, client: trustClient, store: createDiscoveryStore(null), accountSource: async () => { hints++; return [1n, 2n]; } }), /hash mismatch/);
assert.equal(hints, 0, 'API must not bypass trust failures');
const cancelled = new AbortController(), cancelledStore = createDiscoveryStore(null);
let ownersAfterAbort = 0;
await assert.rejects(discoverOwnedIds({ ...args, store: cancelledStore, signal: cancelled.signal,
  client: { ...client, getContractEvents: async () => { throw new Error('fetch failed'); }, multicall: async () => { ownersAfterAbort++; return [owner, owner]; } },
  accountSource: async () => { cancelled.abort(); return [1n, 2n]; },
}), { name: 'AbortError' });
assert.equal(ownersAfterAbort, 0, 'late API hints cannot start owner reads after abort');
assert.equal(await cancelledStore.get(key), undefined, 'late API hints cannot persist after abort');
console.log('PASS account hints: pagination/wallet-only/dedup, snapshot balance+owner confirmation, cache reuse, missing/extra/wrong owner rejection and no API trust bypass');

for (const mutate of [
  data => { data.status = 'unavailable'; },
  data => { data.schemaVersion = 1; },
  data => { data.account = other; },
  data => { data.identities.genesis = other; },
  data => { data.chain.chainId = '1'; },
  data => { data.tokens[0].tokenId = '-1'; },
  data => { data.tokens[0].custody = 'unknown'; },
  data => { delete data.nextCursor; },
]) {
  const invalid = page(); mutate(invalid);
  await assert.rejects(createAccountTokenSource({ fetcher: async () => response(invalid) })({ owner, nft }), /Invalid|unavailable|unsupported/);
}
let pages = 0;
await assert.rejects(createAccountTokenSource({ fetcher: async () => {
  const data = page(undefined, pages++ ? null : 'next');
  if (pages > 1) data.chain.safeThroughBlock = '11';
  return response(data);
} })({ owner, nft }), /pages changed/);
await assert.rejects(createAccountTokenSource({ fetcher: async () => response(page(undefined, 'repeated')) })({ owner, nft }), /cursor repeated/);

// Invalidated cursors restart once with a clean ID set, never merge old/new pages.
let sequence = 0;
const restarted = createAccountTokenSource({ fetcher: async () => {
  sequence++;
  if (sequence === 1) return response(page([{ tokenId: '999', custody: 'wallet' }], 'invalidated'));
  if (sequence === 2) return response({ error: { code: 'cursor_invalidated' } }, 409);
  return response(page());
} });
assert.deepEqual(await restarted({ owner, nft }), [1n, 2n]);
assert.equal(sequence, 3);
const controller = new AbortController();
const aborted = createAccountTokenSource({ fetcher: async () => { controller.abort(); return response(page()); } });
await assert.rejects(aborted({ owner, nft, signal: controller.signal }), { name: 'AbortError' });
console.log('PASS account API schema/context isolation, stable cursor snapshots, bounded reorg restart and abort');

const now = Date.parse('2026-11-03T00:00:00Z');
for (const [header, expected] of [['7', 7_000], [new Date(now + 60_000).toUTCString(), 60_000], [null, 30_000], ['0', 30_000], ['301', 30_000], ['bad', 30_000], [new Date(now - 1_000).toUTCString(), 30_000]]) {
  assert.equal(retryAfterMs(header, now), expected);
}
let clock = now, attempts = 0;
const limited = createAccountTokenSource({ now: () => clock, fetcher: async () => {
  attempts++;
  return attempts === 1 ? response({}, 429, { 'Retry-After': '7' }) : response(page());
} });
await assert.rejects(limited({ owner, nft }), /429/);
await assert.rejects(limited({ owner, nft }), /rate limited/);
assert.equal(attempts, 1);
clock += 7_000;
assert.deepEqual(await limited({ owner, nft }), [1n, 2n]);
console.log('PASS shared Retry-After parsing: seconds/date, positive <=300s or 30s fallback; API cooldown and recovery');
