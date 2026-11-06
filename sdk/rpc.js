import { readIdentityBatch } from './identity-batch.js';
import { createPublicClient, custom, fallback, http, shouldThrow as shouldStop } from 'viem';
import { abortable, throwIfAborted } from './cancellation.js';
import { sepolia } from 'viem/chains';
import { isLogRangeError, isRpcAvailabilityError, isRpcProgrammingError, isTrustError, RpcTrustError, RpcAvailabilityError, rpcCauses, rpcErrorDiagnostics, withRpcContext } from './rpc-errors.js';
export { RpcTrustError } from './rpc-errors.js';
import { retryAfterMs } from './retry-after.js';
const sessionCooldowns = new Map();

// Roles are observed availability preferences, never deployment/trust pins.
export const PUBLIC_RPC_ENDPOINTS = [
  // PublicNode prunes old eth_getLogs history (error 4444), so it serves no log windows.
  { url: 'https://ethereum-sepolia-rpc.publicnode.com', roles: ['snapshot', 'state'], logOrder: 3 },
  { url: 'https://sepolia.gateway.tenderly.co', roles: ['snapshot', 'state', 'logs'], logOrder: 1 },
  { url: 'https://0xrpc.io/sep', roles: ['snapshot', 'state', 'logs'], logOrder: 2 },
];
// The browser transport is HTTP JSON-RPC. WSS aliases are not fed to http(),
// nor counted as independent peers alongside HTTPS from the same operator.
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
        if (isTrustError(error) || isRpcProgrammingError(error)) throw error;
      }
    }
    if (selected.length < 2) throw new Error('Unavailable: two independent Sepolia RPCs are required');
    const result = { blockNumber: at, blockHash: selected[0].block.hash, timestamp: selected[0].block.timestamp, peers: selected.map(item => item.peer) };
    // Reuse the peer blocks just fetched instead of downloading them a second time.
    agree(result, [...selected.map(item => item.block), await client.getBlock({ blockNumber: at })]);
    return result;
  }
  return { snapshot, check };
}

// A shared map is in-memory/session-only. Concurrent requests share one chain-ID probe.
export function chainCheckedRequest(request, { key, chainCache = new Map(), signal, endpoint } = {}) {
  async function chainId() {
    throwIfAborted(signal);
    if (!chainCache.has(key)) {
      const probe = abortable(() => request({ method: 'eth_chainId' }), signal).then(id => {
        try { requireSepolia(id); } catch (error) { throw withRpcContext(error, { endpoint, method: 'eth_chainId', kind: 'chain-identity' }); }
        return id;
      });
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
      if (isTrustError(error) || isRpcProgrammingError(error)) throw error;
      // Recheck identity on errors, but never retry a reverted call with changed inputs.
      try { await chainId(); }
      catch (recheckError) {
        if (isTrustError(recheckError)) throw withRpcContext(recheckError, { endpoint, method: 'eth_chainId', kind: 'chain-identity', priorError: error });
        // Preserve the original endpoint/method failure instead of replacing it
        // with a generic re-probe error. Neither error causes changed-input retries.
        throw withRpcContext(error, { endpoint, method: args.method, recheckError });
      }
      throw error;
    }
  };
}

export function createRpcContext({ rpcUrl, provider, signal, chainCache = new Map(), rpcCooldowns = sessionCooldowns, now = Date.now } = {}) {
  const failures = [];
  const recordFailure = error => {
    failures.push({ ...rpcErrorDiagnostics(error), occurredAtMs: now() });
    if (failures.length > 32) failures.shift();
    return error;
  };
  const contextualRequest = (request, endpoint) => async args => {
    try { return await request(args); }
    catch (error) {
      throwIfAborted(signal);
      const info = rpcErrorDiagnostics(error);
      throw recordFailure(withRpcContext(error, { endpoint, method: args.method,
        kind: info.httpStatus !== null ? 'http' : info.rpcCode !== null ? 'json-rpc' : 'transport' }));
    }
  };
  const uniqueUrls = urls => [...new Set(urls.map(url => new URL(url).href))];
  const urls = uniqueUrls([...(rpcUrl ? [rpcUrl] : []), ...PUBLIC_RPCS]);
  const checked = new Map(urls.map(url => {
    const raw = createPublicClient({ chain: sepolia, transport: http(url, {
      timeout: 12_000, retryCount: 0, fetchOptions: { signal },
      onFetchResponse: response => {
        if (response.status === 429 || response.status === 503) {
          const timestamp = now();
          rpcCooldowns.set(url, timestamp + retryAfterMs(response.headers.get('Retry-After'), timestamp));
        }
      },
    }) });
    const request = chainCheckedRequest(contextualRequest(async args => {
      // Skip a rate-limited endpoint, including identity re-probes. Do not sleep or
      // block healthy fallbacks. Shared across contexts/profile refreshes in this tab.
      if (now() < (rpcCooldowns.get(url) ?? 0)) throw new RpcAvailabilityError(new Error('RPC unavailable; waiting for endpoint cooldown'), { endpoint: url, method: args.method, kind: 'cooldown' });
      try {return await raw.request(args);}
      catch(error) {
        // Network/CORS fetch failures and timeouts need backoff too. Do NOT cool
        // down JSON-RPC range errors: discovery must still try smaller ranges.
        if(!isTrustError(error)&&!isRpcProgrammingError(error)&&rpcCauses(error).some(({error:e})=>e.name==='TimeoutError'||e.name==='TypeError'))rpcCooldowns.set(url,Math.max(rpcCooldowns.get(url)??0,now()+30_000));
        throw error;
      }
    }, url), { key: url, chainCache, signal, endpoint: url });
    return [url, custom({ request: contextualRequest(request, url) }, { retryCount: 0 })];
  }));
  // A custom endpoint joins the peer set and is tried first for state/log reads.
  // Wallet reads remain preferred, but never replace the two independent peers.
  const roleUrls = role => {
    const endpoints = PUBLIC_RPC_ENDPOINTS.filter(endpoint => endpoint.roles.includes(role));
    if (role === 'logs') endpoints.sort((a, b) => a.logOrder - b.logOrder);
    const preferred = endpoints.map(endpoint => endpoint.url);
    return uniqueUrls([...(rpcUrl ? [rpcUrl] : []), ...preferred]);
  };
  const peerOrigins = new Set();
  const peers = roleUrls('snapshot').filter(url => {
    const origin = new URL(url).origin;
    if (peerOrigins.has(origin)) return false;
    peerOrigins.add(origin);
    return true;
  }).map(url => Object.assign(createPublicClient({ name: url===rpcUrl?"Custom RPC":new URL(url).hostname, chain: sepolia, transport: checked.get(url) }), {identityUrl:url}));
  // Identity/hash failures always stop, even if a wrapped message mentions limits.
  const shouldThrow = error => signal?.aborted || isTrustError(error) || isRpcProgrammingError(error) || (!isRpcAvailabilityError(error) && rpcCauses(error).some(item => shouldStop(item.error)));
  const stateClient = createPublicClient({ chain: sepolia, transport: fallback(roleUrls('state').map(url => checked.get(url)), {
    rank: false, retryCount: 0, shouldThrow,
  }) });
  const logPeers = roleUrls('logs').map(url => createPublicClient({ name: url===rpcUrl?"Custom RPC":new URL(url).hostname, chain: sepolia, transport: checked.get(url) }));
  const logsClient = createPublicClient({ chain: sepolia, transport: custom({ request: async args => {
    let lastError, rangeFailure;
    for (const peer of logPeers) {
      try { return await peer.request(args); }
      catch (error) {
        if (shouldThrow(error)) throw error;
        lastError = error;
        if (isLogRangeError(error)) rangeFailure ??= error;
      }
    }
    // A last-resort 429/cooldown must not hide an earlier range/pruned failure:
    // discovery can still try smaller ranges after its account-hint fast path.
    if (rangeFailure) throw new Error(`Log endpoints unavailable: ${lastError.message}`, { cause: rangeFailure });
    throw lastError;
  } }, { retryCount: 0 }) });
  const walletRequests = new WeakMap();
  const invalidateChain = () => chainCache.clear();
  const client = createPublicClient({ chain: sepolia, batch: { multicall: true }, transport: custom({ request: async args => {
    throwIfAborted(signal);
    const wallet = provider?.();
    if (wallet) {
      if (!walletRequests.has(wallet)) {
        const request = chainCheckedRequest(contextualRequest(args => wallet.request(args), 'wallet'), { key: wallet, chainCache, signal, endpoint: 'wallet' });
        walletRequests.set(wallet, request);
        const changed = () => chainCache.delete(wallet);
        wallet.on?.('chainChanged', changed);
        signal?.addEventListener('abort', () => wallet.removeListener?.('chainChanged', changed), { once: true });
      }
      const request = walletRequests.get(wallet);
      let id;
      try { id = await request({ method: 'eth_chainId' }); }
      catch (error) {
        if (isRpcProgrammingError(error)) throw error;
        if (isTrustError(error)) {
          chainCache.delete(wallet);
          // An initially non-Sepolia wallet is not a read candidate. Do not
          // swallow other nested identity/hash failures during its probe.
          if (error.kind !== 'chain-identity') throw error;
        }
      }
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
  const readPeerIdentity = async (peer,requests) => {
    const endpoint=peer.identityUrl,method=requests[0]?.method;
    requireSepolia(await peer.getChainId());
    if(now()<(rpcCooldowns.get(endpoint)??0))throw new RpcAvailabilityError(new Error('RPC unavailable; waiting for endpoint cooldown'),{endpoint,method,kind:'cooldown'});
    try {return await readIdentityBatch(peer,requests,{signal,onResponse:(response,url)=>{
      if(response.status===429||response.status===503){const timestamp=now();rpcCooldowns.set(url,timestamp+retryAfterMs(response.headers.get('Retry-After'),timestamp));}
    }});} catch(error) {
      throwIfAborted(signal);
      if(isTrustError(error))throw recordFailure(error);
      // Direct batch failures have the same fresh chain-identity check as singles.
      chainCache.delete(endpoint);
      try {requireSepolia(await peer.getChainId());}
      catch(recheckError){throw recordFailure(withRpcContext(error,{endpoint,method,recheckError}));}
      if(!isRpcProgrammingError(error)&&rpcCauses(error).some(({error:e})=>e.name==='TimeoutError'||e.name==='TypeError'))rpcCooldowns.set(endpoint,Math.max(rpcCooldowns.get(endpoint)??0,now()+30_000));
      throw recordFailure(withRpcContext(error,{endpoint,method}));
    }
  };
  const readIdentity = async (snapshot, requests) => {
    const original=snapshot.peers.slice();
    const results=await Promise.allSettled(original.map(peer=>readPeerIdentity(peer,requests)));
    // Inspect all failures before considering availability fallback. A genuine
    // mismatch/programming error must not be hidden by another peer's outage.
    for(const result of results)if(result.status==='rejected'&&!isRpcAvailabilityError(result.reason))throw result.reason;
    const good=results.flatMap((result,i)=>result.status==='fulfilled'?[{peer:original[i],values:result.value}]:[]);
    let last=results.find(result=>result.status==='rejected')?.reason;
    for(const peer of peers) {
      if(good.length>=2)break;
      if(original.includes(peer))continue;
      try {
        requireSepolia(await peer.getChainId());
        const block=await peer.getBlock({blockNumber:snapshot.blockNumber});
        agree(snapshot,[block]);
        good.push({peer,values:await readPeerIdentity(peer,requests)});
      } catch(error) {
        throwIfAborted(signal);
        if(!isRpcAvailabilityError(error))throw error;
        last=recordFailure(error);
      }
    }
    if(good.length<2)throw last??new RpcAvailabilityError(new Error('Two independent identity peers unavailable'));
    // The final guard checks these exact peers again, not the unavailable pair.
    snapshot.peers=good.slice(0,2).map(item=>item.peer);
    return good.slice(0,2).map(item=>item.values);
  };
  return { client, readIdentity, invalidateChain, rpcDiagnostics: () => failures.slice(), ...createSnapshotGuard(client, peers, { signal }) };
}
