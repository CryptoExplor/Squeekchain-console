import { test, expect } from '@playwright/test';

test('offline browser: Wheelhouse identity, default/saved themes, mobile visibility, keyboard and failure localization', async ({ page }) => {
  // Offline layout test, NEVER evidence of live RPC availability or live qualification.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page).toHaveTitle(/Wheelhouse/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#profile-select')).toHaveValue('sepolia-v6');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['wallet-chip', 'verified-chip', 'btn-connect', 'profile-select']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByText('Connection & trust', { exact: true }).click();
  await expect(page.locator('#rpc-url')).toBeVisible();
  await page.locator('#rpc-url').fill('http://not-secure.test');
  await page.locator('#btn-save-rpc').click();
  await expect(page.locator('#banner')).toContainText('HTTPS');
  await page.selectOption('#profile-select', 'sepolia');
  await expect(page.locator('#profile-notice')).toContainText('read-only (unverified)');
  await expect(page.locator('#btn-checkpoint')).toBeDisabled();
  await expect(page.locator('#tool-call')).not.toContainText('squeek_request_merge');
  await page.selectOption('#profile-select', 'mainnet');
  await expect(page.locator('#not-deployed')).toBeVisible();
  await expect(page.locator('#not-deployed-note')).toContainText('no mainnet deployment');
  await expect(page.locator('#deployment-content')).toBeHidden();
  await expect(page.locator('#btn-connect')).toBeHidden();
  await expect(page.locator('#btn-checkpoint')).toBeHidden();
  await expect(page.locator('#btn-checkpoint')).toBeDisabled();
  await expect(page.locator('#net-round')).toHaveText('—');
  await page.keyboard.press('Control+Home');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeInViewport();
  await page.screenshot({ path: 'test-results/wheelhouse-mobile.png', fullPage: true });
  await page.evaluate(() => window.squeek.destroy());
});

// Injected, deterministic adapters intentionally IGNORE cancellation. This proves
// generation checks discard late results even when an EIP-1193 provider cannot abort.
async function installRaceHarness(page) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.squeek);
  await page.evaluate(async () => {
    window.squeek.destroy();
    const { mount } = await import('/app.js');
    const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
    const network = round => ({ core: { settledThroughRound: String(round), blockHeight: '100', paused: false }, mining: { lagRounds: '0', minted: { sqk: '1' } }, nft: { totalSupply: '2' }, checkpoint: { canCheckpoint: true, nextRound: '2' } });
    const h = window.races = { loads: [], reads: [], sims: [], pendingNetwork: false, pendingSimulation: false, sends: 0, network };
    window.ethereum = { request: async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [owner];
      if (method === 'eth_chainId') return '0xaa36a7';
      if (method === 'eth_sendTransaction') { h.sends++; throw new Error('No signing in browser regression tests'); }
      throw new Error(`Unexpected wallet method ${method}`);
    }, on() {} };
    const holdings = { owner, ethBalance: { eth: '0.1' }, totals: { count: 1, power: '1000', sharePercent: 1, claimable: { sqk: '1' } }, squeeks: [{ tokenId: '1', level: 1, claimable: { sqk: '1' } }] };
    window.squeek = mount({ adapterFactory: (profileKey, load) => {
      h.loads.push({ profileKey, ...load });
      return {
        networkStatus: async () => h.pendingNetwork ? new Promise(resolve => h.reads.push({ profileKey, ...load, resolve })) : network('10'),
        verify: async () => ({ ok: true, trusted: profileKey === 'sepolia-v6', problems: [] }),
        walletStatus: async () => holdings,
        claimPreview: async () => h.pendingSimulation ? new Promise(resolve => h.sims.push({ ...load, resolve })) : { ok: false, reason: 'Fixture stops before signing' },
      };
    }, fetcher: async () => ({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) }) });
    await window.squeek.refresh();
    await window.squeek.connect();
  });
}

test('switch during pending RPC: abort the load and discard old-profile data', async ({ page }) => {
  await installRaceHarness(page);
  await page.evaluate(() => {
    window.races.pendingNetwork = true;
    window.squeek.state.receipts.push({ hash: 'old-profile-receipt' });
    document.getElementById('claim-result').textContent = 'old claim output';
    window.pendingRead = window.squeek.refresh();
  });
  await page.waitForFunction(() => window.races.reads.length === 1);
  await page.selectOption('#profile-select', 'mainnet');
  await expect(page.locator('#not-deployed')).toBeVisible();
  await expect(page.locator('#verified-chip')).toHaveText('not deployed');
  await expect(page.locator('#deployment-content')).toBeHidden();
  expect(await page.evaluate(() => window.races.reads[0].signal.aborted)).toBe(true);
  await page.evaluate(async () => {
    window.races.reads[0].resolve(window.races.network('999'));
    await window.pendingRead;
  });
  await expect(page.locator('#net-round')).toHaveText('—');
  await expect(page.locator('#claim-result')).toBeEmpty();
  await expect(page.locator('#squeeks-tbody')).toBeEmpty();
  expect(await page.evaluate(() => [window.squeek.state.account, window.squeek.state.inspected, window.squeek.state.status, window.squeek.state.plan, window.squeek.state.receipts.length])).toEqual([null, null, null, null, 0]);
  await page.evaluate(() => window.squeek.destroy());
});

test('three rapid switches: only the final generation may render', async ({ page }) => {
  await installRaceHarness(page);
  await page.evaluate(() => { window.races.pendingNetwork = true; });
  await page.selectOption('#profile-select', 'sepolia');
  await page.selectOption('#profile-select', 'sepolia-v6');
  await page.selectOption('#profile-select', 'sepolia');
  await page.waitForFunction(() => window.races.reads.length === 3);
  expect(await page.evaluate(() => window.races.reads.map(read => read.signal.aborted))).toEqual([true, true, false]);
  expect(await page.evaluate(() => new Set(window.races.reads.map(read => read.generation)).size)).toBe(3);
  await page.evaluate(() => {
    window.races.reads[1].resolve(window.races.network('200'));
    window.races.reads[0].resolve(window.races.network('100'));
  });
  await expect(page.locator('#net-round')).toHaveText('—');
  await page.evaluate(() => { window.races.reads[2].resolve(window.races.network('300')); });
  await expect(page.locator('#net-round')).toHaveText('300');
  await expect(page.locator('#net-kind')).toHaveText('read-only (unverified)');
  await expect(page.locator('#verified-chip')).toHaveText('read-only (unverified)');
  await page.evaluate(() => window.squeek.destroy());
});

test('switch during simulation: discard the preview and never open a wallet or confirmation', async ({ page }) => {
  await installRaceHarness(page);
  await page.evaluate(() => { window.races.pendingSimulation = true; window.squeek.selectTab('holdings'); });
  await page.locator('#btn-claim').click();
  await page.waitForFunction(() => window.races.sims.length === 1);
  expect(await page.evaluate(() => window.squeek.state.busy)).toBe(false);
  await page.selectOption('#profile-select', 'mainnet');
  await page.evaluate(() => {
    const sim = window.races.sims[0];
    if (!sim.signal.aborted) throw new Error('Simulation load was not aborted');
    sim.resolve({ ok: true, total: { sqk: '1' }, batches: [{ tx: {}, tokenIds: ['1'], amount: { base: '1' } }] });
  });
  await expect(page.locator('#verified-chip')).toHaveText('not deployed');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#claim-result')).toBeEmpty();
  await expect(page.locator('#deployment-content')).toBeHidden();
  expect(await page.evaluate(() => window.races.sends)).toBe(0);
  await page.evaluate(() => window.squeek.destroy());
});
