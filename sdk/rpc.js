import { createPublicClient, custom, fallback, http, shouldThrow as shouldStop } from 'viem';
import { abortable, throwIfAborted } from './cancellation.js';
import { sepolia } from 'viem/chains';
import { isRpcAvailabilityError, isTrustError, RpcTrustError } from './rpc-errors.js';
export { RpcTrustError } from './rpc-errors.js';

// Roles are observed availability preferences, never deployment/trust pins.
export const PUBLIC_RPC_ENDPOINTS = [
  { url: 'https://sepolia.gateway.tenderly.co', roles: ['snapshot', 'state', 'logs'] },
  { url: 'https://ethereum-sepolia-rpc.publicnode.com', roles: ['snapshot', 'state'] },
  { url: 'https://ethereum-sepolia-public.nodies.app', roles: ['snapshot', 'state'] },
  { url: 'https://eth-sepolia.api.onfinality.io/public', roles: ['snapshot', 'state', 'logs'] },
  { url: 'https://0xrpc.io/sep', roles: ['snapshot', 'state'] },
];
export const PUBLIC_RPCS = PUBLIC_RPC_ENDPOINTS.map(endpoint => endpoint.url);
export const SEPOLIA_ID = 11155111;
export const SEPOLIA_HEX = '0xaa36a7';
export function requireSepolia(id) {
  if (BigInt(id) !== BigInt(SEPOLIA_ID)) throw new RpcTrustError('Unavailable: RPC chainId is not Sepolia (0xaa36a7)');
}
function agree(snapshot, blocks) {
  if (blocks.some(block => block.number !== snapshot.blockNumber || !/^0x[0-9a-f]{64}$/i.test(block.hash ?? '') || block.hash.toLowerCase() !== snapshot.blockHash.toLowerCase())) {
    throw new RpcTrustError('Unavailable: snapshot block hash mismatch across RPCs (or reorganization)');
  }
}

// Block hashes are NEVER session-cached. Two distinct RPC peers agree on every snapshot.
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
    if (selected.length < 2) throw new Error('Unavailable: two independent Sepolia RPCs are required');
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
  const uniqueUrls = urls => [...new Set(urls.map(url => new URL(url).href))];
  const urls = uniqueUrls([...(rpcUrl ? [rpcUrl] : []), ...PUBLIC_RPCS]);
  const checked = new Map(urls.map(url => {
    const raw = createPublicClient({ chain: sepolia, transport: http(url, { timeout: 12_000, retryCount: 0, fetchOptions: { signal } }) });
    const request = chainCheckedRequest(raw.request, { key: url, chainCache, signal });
    return [url, custom({ request }, { retryCount: 0 })];
  }));
  // A custom endpoint joins the peer set and is tried first for state/log reads.
  // Wallet reads remain preferred, but never replace the two independent peers.
  const roleUrls = role => uniqueUrls([...(rpcUrl ? [rpcUrl] : []), ...PUBLIC_RPC_ENDPOINTS.filter(endpoint => endpoint.roles.includes(role)).map(endpoint => endpoint.url)]);
  const peerOrigins = new Set();
  const peers = roleUrls('snapshot').filter(url => {
    const origin = new URL(url).origin;
    if (peerOrigins.has(origin)) return false;
    peerOrigins.add(origin);
    return true;
  }).map(url => createPublicClient({ chain: sepolia, transport: checked.get(url) }));
  const roleClient = role => createPublicClient({ chain: sepolia, transport: fallback(roleUrls(role).map(url => checked.get(url)), {
    rank: false, retryCount: 0,
    // Identity/hash failures always stop, even if a wrapped message also mentions limits.
    shouldThrow: error => signal?.aborted || isTrustError(error) || (!isRpcAvailabilityError(error) && shouldStop(error)),
  }) });
  const stateClient = roleClient('state'), logsClient = roleClient('logs');
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
      if (id && BigInt(id) === BigInt(SEPOLIA_ID)) {
        try { return await request(args); }
        catch (error) {
          throwIfAborted(signal);
          if (isTrustError(error) || !isRpcAvailabilityError(error)) throw error;
          // Pruned/range/plan failures are availability problems, not wallet trust.
        }
      }
    }
    return abortable(() => (args.method === 'eth_getLogs' ? logsClient : stateClient).request(args), signal);
  } }, { retryCount: 0 }) });
  return { client, invalidateChain, ...createSnapshotGuard(client, peers, { signal }) };
}
