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
  await expect(page.getByTestId('profile-select')).toHaveValue('sepolia-v9');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['profile-status', 'btn-connect', 'profile-select']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByTestId('wallet-chip')).toHaveCount(0);
  await expect(page.getByTestId('wallet-button')).toHaveText('Connect wallet');
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('rpc-url')).toBeVisible();
  await page.getByTestId('rpc-url').fill('http://not-secure.test');
  await page.getByTestId('btn-save-rpc').click();
  await expect(page.getByTestId('banner')).toContainText('HTTPS');
  await page.getByTestId('settings-sheet').getByTestId('sheet-close').click();
  await page.selectOption('#profile-select', 'sepolia-v9');
  await expect(page.getByTestId('profile-select')).toHaveValue('sepolia-v9');
  await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();
  await expect(page.getByTestId('tool-call').locator('option[value="squeek_request_merge"]')).toHaveCount(1);
  await page.selectOption('#profile-select', 'mainnet');
  await expect(page.getByTestId('not-deployed')).toBeVisible();
  await expect(page.getByTestId('not-deployed-note')).toContainText('no mainnet deployment');
  await expect(page.getByTestId('deployment-content')).toBeHidden();
  await expect(page.getByTestId('wallet-button')).toBeVisible();
  await expect(page.getByTestId('btn-menu-connect')).toBeHidden();
  await expect(page.getByTestId('btn-checkpoint')).toBeHidden();
  await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();
  await expect(page.getByTestId('net-round')).toHaveText('Unknown');
  await page.keyboard.press('Control+Home');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('main-content')).toBeInViewport();
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
    localStorage.setItem('squeekchain:profile','sepolia-v6'); history.replaceState(null,'','#sepolia-v6/network');
    const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
    const network = round => ({ core: { settledThroughRound: String(round), blockHeight: '100', paused: false }, mining: { lagRounds: '0', minted: { sqk: '1' } }, nft: { totalSupply: '2' }, checkpoint: { canCheckpoint: true, nextRound: '2' } });
    const h = window.races = { loads: [], reads: [], sims: [], pendingNetwork: false, pendingSimulation: false, sends: 0, network };
    window.ethereum = { request: async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [owner];
      if (method === 'eth_chainId') return '0xaa36a7';
      if (method === 'eth_sendTransaction') { h.sends++; if (h.allowSend) return new Promise(resolve => { h.resolveSend = resolve; }); throw new Error('No signing in browser regression tests'); }
      throw new Error(`Unexpected wallet method ${method}`);
    }, on() {} };
    const holdings = { owner, ethBalance: { eth: '0.1' }, totals: { count: 1, power: '1000', sharePercent: 1, claimable: { sqk: '1' } }, squeeks: [{ tokenId: '1', level: 1, claimable: { sqk: '1' } }] };
    window.squeek = mount({ profileBalanceReader: async () => ({"sepolia-v6":{"wallet":"0","staked":"0","nftPower":"0"},"sepolia-v9":{"wallet":"0","staked":"0","nftPower":"0"}}), activityReader: async () => new Promise(resolve => { h.resolveReceipt = resolve; }), adapterFactory: (profileKey, load) => {
      h.loads.push({ profileKey, ...load });
      return {
        networkStatus: async () => h.pendingNetwork ? new Promise(resolve => h.reads.push({ profileKey, ...load, resolve })) : h.network('10'),
        verify: async () => ({ ok: true, trusted: true, problems: [] }),
        walletStatus: async () => holdings,
        checkpointPreview: async () => ({ ok: true, tx: { to: owner, data: '0xc2c4c5c1', value: '0' }, gas: '100' }),
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
  await expect(page.getByTestId('not-deployed')).toBeVisible();
  await expect(page.getByTestId('verified-chip')).toHaveText('Not deployed');
  await expect(page.getByTestId('deployment-content')).toBeHidden();
  expect(await page.evaluate(() => window.races.reads[0].signal.aborted)).toBe(true);
  await page.evaluate(async () => {
    window.races.reads[0].resolve(window.races.network('999'));
    await window.pendingRead;
  });
  await expect(page.getByTestId('net-round')).toHaveText('Unknown');
  await expect(page.getByTestId('claim-result')).toBeEmpty();
  await expect(page.getByTestId('squeeks-tbody')).toBeEmpty();
  expect(await page.evaluate(() => [window.squeek.state.account, window.squeek.state.inspected, window.squeek.state.status, window.squeek.state.plan, window.squeek.state.receipts.length])).toEqual(['0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54', '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54', null, null, 0]);
  await page.evaluate(() => window.squeek.destroy());
});

test('three rapid switches: only the final generation may render', async ({ page }) => {
  await installRaceHarness(page);
  await page.evaluate(() => { window.races.pendingNetwork = true; });
  await page.selectOption('#profile-select', 'sepolia-v9');
  await page.selectOption('#profile-select', 'sepolia-v6');
  await page.selectOption('#profile-select', 'sepolia-v9');
  await page.waitForFunction(() => window.races.reads.length === 3);
  expect(await page.evaluate(() => window.races.reads.map(read => read.signal.aborted))).toEqual([true, true, false]);
  expect(await page.evaluate(() => new Set(window.races.reads.map(read => read.generation)).size)).toBe(3);
  await page.evaluate(() => {
    window.races.reads[1].resolve(window.races.network('200'));
    window.races.reads[0].resolve(window.races.network('100'));
  });
  await expect(page.getByTestId('net-round')).toHaveText('Unknown');
  await page.evaluate(() => { window.races.reads[2].resolve(window.races.network('300')); });
  await expect(page.getByTestId('net-round')).toHaveText('300');
  // The baseline Kind stat is shared by equal profiles; retain explicit profile/generation checks.
  expect(await page.evaluate(() => window.squeek.state.profileKey)).toBe('sepolia-v9');
  await expect(page.getByTestId('profile-select')).toHaveValue('sepolia-v9');
  await expect(page.getByTestId('net-kind')).toHaveText('deployed');
  await expect(page.getByTestId('verified-chip')).toHaveText('Verified');
  await page.evaluate(() => window.squeek.destroy());
});

test('switch during simulation: discard the preview and never open a wallet or confirmation', async ({ page }) => {
  await installRaceHarness(page);
  await page.evaluate(() => { window.races.pendingSimulation = true; window.squeek.selectTab('holdings'); });
  await page.getByTestId('btn-claim').click();
  await page.waitForFunction(() => window.races.sims.length === 1);
  expect(await page.evaluate(() => window.squeek.state.busy)).toBe(false);
  await page.selectOption('#profile-select', 'mainnet');
  await page.evaluate(() => {
    const sim = window.races.sims[0];
    if (!sim.signal.aborted) throw new Error('Simulation load was not aborted');
    sim.resolve({ ok: true, total: { sqk: '1' }, batches: [{ tx: {}, tokenIds: ['1'], amount: { base: '1' } }] });
  });
  await expect(page.getByTestId('verified-chip')).toHaveText('Not deployed');
  await expect(page.getByTestId('modal')).toBeHidden();
  await expect(page.getByTestId('claim-result')).toBeEmpty();
  await expect(page.getByTestId('deployment-content')).toBeHidden();
  expect(await page.evaluate(() => window.races.sends)).toBe(0);
  await page.evaluate(() => window.squeek.destroy());
});

test('broadcast Activity survives a profile switch, late wallet response and page reload', async ({ page }) => {
  await installRaceHarness(page);
  const hash = `0x${'ab'.repeat(32)}`;
  await page.evaluate(() => { window.races.allowSend = true; window.pendingSend = window.squeek.requestCheckpoint(); });
  await page.waitForFunction(() => window.races.sends === 1);
  await page.selectOption('#profile-select', 'mainnet');
  await expect(page.getByTestId('deployment-content')).toBeHidden();
  // Wallet response arrives AFTER navigation. It must still be persisted and tracked.
  await page.evaluate(hash => { window.races.resolveSend(hash); }, hash);
  await page.waitForFunction(() => window.races.resolveReceipt);
  await page.getByTestId('wallet-button').click();
  await page.getByTestId('btn-open-activity').click();
  await expect(page.getByTestId('activity-drawer')).toBeVisible();
  await expect(page.locator('#activity-list a')).toHaveAttribute('href', `https://eth-sepolia.blockscout.com/tx/${hash}`);
  expect(await page.evaluate(() => window.squeek.state.receipts)).toEqual([]);
  await page.evaluate(hash => {
    window.races.resolveReceipt({ receipt: { transactionHash: hash, blockHash: `0x${'cd'.repeat(32)}`, blockNumber: 50n, status: 'success' }, confirmations: 12n });
  }, hash);
  await expect(page.getByTestId('activity-list')).toContainText('confirmed');
  expect(await page.evaluate(async () => (await window.pendingSend).reason)).toBe('profile-changed');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wheelhouse:pending-transactions:v1'))[0])).toMatchObject({ hash, chain: 'Sepolia', label: 'Checkpoint', profile:'sepolia-v6' });
  await page.reload();
  await expect(page.getByTestId('not-deployed')).toBeVisible();
  await page.getByTestId('wallet-button').click();
  await page.getByTestId('btn-open-activity').click();
  await expect(page.getByTestId('activity-drawer')).toBeVisible();
  await expect(page.locator('#activity-list a')).toHaveAttribute('href', `https://eth-sepolia.blockscout.com/tx/${hash}`);
  await page.evaluate(() => window.squeek.destroy());
});


test('v6 settlement stall uses configuration and snapshot time, not checkpoint lag', async ({page}) => {
  await installRaceHarness(page);
  await page.evaluate(async()=>{
    const h=races,original=h.network;h.frontier='1973';h.expected='1976';h.ready=false;
    h.network=()=>({...original(h.frontier),core:{...original(h.frontier).core,genesisTimestamp:'1000',roundDuration:'600'},snapshot:{timestamp:String(1000n+BigInt(h.expected)*600n)},checkpoint:{canCheckpoint:h.ready,roundSettled:h.ready}});
    await squeek.refresh();
  });
  await page.getByTestId('tab-network').click();
  await expect(page.getByTestId('settlement-notice')).toHaveText('Rewards paused: settlement stopped at round 1973.');
  await page.getByTestId('tab-squeeks').click();
  await expect(page.getByTestId('holder-rewards-notice')).toBeVisible();
  await expect(page.getByTestId('btn-claim')).toBeEnabled();
  await page.setViewportSize({width:320,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(async()=>{races.expected='1975';await squeek.refresh();});
  await expect(page.getByTestId('holder-rewards-notice')).toBeHidden();
  await expect(page.getByTestId('settlement-notice')).toBeHidden();
  await page.evaluate(async()=>{races.expected='1976';races.ready=true;await squeek.refresh();});
  await expect(page.getByTestId('holder-rewards-notice')).toBeVisible();
  await page.evaluate(async()=>{races.frontier='1976';await squeek.refresh();});
  await expect(page.getByTestId('holder-rewards-notice')).toBeHidden();
  await page.evaluate(async()=>{races.frontier='1973';await squeek.refresh();races.network=()=>{throw new Error('RPC unavailable');};await squeek.refresh();});
  await expect(page.getByTestId('holder-rewards-notice')).toBeHidden();
  await page.getByTestId('profile-select').selectOption('mainnet');
  await expect(page.getByTestId('settlement-notice')).toHaveText('');
  await page.evaluate(()=>squeek.destroy());
});

test('offline browser wire: state TypeError/cooldown fail over through bundled transports', async ({ page }) => {
  const wire = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const request = route.request().postDataJSON();
    wire.push({ endpoint: url.origin, method: request?.method });
    if (url.hostname === 'sepolia.gateway.tenderly.co' && request?.method === 'eth_getStorageAt') return route.abort('failed');
    if (request?.method !== 'eth_chainId' && request?.method !== 'eth_getStorageAt') return route.abort();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id,
      result: request.method === 'eth_chainId' ? '0xaa36a7' : `0x${'00'.repeat(32)}` }) });
  });
  // No app auto-refresh or real RPC. Import the production browser bundle on the static origin.
  await page.goto('/health');
  const result = await page.evaluate(async () => {
    const { createRpcContext } = await import('/bundle.js');
    const context = createRpcContext({ rpcCooldowns: new Map() });
    const request = { address: '0x0000000000000000000000000000000000000001', slot: `0x${'00'.repeat(32)}`, blockNumber: 100n };
    const fromTypeError = await context.client.getStorageAt(request);
    const cooldowns = new Map(), rateLimited = createRpcContext({ rpcCooldowns: cooldowns });
    await rateLimited.client.getChainId();
    cooldowns.set('https://sepolia.gateway.tenderly.co/', Date.now() + 60_000);
    const fromCooldown = await rateLimited.client.getStorageAt(request);
    return { fromTypeError, fromCooldown, failures: context.rpcDiagnostics(), cooldownFailures: rateLimited.rpcDiagnostics() };
  });
  expect(result.fromTypeError).toBe(`0x${'00'.repeat(32)}`);
  expect(result.fromCooldown).toBe(result.fromTypeError);
  expect(wire.filter(call => call.method === 'eth_getStorageAt').map(call => call.endpoint)).toEqual([
    'https://sepolia.gateway.tenderly.co', 'https://ethereum-sepolia-rpc.publicnode.com', 'https://ethereum-sepolia-rpc.publicnode.com',
  ]);
  expect(result.failures.some(record => record.availability && record.method === 'eth_getStorageAt' && record.causeChain.some(cause => cause.name === 'TypeError'))).toBe(true);
  expect(result.cooldownFailures.some(record => record.causeChain.some(cause => cause.kind === 'cooldown'))).toBe(true);
});

test('offline design system: light/dark contrast, readable labels, theme state and focus', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => window.squeek);
  await page.evaluate(() => {
    window.squeek.destroy();
    const fixture = document.createElement('section');
    fixture.id = 'design-fixture'; fixture.className = 'panel';
    fixture.innerHTML = '<span class="muted">Secondary text</span> <span class="label">Onchain reads</span> <span class="chip ok">Verified</span> <span class="chip warn">Unknown</span> <span class="chip bad">Unavailable</span> <button class="btn btn-primary">Primary</button> <button class="btn btn-danger">Confirm burn</button>';
    document.querySelector('main').prepend(fixture);
  });
  const theme = page.getByRole('button', { name: 'Toggle theme' });
  const luminance = color => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => {
      const channel = Number(value) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const expectContrast = record => {
    const values = [luminance(record.color), luminance(record.background)].sort((a, b) => b - a);
    expect((values[0] + .05) / (values[1] + .05), `${record.label}: ${record.color} on ${record.background}`).toBeGreaterThanOrEqual(4.5);
  };
  for (const mode of ['light', 'dark']) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    await expect(theme).toHaveAttribute('aria-pressed', String(mode === 'dark'));
    const records = await page.evaluate(() => {
      const fixture = document.querySelector('#design-fixture');
      return [...fixture.children].map(node => {
        const style = getComputedStyle(node);
        return { label: node.className, color: style.color, background: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(fixture).backgroundColor : style.backgroundColor };
      });
    });
    records.forEach(expectContrast);
    expect(await page.locator('#design-fixture .label').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(11);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', mode === 'light' ? '#fafaf7' : '#10120f');
    for (const selector of ['.btn-primary', '.btn-danger']) {
      const button = page.locator(`#design-fixture ${selector}`);
      await button.hover();
      expectContrast(await button.evaluate(node => ({ label: `${node.className}:hover`, color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor })));
    }
    await theme.focus();
    await expect(theme).toBeFocused();
    expect(await theme.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(3);
    await theme.press('Enter');
  }
  await expect(theme).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.squeek.destroy());
});
