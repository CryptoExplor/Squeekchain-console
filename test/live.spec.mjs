import { test, expect } from '@playwright/test';
import { PUBLIC_RPCS } from '../sdk/rpc.js';
import { observeLiveRpc } from './live-network.mjs';

for (const profile of ['sepolia-v6','sepolia-v9']) test(`real browser: public CORS Sepolia RPCs and ${profile} same-block verification/reads`, async ({ page }, testInfo) => {
  const network = observeLiveRpc(page, PUBLIC_RPCS);
  let toolResult;
  try {
    // NO mocked RPC responses, bypassed verification or signing in this qualification check.
    await page.goto(`/#${profile}/network`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#profile-select')).toHaveValue(profile);
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
    const result = toolResult = await page.evaluate(profile => window.squeek.callTool('squeek_network_status',{profile}),profile);
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
  } finally {
    await testInfo.attach('rpc-network-diagnostics.json', { body: JSON.stringify(await network.evidence(), null, 2), contentType: 'application/json' });
    if (toolResult?.diagnostics) await testInfo.attach('rpc-tool-diagnostics.json', { body: JSON.stringify(toolResult.diagnostics, null, 2), contentType: 'application/json' });
  }
});
