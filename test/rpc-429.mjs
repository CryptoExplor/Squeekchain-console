import assert from 'node:assert/strict';
import { toHex } from 'viem';
import { createRpcContext, PUBLIC_RPCS } from '../sdk/rpc.js';
import { createExploreIndex } from '../web/explore-index.js';
import { getProfile } from '../sdk/deployments.js';

// A public peer answering 429 is backpressure: cool it down for Retry-After,
// serve the read from the next peer, and never fail the Explore scan for it.
const [first, second] = PUBLIC_RPCS;
const blockHash = `0x${'ab'.repeat(32)}`;
const realFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (url, init) => {
  const endpoint = String(url).replace(/\/$/, '');
  const body = JSON.parse(init.body);
  const list = Array.isArray(body) ? body : [body];
  for (const item of list) calls.push({ endpoint, method: item.method });
  if (endpoint === first) return new Response('rate limited', { status: 429, headers: { 'Retry-After': '1' } });
  const answer = item => {
    const { method, params = [] } = item;
    if (method === 'eth_chainId') return { jsonrpc: '2.0', id: item.id, result: '0xaa36a7' };
    if (method === 'eth_blockNumber') return { jsonrpc: '2.0', id: item.id, result: toHex(45_012n) };
    if (method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id: item.id, result: { number: params[0], hash: blockHash, transactions: [], timestamp: '0x1' } };
    return { jsonrpc: '2.0', id: item.id, result: `0x${'0'.repeat(64)}` };
  };
  return new Response(JSON.stringify(Array.isArray(body) ? list.map(answer) : answer(body)), { headers: { 'content-type': 'application/json' } });
};

try {
  const context = createRpcContext();
  const snapshot = await context.snapshot();
  assert.equal(snapshot.blockHash, blockHash, 'the snapshot comes from a healthy peer');
  assert.equal(calls.filter(call => call.endpoint === first && call.method === 'eth_getBlockByNumber').length, 0, 'no block reads are sent to the rate-limited peer');
  assert.equal(calls.filter(call => call.endpoint === first).length, 1, 'the 429 peer is cooled down after one probe, not retried in a loop');
  assert.ok(context.rpcDiagnostics().some(item => item.httpStatus === 429), 'the 429 is recorded as availability, not trust');
  const values = await context.readIdentity(snapshot, [{ method: 'eth_getStorageAt', params: [`0x${'1'.repeat(40)}`, `0x${'0'.repeat(64)}`, toHex(snapshot.blockNumber)] }]);
  assert.equal(values.length, 2, 'two independent identity peers still agree');
  assert.equal(calls.filter(call => call.endpoint === first).length, 1, 'no fan-out against the rate-limited peer');

  const start = 8000n, tip = start + 10n;
  const event = { eventName: 'Transfer', args: { from: `0x${'0'.repeat(40)}`, to: `0x${'1'.repeat(40)}`, tokenId: '1' }, blockNumber: String(start + 1n), blockHash: `0x${'11'.repeat(32)}`, logIndex: 0, transactionHash: `0x${'22'.repeat(32)}`, removed: false };
  const waits = [];
  let logCalls = 0;
  const makeReader = fail => ({ begin: async () => ({ blockNumber: tip, blockHash, timestamp: 1_800_000_000n }), hash: async () => blockHash, rangeError: () => false,
    block: async () => ({ hash: `0x${'11'.repeat(32)}`, timestamp: '1799999000' }),
    logs: async () => { logCalls += 1; if (fail === 'once' && logCalls === 1) throw Object.assign(new Error('RPC unavailable; waiting for endpoint cooldown'), { name: 'RpcAvailabilityError', httpStatus: 429, retryAfterMs: 500 }); if (fail === 'always') throw Object.assign(new Error('account banned'), { name: 'RpcAvailabilityError', httpStatus: 403 }); return [event]; },
    network: async () => ({ totalSupply: '1', policy: { maximumLevel: 10, mergesOpen: true, levels: [{ level: 1, basePower: '1000' }] }, core: { blockHeight: '100' } }),
    hydrate: async tokens => tokens.map(token => ({ chainOwner: token.chainOwner, owner: token.chainOwner, depositor: null, deposited: false, level: 1, nextMergeHeight: '0' })),
    finish: async () => {} });
  const profile = { ...getProfile(), key: 'test-429', startBlock: start, abiSet: 'v9' };
  const store = { get: async () => null, set: async () => {} };
  const service = createExploreIndex({ profile, store, reader: makeReader('once'), sleep: ms => { waits.push(ms); return Promise.resolve(); } });
  const state = await service.sync();
  assert.equal(state.status, 'complete', 'the scan completes instead of showing Retry');
  assert.deepEqual(waits, [500], 'it backs off for exactly Retry-After');
  assert.equal(logCalls, 2, 'one retry, then the next peer');

  const failing = createExploreIndex({ profile, store, reader: makeReader('always'), sleep: () => Promise.resolve() });
  await assert.rejects(failing.sync(), /account banned/, 'only rate limits back off; other failures still surface');
  console.log('PASS 429: first peer rate-limits — Retry-After backoff, cooldown, peer failover, Explore completes; non-rate-limit failures still fail');
} finally {
  globalThis.fetch = realFetch;
}
