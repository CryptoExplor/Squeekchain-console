import { ACTION_REASONS } from '../sdk/capabilities.js';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installReviewFixture } from './review-fixture.mjs';

async function capture(page, testInfo, name, locator = null, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  const image = locator ? await locator.screenshot({ animations: 'disabled' }) : await page.screenshot({ fullPage, animations: 'disabled' });
  await testInfo.attach(name, { body: image, contentType: 'image/png' });
  fs.writeFileSync(testInfo.outputPath(name), image);
  if (process.env.UPDATE_SCREENSHOTS === '1') fs.writeFileSync(path.resolve('docs/screenshots', name), image);
}

for (const theme of ['light', 'dark']) for (const width of [1280, 390]) for (const view of ['squeeks', 'network', 'info', 'settings', 'merge', 'mainnet']) {
  test(`mocked structure: ${view} / ${theme} / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installReviewFixture(page);
    if (theme === 'dark') await page.getByRole('button', { name: 'Toggle theme' }).click();
    if (view === 'squeeks' || view === 'merge') {
      await page.evaluate(() => window.squeek.connect());
      await expect(page.getByTestId('panel-squeeks')).toBeVisible();
      await expect(page.getByTestId('holder-count')).toHaveText('3');
      await expect(page.getByTestId('squeeks-tbody')).toContainText('Unknown');
      if (width === 390) {
        const cells = await page.getByTestId('squeeks-tbody').locator('tr').first().locator('td').evaluateAll(nodes => nodes.map(node => ({ label: node.dataset.label, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, display: getComputedStyle(node).display })));
        expect(cells).toHaveLength(7);
        for (const cell of cells) { expect(cell.left).toBeGreaterThanOrEqual(0); expect(cell.right).toBeLessThanOrEqual(width); expect(cell.display).toBe('flex'); }
      }
    }
    if (view === 'info') {
      await page.getByTestId('tab-info').click();
      await expect(page.getByTestId('panel-info')).toBeVisible();
      await expect(page.getByTestId('policy-table').locator('tbody tr')).toHaveCount(10);
      await expect(page.getByTestId('trust-block')).toHaveText('12101024');
    }
    if (view === 'settings') await page.getByTestId('settings-open').click();
    if (view === 'merge') {
      await page.getByTestId('merge-list').getByRole('button').click();
      await expect(page.getByTestId('modal')).toBeVisible();
      await page.getByTestId('modal-input').fill('BURN-41');
      await expect(page.getByTestId('btn-modal-confirm')).toBeDisabled();
      await page.getByTestId('modal-input').fill('BURN-42');
      await expect(page.getByTestId('btn-modal-confirm')).toBeEnabled();
    }
    if (view === 'mainnet') {
      await page.getByTestId('profile-select').selectOption('mainnet');
      await expect(page.getByTestId('not-deployed')).toBeVisible();
      await expect(page.getByTestId('deployment-content')).toBeHidden();
      await expect(page.getByTestId('wallet-button')).toBeVisible();
      await expect(page.getByTestId('btn-menu-connect')).toBeHidden();
      await expect(page.getByTestId('verified-chip')).toHaveText('Not deployed');
    }
    await expect(page.locator('.hero, .page-intro, .network-strip, .action-grid, .eyebrow')).toHaveCount(0);
    await expect(page.getByTestId('activity-drawer')).toBeHidden();
    await expect(page.getByTestId('capability-grid'))[view === 'info' ? 'toBeVisible' : 'toBeHidden']();
    await expect(page.getByRole('contentinfo')).toContainText('Independent community console · not affiliated with Squeekchain · Sepolia only · not investment advice');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.reviewCounters)).toEqual({ simulations: 0, sends: 0 });
    await capture(page, testInfo, `${view}-${theme}-${width}.png`, null, !['merge', 'settings'].includes(view));
    await page.evaluate(() => window.squeek.destroy());
  });
}

test('TokenCard keyboard opens isolated image; modal traps and restores focus', async ({ page }) => {
  await installReviewFixture(page);
  await page.evaluate(async () => { window.squeek.selectTab('art'); await window.squeek.loadArt(['41']); });
  const card = page.locator('[data-component="TokenCard"]');
  await card.focus(); await card.press('Enter');
  await expect(page.getByTestId('modal')).toBeVisible();
  await expect(page.getByTestId('modal-body').locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(page.getByTestId('modal-body').locator('svg, script')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(card).toBeFocused();
  await page.evaluate(() => window.squeek.destroy());
});

async function assertCompactHeader(page, width, connected) {
  const header = page.getByRole('banner');
  await expect(page.getByTestId('wallet-chip')).toHaveCount(0);
  await expect(page.getByTestId('wallet-eth'))[connected ? 'toHaveText' : 'toBeHidden'](...(connected?['ETH balance: 0.125 ETH']:[]));
  await expect(page.getByTestId('wallet-button')).toHaveAttribute('aria-label', connected ? 'Wallet menu' : 'Connect wallet');
  const geometry = await header.locator('select:visible, .chip:visible, .btn:visible').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
    return { id: node.id, x: rect.x, right: rect.right, y: rect.y, height: rect.height, radius: css.borderRadius };
  }));
  expect(geometry.filter(c => c.id === 'profile-status')).toHaveLength(1);
  expect(geometry.some(c => c.id === 'verified-chip')).toBe(false);
  await expect(page.getByTestId('verified-chip')).toHaveClass('sr-only');
  expect(new Set(geometry.map(c => c.radius)).size).toBe(1);
  for (const control of geometry) { expect(control.height, control.id).toBe(36); expect(control.x, control.id).toBeGreaterThanOrEqual(0); expect(control.right, control.id).toBeLessThanOrEqual(width); }
  for (const chip of await header.locator('.chip:visible').all()) expect(await chip.evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
  for (const id of ['btn-theme', 'btn-refresh', 'settings-open']) {
    const icon = page.getByTestId(id);
    expect((await icon.boundingBox()).width).toBe(36);
    await expect(icon.locator('svg')).toHaveAttribute('width', '18');
    await page.keyboard.press("Tab");
    await icon.focus();
    await expect(icon).toBeFocused();
    expect(await icon.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(3);
  }
  if (width >= 900) expect(new Set(geometry.map(c => Math.round(c.y))).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) for (const connected of [false, true]) {
  test(`header: ${theme} / ${width}px / ${connected ? 'connected' : 'disconnected'}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await installReviewFixture(page);
    if (theme === 'dark') await page.getByRole('button', { name: 'Toggle theme' }).click();
    if (connected) await page.evaluate(() => window.squeek.connect());
    await assertCompactHeader(page, width, connected);
    await page.evaluate(() => document.activeElement.blur());
    await capture(page, testInfo, `header-${connected ? 'connected' : 'disconnected'}-${theme}-${width}.png`, page.getByRole('banner'));
    if (connected) { await page.getByTestId('wallet-button').click(); await page.getByTestId('btn-disconnect').click(); await expect(page.getByTestId('wallet-chip')).toHaveCount(0); }
    await page.evaluate(() => window.squeek.destroy());
  });
}
for (const width of [900, 1024]) test(`header: single desktop row at ${width}px, connected across profiles`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await installReviewFixture(page);
  await assertCompactHeader(page, width, false); await page.evaluate(() => window.squeek.connect()); await assertCompactHeader(page, width, true);
  await page.getByTestId('profile-select').selectOption('sepolia-v9');
  await expect(page.getByTestId('verified-chip')).toHaveText('Verified');
  await expect(page.getByTestId('verified-chip')).toHaveText('Verified');
  await expect(page.getByTestId('verified-chip')).toHaveAttribute('title', /Pinned identities fully verified/);
  await assertCompactHeader(page, width, true); await page.evaluate(() => window.squeek.destroy());
});

test('structure: hash navigation, Trust shortcut, Info and watch address', async ({ page }) => {
  await installReviewFixture(page);
  await expect(page).toHaveURL(/#sepolia-v6\/network$/);
  await page.getByTestId('network-how-link').click();
  await expect(page).toHaveURL(/#sepolia-v6\/info\/how-it-works$/);
  await page.getByTestId('tab-info').click();
  await expect(page).toHaveURL(/#sepolia-v6\/info$/);
  await page.getByTestId('info-link-developers').click();
  await expect(page).toHaveURL(/#sepolia-v6\/info\/developers$/);
  await expect(page.getByTestId('tool-call')).toBeVisible();
  await page.getByTestId('profile-status').click();
  await expect(page).toHaveURL(/#sepolia-v6\/info\/trust$/);
  await expect(page.getByTestId('trust-block')).toBeVisible();
  await page.evaluate(async () => { window.reviewNetwork.core.paused = true; await window.squeek.refresh(); });
  await expect(page.getByTestId('info-reward-status')).toContainText(ACTION_REASONS.paused);
  await page.getByTestId('tab-squeeks').click();
  await page.getByTestId('watch-input').fill('0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54');
  await page.getByTestId('btn-watch').click();
  await expect(page.getByTestId('holder-count')).toHaveText('3');
  await expect(page.getByTestId('btn-claim')).toBeDisabled();
  await expect(page.getByTestId('btn-custom-merge')).toBeDisabled();
  await page.evaluate(() => { location.hash = 'art'; });
  await expect(page.getByTestId('panel-art')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('panel-squeeks')).toBeVisible();
  await page.evaluate(() => window.squeek.destroy());
});

test('structure: Settings sheet traps/restores focus; saved system theme follows OS', async ({ page }) => {
  await installReviewFixture(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByTestId('settings-open').click();
  const sheet = page.getByTestId('settings-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('theme-choice').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('squeekchain:theme'))).toBe('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await sheet.getByTestId('theme-choice').focus();
  await page.keyboard.press('Tab');
  await expect(sheet.getByTestId('sheet-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByTestId('theme-choice')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden(); await expect(page.getByTestId('settings-open')).toBeFocused();
  await page.evaluate(() => window.squeek.destroy());
});

test('structure: wallet menu copy, pending dot, Activity drawer and confirmed clear', async ({ page }) => {
  await installReviewFixture(page);
  await page.evaluate(async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedAddress = text; } } });
    await window.squeek.connect();
    window.squeek.activity.record('0x' + 'ab'.repeat(32), 'Mock claim');
  });
  await expect(page.getByTestId('wallet-eth')).toContainText('0.125 ETH');
  await page.getByTestId('wallet-button').click();
  await page.getByTestId('btn-copy-address').click();
  expect(await page.evaluate(() => window.copiedAddress)).toBe('0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54');
  await page.getByTestId('wallet-button').click();
  await expect(page.getByTestId('pending-count')).toHaveText('1');
  await page.getByTestId('btn-open-activity').click();
  await expect(page.getByTestId('activity-drawer')).toBeVisible();
  await expect(page.getByTestId('activity-list')).toContainText('Mock claim');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wallet-button')).toBeFocused();
  await page.getByTestId('settings-open').click();
  await page.getByTestId('btn-clear-activity').click();
  await expect(page.getByTestId('modal')).toBeVisible();
  await page.getByTestId('btn-modal-cancel').click();
  expect(await page.evaluate(() => window.squeek.activity.list().length)).toBe(1);
  await page.getByTestId('btn-clear-activity').click();
  await page.getByTestId('btn-modal-confirm').click();
  expect(await page.evaluate(() => window.squeek.activity.list().length)).toBe(0);
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('wallet-button').click(); await page.getByTestId('btn-disconnect').click();
  await expect(page).toHaveURL(/#sepolia-v6\/network$/);
  await expect(page.getByTestId('wallet-chip')).toHaveCount(0);
  await page.evaluate(() => window.squeek.destroy());
});

test('structure: RPC test is diagnostic only, save/remove and log cache clear', async ({ page }) => {
  await installReviewFixture(page);
  const methods = [];
  await page.route('https://custom-rpc.test/**', route => {
    const request = route.request().postDataJSON(); methods.push(request.method);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.method === 'eth_chainId' ? '0xaa36a7' : '0x64' }) });
  });
  await page.evaluate(() => { window.reviewRpcTest = true; });
  await page.getByTestId('settings-open').click();
  await page.getByTestId('rpc-url').fill('https://custom-rpc.test/');
  await page.getByTestId('btn-test-rpc').click();
  await expect(page.getByTestId('rpc-test-result')).toContainText('chainId 11155111 · block 100');
  expect(methods).toEqual(['eth_chainId', 'eth_blockNumber']);
  expect(await page.evaluate(() => localStorage.getItem('wheelhouse:rpc'))).toBeNull();
  await page.getByTestId('btn-save-rpc').click();
  await expect(page.getByTestId('settings-sheet')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('wheelhouse:rpc'))).toBe('https://custom-rpc.test/');
  await page.getByTestId('settings-open').click();
  await page.getByTestId('btn-remove-rpc').click();
  expect(await page.evaluate(() => localStorage.getItem('wheelhouse:rpc'))).toBe('');
  await page.getByTestId('settings-open').click();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('wheelhouse', 1); request.onupgradeneeded = () => request.result.createObjectStore('discovery'); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    await new Promise((resolve, reject) => { const tx = db.transaction('discovery', 'readwrite'); tx.objectStore('discovery').put({ ids: ['41'] }, 'test-clear'); tx.oncomplete = resolve; tx.onerror = reject; }); db.close();
  });
  await page.getByTestId('btn-clear-cache').click();
  await expect(page.getByTestId('cache-result')).toContainText('Log cache cleared');
  expect(await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('wheelhouse', 1); r.onsuccess = () => resolve(r.result); });
    const count = await new Promise(resolve => { const r = db.transaction('discovery').objectStore('discovery').count(); r.onsuccess = () => resolve(r.result); }); db.close(); return count;
  })).toBe(0);
  await page.evaluate(() => window.squeek.destroy());
});

test('structure: direct Info hash survives reload and Mainnet retains Info without chain panels', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/#sepolia-v6\/info/trust');
  await expect(page.getByTestId('panel-info')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#sepolia-v6\/info\/trust$/);
  await expect(page.getByTestId('panel-info')).toBeVisible();
  await page.getByTestId('profile-select').selectOption('mainnet');
  await expect(page.getByTestId('panel-info')).toBeVisible();
  await expect(page.getByTestId('deployment-content')).toBeHidden();
  await expect(page.getByTestId('contracts-list').locator('a')).toHaveCount(0);
  await expect(page.getByTestId('capability-grid')).toContainText('Not deployed');
  await expect(page.locator('#mock-review-notice')).toHaveCount(0);
  await page.evaluate(() => window.squeek.destroy());
});
