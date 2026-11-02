import { createPublicClient, custom, fallback, http, shouldThrow as shouldStop } from 'viem';
import { abortable, throwIfAborted } from './cancellation.js';
import { sepolia } from 'viem/chains';

export const PUBLIC_RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.drpc.org',
  'https://1rpc.io/sepolia',
];
export const SEPOLIA_ID = 11155111;
export const SEPOLIA_HEX = '0xaa36a7';
export class RpcTrustError extends Error {
  constructor(message) { super(message); this.name = 'RpcTrustError'; }
}
function isTrustError(error) {
  for (let depth = 0; error && depth < 12; depth++, error = error.cause) if (error instanceof RpcTrustError || error.name === 'RpcTrustError') return true;
  return false;
}
export function requireSepolia(id) {
  if (BigInt(id) !== BigInt(SEPOLIA_ID)) throw new RpcTrustError('Unavailable: RPC chainId is not Sepolia (0xaa36a7)');
}
function agree(snapshot, blocks) {
  if (blocks.some(block => block.number !== snapshot.blockNumber || !/^0x[0-9a-f]{64}$/i.test(block.hash ?? '') || block.hash.toLowerCase() !== snapshot.blockHash.toLowerCase())) {
    throw new RpcTrustError('Unavailable: snapshot block hash mismatch across RPCs (or reorganization)');
  }
}

// Block hashes are NEVER session-cached. Two distinct public peers agree on every snapshot.
export function createSnapshotGuard(client, peers, { signal } = {}) {
  async function check(snapshot) {
    throwIfAborted(signal);
    const blocks = await Promise.all([client, ...snapshot.peers].map(async peer => {
      requireSepolia(await peer.getChainId());
      return peer.getBlock({ blockNumber: snapshot.blockNumber });
    }));
    agree(snapshot, blocks);
  }
  async function snapshot(blockNumber) {
    throwIfAborted(signal);
    requireSepolia(await client.getChainId());
    const head = blockNumber === undefined ? await client.getBlockNumber({ cacheTime: 0 }) : null;
    const at = blockNumber ?? (head > 12n ? head - 12n : head);
    const selected = [];
    for (const peer of peers) {
      try {
        requireSepolia(await peer.getChainId());
        const block = await peer.getBlock({ blockNumber: at });
        if (!block.hash || block.number !== at) throw new Error('Missing snapshot block');
        selected.push({ peer, block });
        if (selected.length === 2) break;
      } catch (error) {
        throwIfAborted(signal);
        if (isTrustError(error)) throw error;
      }
    }
    if (selected.length < 2) throw new RpcTrustError('Unavailable: two independent Sepolia RPCs are required');
    const result = { blockNumber: at, blockHash: selected[0].block.hash, peers: selected.map(item => item.peer) };
    // Reuse the peer blocks just fetched instead of downloading them a second time.
    agree(result, [...selected.map(item => item.block), await client.getBlock({ blockNumber: at })]);
    return result;
  }
  return { snapshot, check };
}

// A shared map is in-memory/session-only. Concurrent requests share one chain-ID probe.
export function chainCheckedRequest(request, { key, chainCache = new Map(), signal } = {}) {
  async function chainId() {
    throwIfAborted(signal);
    if (!chainCache.has(key)) {
      const probe = abortable(() => request({ method: 'eth_chainId' }), signal).then(id => { requireSepolia(id); return id; });
      chainCache.set(key, probe);
      probe.catch(() => { if (chainCache.get(key) === probe) chainCache.delete(key); });
    }
    return chainCache.get(key);
  }
  return async args => {
    const id = await chainId();
    if (args.method === 'eth_chainId') return id;
    try { return await abortable(() => request(args), signal); }
    catch (error) {
      chainCache.delete(key);
      throwIfAborted(signal);
      // Recheck identity on errors, but never retry a reverted call with changed inputs.
      await chainId();
      throw error;
    }
  };
}

export function createRpcContext({ rpcUrl, provider, signal, chainCache = new Map() } = {}) {
  const urls = [...new Set([...(rpcUrl ? [rpcUrl] : []), ...PUBLIC_RPCS])];
  const checked = new Map(urls.map(url => {
    const raw = createPublicClient({ chain: sepolia, transport: http(url, { timeout: 12_000, retryCount: 1, retryDelay: 750, fetchOptions: { signal } }) });
    const request = chainCheckedRequest(raw.request, { key: url, chainCache, signal });
    return [url, custom({ request }, { retryCount: 0 })];
  }));
  const peers = PUBLIC_RPCS.map(url => createPublicClient({ chain: sepolia, transport: checked.get(url) }));
  const publicClient = createPublicClient({ chain: sepolia, transport: fallback(urls.map(url => checked.get(url)), {
    rank: false, retryCount: 0, shouldThrow: error => signal?.aborted || isTrustError(error) || shouldStop(error),
  }) });
  const walletRequests = new WeakMap();
  const invalidateChain = () => chainCache.clear();
  const client = createPublicClient({ chain: sepolia, batch: { multicall: true }, transport: custom({ request: async args => {
    throwIfAborted(signal);
    const wallet = provider?.();
    if (wallet) {
      if (!walletRequests.has(wallet)) {
        const request = chainCheckedRequest(args => wallet.request(args), { key: wallet, chainCache, signal });
        walletRequests.set(wallet, request);
        const changed = () => chainCache.delete(wallet);
        wallet.on?.('chainChanged', changed);
        signal?.addEventListener('abort', () => wallet.removeListener?.('chainChanged', changed), { once: true });
      }
      const request = walletRequests.get(wallet);
      let id;
      try { id = await request({ method: 'eth_chainId' }); }
      catch (error) { if (error instanceof RpcTrustError) chainCache.delete(wallet); }
      if (id && BigInt(id) === BigInt(SEPOLIA_ID)) return request(args);
    }
    return abortable(() => publicClient.request(args), signal);
  } }, { retryCount: 0 }) });
  return { client, invalidateChain, ...createSnapshotGuard(client, peers, { signal }) };
}
