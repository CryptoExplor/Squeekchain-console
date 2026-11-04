import assert from 'node:assert/strict';
import { encodeEventTopics, toHex } from 'viem';
import { createRpcContext, PUBLIC_RPCS, PUBLIC_RPC_ENDPOINTS, RpcTrustError } from '../sdk/rpc.js';
import { isRpcAvailabilityError, isLogRangeError, rpcErrorDiagnostics } from '../sdk/rpc-errors.js';
import { createDiscoveryStore, discoverOwnedIds } from '../sdk/discovery.js';
import { DEPLOYMENT } from '../sdk/record.js';
import { nftAbi } from '../sdk/abi.js';
import { IMPLEMENTATION_SLOT } from '../sdk/verify.js';
import { probeEndpoint } from '../src/rpc-probe.mjs';

const [first, second, third] = PUBLIC_RPCS;
const [logFirst,logSecond]=[...PUBLIC_RPC_ENDPOINTS].sort((a,b)=>a.logOrder-b.logOrder).map(item=>item.url);
assert.deepEqual(PUBLIC_RPCS,['https://ethereum-sepolia-rpc.publicnode.com','https://sepolia.gateway.tenderly.co','https://0xrpc.io/sep']);
assert.deepEqual(PUBLIC_RPC_ENDPOINTS.filter(item=>item.roles.includes('logs')).map(item=>item.url),PUBLIC_RPCS);
assert.deepEqual(PUBLIC_RPC_ENDPOINTS.filter(item=>item.roles.includes('state')).map(item=>item.url),PUBLIC_RPCS);
const hash = `0x${'ab'.repeat(32)}`, word = `0x${'0'.repeat(24)}${DEPLOYMENT.implementations.mining.slice(2)}`;
const payloads = [
  { code: 4444, message: 'pruned history unavailable' },
  { code: -32000, message: 'historical state unavailable' },
  { code: -32005, message: 'range too large' },
  { code: 35, message: 'chain is not available on free plan' },
  { code: -32000, message: 'forbidden' },
  { code: -32000, message: 'getLogs request exceeded max allowed range' },
];
const realFetch = globalThis.fetch;
let calls = [], route = () => null;
function success(method, params) {
  if (method === 'eth_chainId') return '0xaa36a7';
  if (method === 'eth_blockNumber') return toHex(45_012n);
  if (method === 'eth_getBlockByNumber') return { number: params[0], hash, transactions: [], timestamp: '0x1' };
  if (method === 'eth_getStorageAt') return word;
  if (method === 'eth_getLogs') return [];
  throw new Error(`Unexpected method ${method}`);
}
globalThis.fetch = async (url, init) => {
  const request = JSON.parse(init.body), { method, params = [] } = request;
  const call = { url: String(url).replace(/\/$/, ''), method, params }; calls.push(call);
  const routed = route(call);
  if (routed?.httpStatus) return new Response('rate limited', { status: routed.httpStatus, headers: { 'Retry-After': routed.retryAfter } });
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...(routed ?? { result: success(method, params) }) }), { headers: { 'content-type': 'application/json' } });
};
try {
  assert.equal(rpcErrorDiagnostics({cause:payloads[5]}).reason,'Log range limit','exact provider wording survives safe diagnostic classification');
  for (const error of payloads) {
    assert.equal(isRpcAvailabilityError({ cause: error }), true);
    calls = [];
    route = call => call.url === first && call.method !== 'eth_chainId' ? { error } : null;
    const client = createRpcContext().client;
    assert.equal(await client.getStorageAt({ address: DEPLOYMENT.mining, slot: IMPLEMENTATION_SLOT, blockNumber: 45_000n }), word);
    assert.deepEqual(calls.filter(call => call.method === 'eth_getStorageAt').map(call => call.url), [first, second]);
    calls = [];
    route=call=>call.url===logFirst&&call.method!=='eth_chainId'?{error}:null;
    await client.getContractEvents({ address: DEPLOYMENT.nft, abi: nftAbi, eventName: 'Transfer', fromBlock: 1n, toBlock: 45_000n });
    const scans = calls.filter(call => call.method === 'eth_getLogs');
    assert.deepEqual(scans.map(call => call.url), [logFirst, logSecond]);
    assert.deepEqual(scans[0].params, scans[1].params, 'fail over at the exact same range before shrinking');
  }
  console.log('PASS RPC availability payloads: 4444/pruned history, historical state, range too large, free plan and forbidden; role-based state/log failover');

  // 0xRPC is last. Retry-After suppresses all endpoint requests, including
  // identity re-probes, across contexts until the deadline (no sleeping/hot loop).
  const cooldowns = new Map();
  let clock = Date.parse('2026-11-03T00:00:00Z');
  calls = [];
  route = call => {
    if (call.method !== 'eth_getLogs') return null;
    if ([first,second].includes(call.url)) return { error: payloads[0] };
    if (call.url === third) return { httpStatus: 429, retryAfter: '7' };
    return null;
  };
  const logRequest = client => client.getContractEvents({ address: DEPLOYMENT.nft, abi: nftAbi, eventName: 'Transfer', fromBlock: 1n, toBlock: 45_000n });
  const rateLimited = () => createRpcContext({ rpcCooldowns: cooldowns, now: () => clock }).client;
  await assert.rejects(logRequest(rateLimited()), /rate limited|429|Retry-After|cooldown/);
  assert.deepEqual(calls.filter(call => call.method === 'eth_getLogs').map(call => call.url), [logFirst,logSecond,third]);
  assert.equal(cooldowns.get(new URL(third).href), clock + 7_000);
  await assert.rejects(logRequest(rateLimited()), error => isLogRangeError(error), 'terminal 429/cooldown preserves earlier range failure for discovery shrinking');
  const initialFinality = calls.filter(call => call.url === third).length;
  await assert.rejects(logRequest(rateLimited()), /rate limited|429|Retry-After|cooldown/);
  assert.equal(calls.filter(call => call.url === third).length, initialFinality, 'no requests during the shared cooldown');
  clock += 7_000;
  route = call => call.method === 'eth_getLogs' && [first,second].includes(call.url) ? { error: payloads[0] } : null;
  await logRequest(rateLimited());
  assert.ok(calls.filter(call => call.url === third).length > initialFinality);
  console.log('PASS log order Tenderly → PublicNode → 0xRPC, shared Retry-After backoff and recovery');

  // A supplied endpoint is both a preferred read transport and an independent peer.
  calls = [];
  const custom = 'https://custom.example/rpc';
  route = call => call.url === first && call.method === 'eth_getBlockByNumber' ? { error: payloads[0] } : null;
  const context = createRpcContext({ rpcUrl: custom });
  const snapshot = await context.snapshot();
  await context.check(snapshot);
  assert.equal(snapshot.peers.length, 2);
  assert.ok(calls.some(call => call.url === custom && call.method === 'eth_getBlockByNumber'));
  assert.ok(calls.some(call => call.url === second && call.method === 'eth_getBlockByNumber'));
  assert.equal(calls.some(call => call.url === third), false);


  calls = []; route = () => null;
  await createRpcContext({ rpcUrl: `${first}/` }).snapshot();
  assert.deepEqual([...new Set(calls.filter(call => call.method === 'eth_getBlockByNumber').map(call => call.url))], [first, second], 'a public URL alias must not count as two independent peers');
  calls = [];
  route = call => call.url === first ? { error: payloads[0] } : null;
  const allPeers = await createRpcContext().snapshot();
  assert.equal(allPeers.peers.length, 2, 'snapshot peers can skip an unavailable endpoint');
  calls = [];
  route = call => call.url===first ? { error: payloads[3] } : null;
  assert.equal((await createRpcContext().snapshot()).peers.length, 2);
  assert.deepEqual([...new Set(calls.filter(call => call.method === 'eth_getBlockByNumber').map(call => call.url))], [second, third], 'any two healthy endpoints can serve snapshot agreement');

  // Sepolia wallet first, availability fallback only; off-chain wallets do not serve reads.
  calls = []; route = () => null;
  const walletCalls = [];
  const wallet = { request: async ({ method, params }) => { walletCalls.push(method); return success(method, params); } };
  const walletContext = createRpcContext({ provider: () => wallet });
  await walletContext.client.getStorageAt({ address: DEPLOYMENT.mining, slot: IMPLEMENTATION_SLOT, blockNumber: 45_000n });
  assert.deepEqual(walletCalls, ['eth_chainId', 'eth_getStorageAt']);
  assert.equal(calls.length, 0);
  wallet.request = async ({ method, params }) => {
    if (method === 'eth_getLogs') throw Object.assign(new Error('JSON-RPC request failed'), {cause:{details:payloads[5].message,code:-32000}});
    return success(method, params);
  };
  await walletContext.client.getContractEvents({ address: DEPLOYMENT.nft, abi: nftAbi, eventName: 'Transfer', fromBlock: 1n, toBlock: 45_000n });
  assert.deepEqual(calls.filter(call => call.method === 'eth_getLogs').map(call => call.url), [logFirst]);
  calls = [];
  const offChain = createRpcContext({ provider: () => ({ request: async () => '0x1' }) });
  await offChain.client.getBlockNumber();
  assert.ok(calls.some(call => call.url === first && call.method === 'eth_blockNumber'));

  // Trust failures cannot be softened by availability-like wording or wrapped causes.
  const trust = new RpcTrustError('historical state / range too large: snapshot block hash mismatch');
  assert.equal(isRpcAvailabilityError({ cause: trust }), false);
  assert.equal(isLogRangeError({ cause: trust }), false);
  calls = [];
  route = call => call.method === 'eth_chainId' ? { result: '0x1' } : null;
  await assert.rejects(createRpcContext().snapshot(), /chainId|Sepolia/);
  assert.equal(new Set(calls.map(call => call.url)).size, 1);
  calls = []; route = () => null;
  await assert.rejects(createRpcContext({ provider: () => ({ request: async ({ method }) => {
    if (method === 'eth_chainId') return '0xaa36a7';
    throw trust;
  } }) }).client.getBlockNumber(), /snapshot block hash mismatch/);
  assert.equal(calls.length, 0);
  console.log('PASS custom RPC joins peers, Sepolia wallet preference/availability fallback, wrong-chain and hash trust stop');

  // Real transport + discovery: all log endpoints must fail before a smaller query.
  calls = [];
  const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
  const other = '0x0000000000000000000000000000000000000001';
  route = call => {
    if (call.method !== 'eth_getLogs') return null;
    const query = call.params[0], from = BigInt(query.fromBlock), to = BigInt(query.toBlock);
    if (to - from + 1n > 22_500n) return { error: call.url === first ? payloads[0] : payloads[5] };
    return { result: from === 1n && query.topics[2] ? [{
      address: DEPLOYMENT.nft, blockNumber: '0x1', blockHash: hash, transactionHash: hash,
      transactionIndex: '0x0', logIndex: '0x0', data: '0x', removed: false,
      topics: encodeEventTopics({ abi: nftAbi, eventName: 'Transfer', args: { from: other, to: owner, tokenId: 1n } }),
    }] : [] };
  };
  const discoveryClient = createRpcContext().client;
  const ids = await discoverOwnedIds({
    client: { ...discoveryClient, readContract: async () => 1n, multicall: async () => [owner] },
    snapshot: { blockNumber: 45_000n, blockHash: hash }, nft: DEPLOYMENT.nft, abi: nftAbi,
    owner, startBlock: 1n, namespace: 'failover', store: createDiscoveryStore(null), accountSource: null,
  });
  assert.deepEqual(ids, [1n]);
  const scans = calls.filter(call => call.method === 'eth_getLogs');
  const firstSmall = scans.findIndex(call => BigInt(call.params[0].toBlock) - BigInt(call.params[0].fromBlock) + 1n <= 22_500n);
  assert.equal(firstSmall, 6, 'two owner filters try all three log endpoints at 45k before shrinking');
  assert.deepEqual(scans.slice(0, firstSmall).map(call => call.url).sort(), [first,first,second,second,third,third].sort());
  assert.ok(scans.slice(firstSmall).every(call => call.url === logFirst));
  console.log('PASS discovery shrinks only after all three requested providers reject the original range');
} finally { globalThis.fetch = realFetch; }

// Probe contract: exact head-12 storage/block and inclusive 10k NFT Transfer range.
const probeCalls = [];
const request = async (_url, method, params = []) => { probeCalls.push({ method, params }); return success(method, params); };
const row = await probeEndpoint(first, request);
assert.equal(row.chainId, '0xaa36a7');
assert.match(row['head-12 block'], /^OK: 45000$/);
assert.match(row['mining slot'], /^OK:/);
assert.match(row['10k Transfer logs'], /^OK:/);
assert.deepEqual(probeCalls.find(call => call.method === 'eth_getStorageAt').params, [DEPLOYMENT.mining, IMPLEMENTATION_SLOT, toHex(45_000n)]);
const query = probeCalls.find(call => call.method === 'eth_getLogs').params[0];
assert.equal(query.address, DEPLOYMENT.nft);
assert.equal(BigInt(query.toBlock) - BigInt(query.fromBlock) + 1n, 10_000n);
assert.equal(query.topics[0], encodeEventTopics({ abi: nftAbi, eventName: 'Transfer' })[0]);
const limited = await probeEndpoint(second, async (url, method, params) => {
  if (method === 'eth_getLogs') throw new Error('4444: pruned history unavailable');
  return request(url, method, params);
});
assert.match(limited['10k Transfer logs'], /FAIL: 4444: pruned history unavailable/);
assert.match(limited['mining slot'], /^OK:/);
assert.match(limited['head-12 block'], /^OK:/);
console.log('PASS rpc:probe checks head-12, pinned mining slot and 10k Transfer logs; capability failures remain independent');
