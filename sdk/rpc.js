import { createPublicClient, custom, fallback, http } from 'viem';
import { sepolia } from 'viem/chains';
import { shouldThrow as shouldStop } from 'viem';

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
export function requireSepolia(id) {
  if (BigInt(id) !== BigInt(SEPOLIA_ID)) throw new RpcTrustError('Unavailable: RPC chainId is not Sepolia (0xaa36a7)');
}

// Pure, injectable trust boundary; production supplies distinct HTTP peers below.
export function createSnapshotGuard(client, peers) {
  async function check(snapshot) {
    requireSepolia(await client.getChainId());
    const blocks = await Promise.all([client, ...snapshot.peers].map(async peer => {
      requireSepolia(await peer.getChainId());
      return peer.getBlock({ blockNumber: snapshot.blockNumber });
    }));
    if (blocks.some(block => block.number !== snapshot.blockNumber || !/^0x[0-9a-f]{64}$/i.test(block.hash ?? '') || block.hash.toLowerCase() !== snapshot.blockHash.toLowerCase())) {
      throw new RpcTrustError('Unavailable: snapshot block hash mismatch across RPCs (or reorganization)');
    }
  }
  async function snapshot(blockNumber) {
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
        // Availability failures may fail over; identity mismatches must never be retried away.
        if (error instanceof RpcTrustError) throw error;
      }
    }
    if (selected.length < 2) throw new RpcTrustError('Unavailable: two independent Sepolia RPCs are required');
    const result = { blockNumber: at, blockHash: selected[0].block.hash, peers: selected.map(item => item.peer) };
    await check(result);
    return result;
  }
  return { snapshot, check };
}

export function createRpcContext({ rpcUrl, provider } = {}) {
  const urls = [...new Set([...(rpcUrl ? [rpcUrl] : []), ...PUBLIC_RPCS])];
  const peers = PUBLIC_RPCS.map(url => createPublicClient({ chain: sepolia, transport: http(url, { timeout: 12_000, retryCount: 1, retryDelay: 750 }) }));
  // Validate the actual chain on every transport request, including a fallback endpoint.
  const checked = urls.map(url => options => {
    const transport = http(url, { timeout: 12_000, retryCount: 1, retryDelay: 750 })(options);
    return { ...transport, request: async request => {
      const id = await transport.request({ method: 'eth_chainId' });
      requireSepolia(id);
      return request.method === 'eth_chainId' ? id : transport.request(request);
    } };
  });
  const publicClient = createPublicClient({ chain: sepolia, transport: fallback(checked, { rank: false, retryCount: 0, shouldThrow: error => error instanceof RpcTrustError || shouldStop(error) }) });
  const client = createPublicClient({ chain: sepolia, transport: custom({ request: async request => {
    const wallet = provider?.();
    if (wallet) {
      let id;
      try { id = await wallet.request({ method: 'eth_chainId' }); } catch { /* disconnected: public reads */ }
      if (id && BigInt(id) === BigInt(SEPOLIA_ID)) return wallet.request(request);
    }
    return publicClient.request(request);
  } }, { retryCount: 0 }) });
  const guard = createSnapshotGuard(client, peers);
  return { client, ...guard };
}
