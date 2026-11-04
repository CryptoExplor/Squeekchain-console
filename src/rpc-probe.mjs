#!/usr/bin/env node
// Diagnostic only: no wallet, keys, signing or full deployment qualification.
import {anySignal} from '../sdk/cancellation.js';
import { pathToFileURL } from 'node:url';
import { encodeEventTopics, toHex } from 'viem';
import { PUBLIC_RPCS, requireSepolia } from '../sdk/rpc.js';
import { DEPLOYMENT } from '../sdk/record.js';
import { IMPLEMENTATION_SLOT } from '../sdk/verify.js';
import { nftAbi } from '../sdk/abi.js';

export async function rpcRequest(url, method, params = []) {
  const deadline=anySignal([],15000);
  try {
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal:deadline.signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${body.error.code}: ${body.error.message}`);
  if (body.result == null) throw new Error('Missing result');
  return body.result;
  } finally { deadline.dispose(); }
}

/** Probe one endpoint independently; a failed capability does not hide the others. */
export async function probeEndpoint(url, request = rpcRequest) {
  const row = { endpoint: url, chainId: 'not checked', 'head-12 block': 'not checked', 'mining slot': 'not checked', '10k Transfer logs': 'not checked' };
  const failure = error => `FAIL: ${error.message}`;
  let at;
  try {
    const id = await request(url, 'eth_chainId');
    row.chainId = id;
    requireSepolia(id);
  } catch (error) {
    row.chainId = failure(error);
    return row;
  }
  try {
    const head = BigInt(await request(url, 'eth_blockNumber'));
    if (head < 12n) throw new Error('Head is below 12');
    at = head - 12n;
  } catch (error) {
    row['head-12 block'] = failure(error);
    return row;
  }
  const block = toHex(at);
  await Promise.all([
    (async () => {
      try {
        const result = await request(url, 'eth_getBlockByNumber', [block, false]);
        if (BigInt(result.number) !== at || !/^0x[0-9a-f]{64}$/i.test(result.hash ?? '')) throw new Error('Missing/invalid snapshot block');
        row['head-12 block'] = `OK: ${at}`;
      } catch (error) { row['head-12 block'] = failure(error); }
    })(),
    (async () => {
      try {
        const result = await request(url, 'eth_getStorageAt', [DEPLOYMENT.mining, IMPLEMENTATION_SLOT, block]);
        const expected = `0x${'0'.repeat(24)}${DEPLOYMENT.implementations.mining.slice(2)}`;
        if (result.toLowerCase() !== expected.toLowerCase()) throw new Error('Mining implementation slot differs from pinned record');
        row['mining slot'] = 'OK: pinned implementation';
      } catch (error) { row['mining slot'] = failure(error); }
    })(),
    (async () => {
      try {
        const logs = await request(url, 'eth_getLogs', [{
          address: DEPLOYMENT.nft, fromBlock: toHex(at >= 9_999n ? at - 9_999n : 0n), toBlock: block,
          topics: encodeEventTopics({ abi: nftAbi, eventName: 'Transfer' }),
        }]);
        if (!Array.isArray(logs)) throw new Error('Invalid log result');
        row['10k Transfer logs'] = `OK: ${logs.length} logs`;
      } catch (error) { row['10k Transfer logs'] = failure(error); }
    })(),
  ]);
  return row;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Public Sepolia RPC capability probe (15s timeout/request; diagnostic only).');
  console.table(await Promise.all(PUBLIC_RPCS.map(url => probeEndpoint(url))));
  console.log('Endpoints change often. This probe does not test browser CORS, peer agreement or the full graph; Phase 0 still requires npm run test:live.');
}
