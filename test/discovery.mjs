import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { createDiscoveryStore, discoverOwnedIds } from '../sdk/discovery.js';
import { nftAbi } from '../sdk/abi.js';
const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const other = '0x0000000000000000000000000000000000000001';
const nft = '0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6';
const hashes = new Map();
const hash = number => hashes.get(number) ?? `0x${number.toString(16).padStart(64, '0')}`;
const logs = [
  [2n, 1n, other, owner], [4n, 2n, other, owner],
  [11n, 2n, owner, other], [12n, 3n, other, owner],
  [13n, 1n, owner, other], [14n, 3n, owner, owner], // self-transfer returned by BOTH topic filters
].map(([blockNumber, tokenId, from, to]) => ({ blockNumber, logIndex: 0, args: { tokenId, from, to } }));
const queries = [], ownerChecks = [];
let badOwner = false;
function idsAt(at) {
  const ids = new Set();
  for (const log of logs.filter(log => log.blockNumber <= at)) {
    if (log.args.to === owner) ids.add(log.args.tokenId); else if (log.args.from === owner) ids.delete(log.args.tokenId);
  }
  return ids;
}
const client = {
  readContract: async ({ functionName, blockNumber }) => { assert.equal(functionName, 'balanceOf'); return BigInt(idsAt(blockNumber).size); },
  getBlock: async ({ blockNumber }) => ({ number: blockNumber, hash: hash(blockNumber) }),
  getContractEvents: async query => {
    queries.push(query);
    assert.ok(query.args.to === owner || query.args.from === owner, 'owner topic filter is mandatory');
    return logs.filter(log => log.blockNumber >= query.fromBlock && log.blockNumber <= query.toBlock
      && (query.args.to ? log.args.to === owner : log.args.from === owner));
  },
  multicall: async ({ contracts, blockNumber, allowFailure }) => {
    assert.equal(allowFailure, false);
    ownerChecks.push({ ids: contracts.map(contract => contract.args[0]), blockNumber });
    return contracts.map(contract => !badOwner && idsAt(blockNumber).has(contract.args[0]) ? owner : other);
  },
};
const store = createDiscoveryStore(indexedDB);
const run = at => discoverOwnedIds({ client, snapshot: { blockNumber: at, blockHash: hash(at) }, nft, abi: nftAbi, owner, startBlock: 1n, namespace: 'test', store });
assert.deepEqual(await run(10n), [1n, 2n]);
assert.equal(queries.length, 2);
assert.deepEqual(queries.map(query => query.fromBlock), [1n, 1n]);
queries.length = 0;
assert.deepEqual(await run(12n), [1n, 3n]);
assert.deepEqual(queries.map(query => query.fromBlock), [11n, 11n], 'only blocks since the saved frontier');
queries.length = 0;
assert.deepEqual(await run(12n), [1n, 3n]);
assert.equal(queries.length, 0, 'same block does not refetch logs');
assert.equal(ownerChecks.at(-1).blockNumber, 12n, 'cache hits still confirm ownerOf');
const key = `11155111:test:${nft}:${owner}`.toLowerCase();
const reopened = createDiscoveryStore(indexedDB);
assert.deepEqual((await reopened.get(key)).ids, ['1', '3'], 'new store instance reads persisted IndexedDB state');
hashes.set(12n, `0x${'ab'.repeat(32)}`);
queries.length = 0;
assert.deepEqual(await run(14n), [3n]);
assert.deepEqual(queries.map(query => query.fromBlock), [1n, 1n], 'reorg checkpoint mismatch triggers filtered replay');
badOwner = true;
await assert.rejects(run(14n), /ownerOf mismatch/);
badOwner = false;
await store.set(key, { version: 1, lastScannedBlock: '14', lastScannedHash: hash(14n), ids: ['1', '3'] });
await assert.rejects(run(14n), /balance mismatch/);
console.log('PASS discovery: IndexedDB persistence, incoming/outgoing topic filters, incremental blocks, reorg replay, self-transfer dedup, balance and owner confirmations');

for (const db of [indexedDB, undefined]) {
  const cache = createDiscoveryStore(db);
  await cache.set('phase3-clear', { ids: ['1'] });
  assert.deepEqual(await cache.get('phase3-clear'), { ids: ['1'] });
  await cache.clear();
  assert.equal(await cache.get('phase3-clear'), undefined);
}
console.log('PASS Settings cache clear: IndexedDB and in-memory discovery records removed');

// Clearing during the db() await must not restore the old session checkpoint.
const raced=createDiscoveryStore(null);
const pendingWrite=raced.set('race',{ids:['1']});
await raced.clear();await pendingWrite;
assert.equal(await raced.get('race'),undefined);
const blocked={open(){const request={};queueMicrotask(()=>request.onerror());return request;}};
const unopened=createDiscoveryStore(blocked);
await unopened.set('blocked',{ids:['1']});
await assert.rejects(unopened.clear(),/Could not open IndexedDB/);
assert.equal(await unopened.get('blocked'),undefined);
console.log('PASS overlapping discovery clear invalidates queued writes; unopened durable storage reports failure');
