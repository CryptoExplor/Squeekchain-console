import { test, expect } from '@playwright/test';
import { PUBLIC_RPCS } from '../sdk/rpc.js';

test('real browser: public CORS Sepolia RPCs, same-block identity verification and supported network reads', async ({ page }, testInfo) => {
  // NO mocked RPC responses, bypassed verification or signing in this qualification check.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#profile-select')).toHaveValue('sepolia-v6');
  const evidence = await page.evaluate(async urls => {
    async function rpc(url, method, params = []) {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body.error || body.result == null) throw new Error(body.error?.message ?? 'Missing result');
      return body.result;
    }
    const endpoints = await Promise.all(urls.map(async url => {
      try {
        const chainId = await rpc(url, 'eth_chainId');
        if (chainId.toLowerCase() !== '0xaa36a7') return { url, error: `Wrong chain ${chainId}` };
        return { url, chainId, head: await rpc(url, 'eth_blockNumber') };
      } catch (error) { return { url, error: error.message }; }
    }));
    const available = endpoints.filter(endpoint => endpoint.head);
    if (available.length < 2) return { endpoints, error: 'Need at least two public CORS Sepolia RPCs' };
    const head = available.reduce((min, endpoint) => BigInt(endpoint.head) < min ? BigInt(endpoint.head) : min, BigInt(available[0].head));
    const blockNumber = `0x${(head - 12n).toString(16)}`;
    const blocks = await Promise.all(available.map(async endpoint => {
      try {
        const block = await rpc(endpoint.url, 'eth_getBlockByNumber', [blockNumber, false]);
        return { url: endpoint.url, number: block.number, hash: block.hash };
      } catch (error) { return { url: endpoint.url, error: error.message }; }
    }));
    return { endpoints, blockNumber, blocks };
  }, PUBLIC_RPCS);
  await testInfo.attach('public-rpc-evidence.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  expect(evidence.error, JSON.stringify(evidence)).toBeUndefined();
  const blocks = evidence.blocks.filter(block => block.hash);
  expect(blocks.length).toBeGreaterThanOrEqual(2);
  expect(new Set(blocks.map(block => block.hash.toLowerCase())).size).toBe(1);
  for (const block of blocks) expect(BigInt(block.number)).toBe(BigInt(evidence.blockNumber));

  await page.waitForFunction(() => window.squeek);
  const result = await page.evaluate(() => window.squeek.callTool('squeek_network_status'));
  await testInfo.attach('verified-network-snapshot.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.error, JSON.stringify(result)).toBeUndefined();
  expect(result.chainId).toBe(11155111);
  expect(result.verification.ok).toBe(true);
  expect(result.verification.trusted).toBe(true);
  expect(result.snapshot.blockHash).toMatch(/^0x[0-9a-f]{64}$/i);
  expect(result.verification.blockNumber).toBe(result.snapshot.blockNumber);
  expect(BigInt(result.core.settledThroughRound)).toBeGreaterThan(0n);
  expect(Number(result.policy.maximumLevel)).toBe(10);
  // Deliberately no fixed settlement frontier, supply count or wallet inventory assumption.
  await page.evaluate(() => window.squeek.destroy());
  console.log('LIVE QUALIFICATION PASS: real browser CORS, two-public-RPC block agreement, published same-block identities/runtime hashes/configuration/wiring and network reads. No transaction submitted.');
});
