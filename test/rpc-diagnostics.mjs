import assert from 'node:assert/strict';
import { createPublicClient, custom, UnknownRpcError } from 'viem';
import { createRpcContext, PUBLIC_RPCS } from '../sdk/rpc.js';
import { RpcAvailabilityError, RpcTrustError, rpcCauses, isRpcAvailabilityError, rpcErrorDiagnostics, rpcToolError, withRpcContext } from '../sdk/rpc-errors.js';
import { observeLiveRpc } from './live-network.mjs';
import { EventEmitter } from 'node:events';

const [first, second] = PUBLIC_RPCS;
const realFetch = globalThis.fetch, word = `0x${'00'.repeat(32)}`;
let calls = [], failState = false, recheckFailure = false, wrongRecheckChain = false, afterState = false, programmingError = null;
globalThis.fetch = async (url, init) => {
  const request = JSON.parse(init.body), endpoint = new URL(url).origin;
  calls.push({ endpoint, method: request.method });
  let result;
  if (request.method === 'eth_chainId') {
    if (endpoint === first && afterState && wrongRecheckChain) result = '0x1';
    else if (endpoint === first && afterState && recheckFailure) throw new TypeError('Load failed');
    else result = '0xaa36a7';
  } else {
    assert.equal(request.method, 'eth_getStorageAt');
    if (endpoint === first && programmingError) throw programmingError;
    if (endpoint === first && failState) {
      afterState = true;
      if (recheckFailure || wrongRecheckChain) return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: 4444, message: 'pruned history unavailable' } }), { headers: { 'content-type': 'application/json' } });
      throw new TypeError('Load failed');
    }
    result = word;
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { headers: { 'content-type': 'application/json' } });
};
const read = context => context.client.getStorageAt({ address: '0x0000000000000000000000000000000000000001', slot: word, blockNumber: 100n });
try {
  const cooldowns = new Map(), context = createRpcContext({ rpcCooldowns: cooldowns });
  await context.client.getChainId();
  cooldowns.set(new URL(first).href, Date.now() + 60_000);
  calls = [];
  assert.equal(await read(context), word);
  assert.deepEqual(calls.filter(call => call.method === 'eth_getStorageAt').map(call => call.endpoint), [second]);
  assert.ok(context.rpcDiagnostics().some(record => record.method === 'eth_getStorageAt' && record.endpoint === first && record.causeChain.some(cause => cause.name === 'RpcAvailabilityError' && cause.kind === 'cooldown')));

  calls = []; failState = true;
  const transport = createRpcContext({ rpcCooldowns: new Map() });
  assert.equal(await read(transport), word);
  assert.deepEqual(calls.filter(call => call.method === 'eth_getStorageAt').map(call => call.endpoint), [first, second]);
  assert.ok(transport.rpcDiagnostics().some(record => record.method === 'eth_getStorageAt' && record.availability && record.causeChain.some(cause => cause.name === 'TypeError')));

  // viem wraps even fetch code bugs in HttpRequestError. This wrapper must not
  // turn a non-network TypeError into availability or hide it behind another peer.
  calls = []; programmingError = new TypeError('Cannot read properties of undefined');
  await assert.rejects(read(createRpcContext({ rpcCooldowns: new Map() })), error => {
    assert.equal(isRpcAvailabilityError(error), false);
    assert.ok(rpcCauses(error).some(item => item.error === programmingError));
    assert.match(rpcToolError(error).error, /Non-network TypeError/);
    return true;
  });
  assert.deepEqual(calls, [{ endpoint: first, method: 'eth_chainId' }, { endpoint: first, method: 'eth_getStorageAt' }],
    'programming TypeError must stop at the first endpoint without re-probing or falling through');
  calls = [];
  await assert.rejects(createRpcContext({ provider: () => ({ request: async () => { throw programmingError; } }) }).client.getBlockNumber());
  assert.equal(calls.length, 0, 'wallet probe programming TypeError must not fall through to HTTP');
  programmingError = null;

  // A failing identity availability re-probe cannot erase the original method/code.
  calls = []; afterState = false; recheckFailure = true;
  const recheck = createRpcContext({ rpcCooldowns: new Map() });
  assert.equal(await read(recheck), word);
  const preserved = recheck.rpcDiagnostics().find(record => record.method === 'eth_getStorageAt' && record.causeChain.some(cause => cause.branch === 'chainId-recheck'));
  assert.equal(preserved.rpcCode, 4444);
  assert.ok(preserved.causeChain.some(cause => cause.name === 'TypeError'));

  // An actual wrong-chain re-probe must stop, not fall through to a healthy peer.
  calls = []; afterState = false; recheckFailure = false; wrongRecheckChain = true;
  await assert.rejects(read(createRpcContext({ rpcCooldowns: new Map() })), error => {
    const record = rpcErrorDiagnostics(error);
    assert.equal(record.trust, true); assert.equal(record.availability, false);
    assert.equal(record.method, 'eth_chainId');
    return true;
  });
  assert.equal(calls.some(call => call.endpoint === second), false);
  calls = [];
  const trustProbe = new Error('RPC unavailable', { cause: new RpcTrustError('snapshot block hash mismatch') });
  await assert.rejects(createRpcContext({ provider: () => ({ request: async () => { throw trustProbe; } }) }).client.getBlockNumber(), error => rpcErrorDiagnostics(error).trust);
  assert.equal(calls.length, 0, 'nested trust failure in wallet identity probe must not fall through to HTTP');
} finally { globalThis.fetch = realFetch; }

for (const root of [new TypeError('Load failed'), new TypeError('Failed to fetch'), new TypeError('NetworkError when attempting to fetch resource.'), new TypeError('fetch failed'), new Error('RPC rate limited; waiting for Retry-After backoff')]) {
  assert.equal(isRpcAvailabilityError(new UnknownRpcError(new UnknownRpcError(root))), true);
}
for (const message of ['Cannot read properties of undefined', "Cannot read properties of undefined (reading 'failed to fetch')", 'Invalid URL', 'unexpected failure']) {
  const bug = new TypeError(message);
  const wrapped = new UnknownRpcError(withRpcContext(bug, { endpoint: first, method: 'eth_call' }));
  assert.equal(isRpcAvailabilityError(wrapped), false, 'non-network TypeErrors stay fatal through nested causes');
  const misleadingWrapper = new RpcAvailabilityError(bug, { endpoint: first, method: 'eth_call' });
  assert.equal(isRpcAvailabilityError(misleadingWrapper), false, 'availability wrappers cannot soften a programming TypeError');
}
const typed = new RpcAvailabilityError(new TypeError('Load failed'), { endpoint: first, method: 'eth_getStorageAt', kind: 'transport' });
const customClient = createPublicClient({ transport: custom({ request: async () => { throw typed; } }, { retryCount: 0 }) });
await assert.rejects(customClient.request({ method: 'eth_getStorageAt' }), error => error === typed, 'typed BaseError must survive custom transport without UnknownRpcError replacement');
for (const message of ['RPC chainId is not Sepolia', 'snapshot block hash mismatch', 'Deployment mismatch: mining implementation']) {
  const trust = new RpcTrustError(message);
  trust.cause = typed;
  const wrapped = new UnknownRpcError(trust);
  assert.equal(isRpcAvailabilityError(wrapped), false, 'trust always outranks availability');
}
const reverted = Object.assign(new Error('execution reverted: historical state unavailable'), { code: 3 });
assert.equal(isRpcAvailabilityError(withRpcContext(reverted, { endpoint: first, method: 'eth_call' })), false);
const cyclic = new Error('Load failed'); cyclic.cause = cyclic;
assert.ok(rpcErrorDiagnostics(cyclic).causeChain.length <= 48);

const secret = 'DO_NOT_LEAK_RPC_KEY';
const privateUrl = `https://user:${secret}@rpc.example/v3/${secret}?key=${secret}`;
const original = Object.assign(new Error(`Request to ${privateUrl}; Authorization: Bearer ${secret}; request body ${secret}`), { name: 'HttpRequestError', status: 429, headers: { Authorization: secret } });
const safe = rpcToolError(withRpcContext(original, { endpoint: privateUrl, method: 'eth_call', status: 429 }));
assert.equal(safe.diagnostics.endpoint, 'https://rpc.example');
assert.equal(safe.diagnostics.method, 'eth_call'); assert.equal(safe.diagnostics.httpStatus, 429);
assert.equal(JSON.stringify(safe).includes(secret), false);
assert.equal(JSON.stringify(safe).includes('Authorization'), false);
original.name = secret;
assert.equal(JSON.stringify(rpcToolError(withRpcContext(original, { endpoint: privateUrl, method: 'eth_call' }))).includes(secret), false, 'unrecognized provider error names are not serialized');
const fatalRecheck = rpcToolError(withRpcContext(new RpcTrustError('RPC chainId is not Sepolia'), {
  endpoint: first, method: 'eth_chainId', kind: 'chain-identity', priorError: typed,
}));
assert.equal(fatalRecheck.diagnostics.trust, true);
assert.equal(fatalRecheck.diagnostics.availability, false);
assert.match(fatalRecheck.error, /chain identity mismatch/);
assert.equal(fatalRecheck.diagnostics.method, 'eth_chainId');
console.log('PASS typed RPC errors: first state cooldown/network TypeError failover, programming TypeError hard stop, nested UnknownRpcError causes, original failure + recheck retention, trust/revert stop and redacted endpoint/method/status diagnostics');

// Passive network observer is exercised without launching a browser or any RPC.
const page = new EventEmitter(), observer = observeLiveRpc(page, [privateUrl]);
const request = { url: () => privateUrl, method: () => 'POST', postData: () => JSON.stringify({ method: 'eth_call', params: [secret] }), failure: () => ({ errorText: 'net::ERR_FAILED' }) };
page.emit('request', request);
page.emit('response', { request: () => request, status: () => 200, ok: () => true, json: async () => ({ error: { code: -32000, message: `Forbidden key ${secret}` } }) });
page.emit('response', { request: () => ({ ...request }), status: () => 429, ok: () => false, json: async () => { throw new Error(secret); } });
page.emit('requestfailed', request);
page.emit('console', { text: () => `Access to ${privateUrl} blocked by CORS policy` });
const network = await observer.evidence();
assert.equal(network.requests.find(record => record.outcome === 'json-rpc-error').httpStatus, 200);
assert.equal(network.requests.find(record => record.outcome === 'browser-network-error').httpStatus, null);
assert.equal(network.requests.find(record => record.outcome === 'http-error').httpStatus, 429);
assert.deepEqual(network.browserReportedCorsRejections, ['https://rpc.example']);
assert.equal(JSON.stringify(network).includes(secret), false);
console.log('PASS live network evidence: HTTP/JSON-RPC vs browser network failures, explicit CORS signals, no params/headers/URL credentials in attachments');

// A fetch failure is shared backoff, not a fresh fetch/re-probe on every refresh.
{
 const original=globalThis.fetch,cooldowns=new Map();let clock=1000,fetches=0;
 globalThis.fetch=async()=>{fetches++;throw new TypeError('Failed to fetch');};
 try {
  const make=()=>createRpcContext({rpcCooldowns:cooldowns,now:()=>clock}).client;
  await assert.rejects(make().getBlockNumber());const firstCount=fetches;assert.ok(firstCount>0);
  await assert.rejects(make().getBlockNumber());assert.equal(fetches,firstCount,'shared network cooldown prevents repeated fetches across contexts');
  clock+=30000;await assert.rejects(make().getBlockNumber());assert.ok(fetches>firstCount,'network endpoints become eligible after bounded cooldown');
 }finally{globalThis.fetch=original;}
}
console.log('PASS network fetch/CORS-like failures: shared 30s cooldown, no hot re-probes, bounded recovery (not CORS attribution)');
