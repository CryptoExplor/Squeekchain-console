import { getAddress } from 'viem';
import { throwIfAborted } from './cancellation.js';
import { isLogRangeError, isRpcAvailabilityError, isTrustError } from './rpc-errors.js';
import { accountTokenIds } from './account-discovery.js';

// IndexedDB is optional storage, never an ownership oracle. Node/private-mode falls back
// to a session map; every hit is still checked onchain at the requested snapshot.
export function createDiscoveryStore(indexedDB = globalThis.indexedDB) {
  const memory = new Map();
  let opening;
  async function db() {
    if (!indexedDB) return null;
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('wheelhouse', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('discovery')) request.result.createObjectStore('discovery'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB blocked'));
    }).catch(() => null);
    return opening;
  }
  async function access(mode, key, value) {
    const database = await db();
    if (!database) return mode === 'readonly' ? memory.get(key) : memory.set(key, value);
    try {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction('discovery', mode);
        const store = tx.objectStore('discovery');
        const request = mode === 'readonly' ? store.get(key) : store.put(value, key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch { return mode === 'readonly' ? memory.get(key) : memory.set(key, value); }
  }
  return { clear: async () => {
    memory.clear();
    const database = await db();
    if (database) await new Promise((resolve, reject) => {
      const tx = database.transaction('discovery', 'readwrite'); tx.objectStore('discovery').clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }, get: key => access('readonly', key), set: (key, value) => { memory.set(key, value); return access('readwrite', key, value); } };
}
const defaultStore = createDiscoveryStore();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const idsSorted = ids => [...new Set(ids.map(String))].map(BigInt).sort(compare);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export async function discoverOwnedIds({ client, snapshot, nft, abi, owner, startBlock, namespace, store = defaultStore, signal, accountSource = accountTokenIds }) {
  owner = getAddress(owner);
  throwIfAborted(signal);
  const at = snapshot.blockNumber;
  const key = `11155111:${namespace}:${nft}:${owner}`.toLowerCase();
  const balance = await client.readContract({ address: nft, abi, functionName: 'balanceOf', args: [owner], blockNumber: at });
  async function confirm(candidates) {
    throwIfAborted(signal);
    const result = idsSorted(candidates);
    if (BigInt(result.length) !== BigInt(balance)) throw new Error('Incomplete token discovery; balance mismatch');
    if (result.length) {
      const holders = await client.multicall({ contracts: result.map(id => ({ address: nft, abi, functionName: 'ownerOf', args: [id] })), allowFailure: false, blockNumber: at });
      if (holders.length !== result.length || holders.some(holder => !same(holder, owner))) throw new Error('Incomplete token discovery; ownerOf mismatch');
    }
    throwIfAborted(signal);
    return result;
  }
  let cached, confirmed, accountAttempted = false;
  try { cached = await store.get(key); } catch { /* optional storage */ }
  let cursor = startBlock, ids = new Set();
  if (cached?.version === 1 && /^\d+$/.test(cached.lastScannedBlock) && /^0x[0-9a-f]{64}$/i.test(cached.lastScannedHash ?? '')
    && Array.isArray(cached.ids) && cached.ids.length <= 100_000 && cached.ids.every(id => /^\d+$/.test(id) && BigInt(id) > 0n)) {
    const anchor = BigInt(cached.lastScannedBlock);
    if (anchor >= startBlock && anchor <= at) {
      const hash = anchor === at ? snapshot.blockHash : (await client.getBlock({ blockNumber: anchor })).hash;
      if (same(hash, cached.lastScannedHash)) { cursor = anchor + 1n; ids = new Set(cached.ids); }
      // Reorg, rollback or invalid checkpoint: rebuild only this owner's filtered history.
    }
  }
  if (balance === 0n) ids.clear();
  else {
    let chunk = 45_000n;
    while (cursor <= at) {
      throwIfAborted(signal);
      const end = cursor + chunk - 1n > at ? at : cursor + chunk - 1n;
      let incoming, outgoing;
      try {
        const query = args => client.getContractEvents({ address: nft, abi, eventName: 'Transfer', args, strict: true, fromBlock: cursor, toBlock: end });
        // ERC-721 ABI builds the actual indexed from/to topics; no collection-wide logs.
        [incoming, outgoing] = await Promise.all([query({ to: owner }), query({ from: owner })]);
      } catch (error) {
        throwIfAborted(signal);
        // The transport already tried all log endpoints at this range. Before
        // shrinking, try the official account API once as an untrusted ID fast path.
        // Same-snapshot balance + ownerOf, not the API, establish completeness/ownership.
        if (!accountAttempted && accountSource && isRpcAvailabilityError(error)) {
          accountAttempted = true;
          try {
            confirmed = await confirm(await accountSource({ owner, nft, signal }));
            ids = new Set(confirmed.map(String));
            break;
          } catch (accountError) {
            throwIfAborted(signal);
            if (isTrustError(accountError)) throw accountError;
            // Unavailable/stale/incomplete API hints never replace verified logs.
          }
        }
        if (chunk <= 1_000n || !isLogRangeError(error)) throw error;
        chunk /= 2n;
        continue;
      }
      const unique = new Map();
      for (const log of [...incoming, ...outgoing]) {
        if (log.removed || log.blockNumber == null || log.logIndex == null || log.blockNumber < cursor || log.blockNumber > end) throw new Error('Unavailable: non-canonical discovery log');
        unique.set(`${log.blockNumber}:${log.logIndex}`, log);
      }
      const ordered = [...unique.values()].sort((a, b) => compare(a.blockNumber, b.blockNumber) || compare(a.logIndex, b.logIndex));
      for (const log of ordered) {
        const id = String(log.args.tokenId);
        if (same(log.args.to, owner)) ids.add(id);
        else if (same(log.args.from, owner)) ids.delete(id);
        else throw new Error('Unavailable: RPC ignored owner Transfer filter');
      }
      cursor = end + 1n;
    }
  }
  const result = confirmed ?? await confirm([...ids]);
  throwIfAborted(signal);
  try { await store.set(key, { version: 1, lastScannedBlock: String(at), lastScannedHash: snapshot.blockHash, ids: result.map(String) }); } catch { /* storage unavailable: chain result still valid */ }
  return result;
}
