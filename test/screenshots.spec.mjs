import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installReviewFixture } from './review-fixture.mjs';

// Always exercise all 16 review states. Only explicit local regeneration writes
// tracked docs images; ordinary CI saves captures as test output, not baselines.
for (const theme of ['light', 'dark']) for (const width of [1280, 390]) for (const view of ['overview', 'wallet', 'merge', 'mainnet']) {
  test(`mocked review: ${view} / ${theme} / ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await installReviewFixture(page);
    if (theme === 'dark') await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('#profile-status')).toHaveText('Supported');
    await expect(page.locator('.hero-copy p br')).toHaveCount(0);
    if (view === 'wallet' || view === 'merge') {
      await page.evaluate(async () => { await window.squeek.connect(); window.squeek.selectTab('holdings'); });
      await expect(page.locator('#holder-count')).toHaveText('3');
      await expect(page.locator('#squeeks-tbody')).toContainText('Unknown');
      await expect(page.locator('table[data-component="Table"]')).toBeVisible();
      if (width === 390) {
        const cells = await page.locator('#squeeks-tbody tr').first().locator('td').evaluateAll(nodes => nodes.map(node => ({
          label: node.dataset.label, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
          display: getComputedStyle(node).display,
        })));
        expect(cells).toHaveLength(7);
        for (const cell of cells) { expect(cell.left).toBeGreaterThanOrEqual(0); expect(cell.right).toBeLessThanOrEqual(390); expect(cell.display).toBe('flex'); }
        expect(cells.map(cell => cell.label)).toContain('claimable SQK');
      }
    }
    if (view === 'merge') {
      await page.locator('#merge-list button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('#modal')).toHaveAttribute('data-component', 'ConfirmDialog');
      await page.locator('#modal-input').fill('BURN-41');
      await expect(page.locator('#btn-modal-confirm')).toBeDisabled();
      await page.locator('#modal-input').fill('BURN-42');
      await expect(page.locator('#btn-modal-confirm')).toBeEnabled();
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const ribbon = document.createElement('div'); ribbon.textContent = 'MOCKED REVIEW · OFFLINE';
        const belowHeader = document.querySelector('.topbar').getBoundingClientRect().bottom + 8;
        ribbon.id = 'mock-review-ribbon';
        ribbon.style.cssText = `position:fixed;top:${belowHeader}px;left:12px;z-index:90;padding:6px 10px;border:1px solid var(--sqk-line);background:var(--sqk-panel);color:var(--sqk-ink);font:11px var(--sqk-font-label);pointer-events:none`;
        document.body.append(ribbon);
      });
    }
    if (view === 'mainnet') {
      await page.selectOption('#profile-select', 'mainnet');
      await expect(page.locator('#profile-status')).toHaveText('Not deployed');
      await expect(page.locator('#not-deployed')).toBeVisible();
      await expect(page.locator('#deployment-content')).toBeHidden();
      await expect(page.locator('#btn-connect')).toBeHidden();
      await expect(page.locator('#verified-chip')).toBeHidden();
      await expect(page.locator('#banner')).toBeHidden();
      await expect(page.locator('.chip:visible').filter({ hasText: /not deployed/i })).toHaveCount(1);
    }
    if (view === 'overview') await expect(page.locator('.hero')).toBeVisible();
    else await expect(page.locator('.hero')).toBeHidden();
    if (view === 'merge') {
      const ribbon = await page.locator('#mock-review-ribbon').boundingBox(), header = await page.locator('.topbar').boundingBox();
      expect(ribbon.y).toBeGreaterThanOrEqual(header.y + header.height);
    }
    if (width === 390) {
      const select = await page.locator('#profile-select').boundingBox(), badges = await page.locator('.header-badges').boundingBox();
      expect(Math.abs(select.width - badges.width)).toBeLessThan(1);
    }
    if (width === 390 && view !== 'mainnet') {
      const boxes = await page.locator('#btn-connect, #btn-theme, #btn-refresh').evaluateAll(nodes => nodes.map(node => ({ y: node.getBoundingClientRect().y, height: node.getBoundingClientRect().height })));
      expect(new Set(boxes.map(box => Math.round(box.y))).size).toBe(1);
      expect(boxes.every(box => box.height === 36)).toBe(true);
      const badges = await page.locator('.header-badges > .chip:visible').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().y)));
      expect(new Set(badges).size).toBe(1);
    }
    await expect(page.locator('footer')).toContainText('not affiliated with Squeekchain');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.reviewCounters)).toEqual({ simulations: 0, sends: 0 });
    await page.evaluate(() => document.fonts.ready);
    // Only network polling is mocked. These are screenshots of actual app DOM/CSS.
    const name = `${view}-${theme}-${width}.png`;
    const output = testInfo.outputPath(name);
    const image = await page.screenshot({ path: output, fullPage: view !== 'merge', animations: 'disabled' });
    await testInfo.attach(name, { body: image, contentType: 'image/png' });
    if (process.env.UPDATE_SCREENSHOTS === '1') {
      const destination = path.resolve('docs/screenshots', name);
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, image);
    }
    if (view === 'merge') await page.keyboard.press('Escape');
    await page.evaluate(() => window.squeek.destroy());
  });
}

test('mocked components: TokenCard keyboard opens isolated image; modal traps and restores focus', async ({ page }) => {
  await installReviewFixture(page);
  await page.evaluate(async () => { window.squeek.selectTab('art'); await window.squeek.loadArt(['41']); });
  const card = page.locator('[data-component="TokenCard"]');
  await expect(card).toHaveCount(1);
  await expect(page.locator('.hero')).toBeHidden();
  await card.focus(); await card.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#modal-body img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(page.locator('#modal-body svg, #modal-body script')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(card).toBeFocused();
  await page.evaluate(() => window.squeek.selectTab('agent'));
  await expect(page.locator('.hero')).toBeHidden();
  await page.evaluate(() => window.squeek.selectTab('overview'));
  await expect(page.locator('.hero')).toBeVisible();
  await page.evaluate(() => window.squeek.destroy());
});

async function assertCompactHeader(page, width, connected) {
  const header = page.locator('.topbar');
  await expect(page.locator('#wallet-chip'))[connected ? 'toBeVisible' : 'toBeHidden']();
  await expect(page.locator('#btn-connect')).toHaveText(connected ? 'Disconnect' : 'Connect wallet');
  const geometry = await header.locator('select:visible, .chip:visible, .btn:visible').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
    return { id: node.id, x: rect.x, right: rect.right, y: rect.y, height: rect.height, radius: css.borderRadius, font: css.fontSize };
  }));
  expect(new Set(geometry.map(control => control.radius)).size).toBe(1);
  for (const control of geometry) {
    expect(control.height, control.id).toBe(36);
    expect(control.x, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width);
  }
  for (const chip of await header.locator('.chip:visible').all()) {
    expect(await chip.evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
  }
  for (const id of ['btn-theme', 'btn-refresh']) {
    const icon = page.locator(`#${id}`);
    expect(await icon.evaluate(node => getComputedStyle(node).fontSize)).toBe('18px');
    expect((await icon.boundingBox()).width).toBe(36);
    await expect(icon.locator('svg')).toHaveAttribute('width', '18');
    await expect(icon.locator('svg')).toHaveAttribute('height', '18');
    await icon.focus(); await expect(icon).toBeFocused();
    expect(await icon.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(3);
  }
  if (width >= 900) {
    expect(new Set(geometry.map(control => Math.round(control.y))).size).toBe(1);
    const brand = await page.locator('.brand').boundingBox(), toolbar = await page.locator('.toolbar').boundingBox();
    expect(brand.x + brand.width).toBeLessThanOrEqual(toolbar.x);
    expect(Math.abs(brand.y + brand.height / 2 - toolbar.y - toolbar.height / 2)).toBeLessThan(1);
    await expect(page.locator('.header-links')).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const theme of ['light', 'dark']) for (const width of [1280, 390]) for (const connected of [false, true]) {
  test(`header review: ${theme} / ${width}px / ${connected ? 'connected' : 'disconnected'}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installReviewFixture(page);
    if (theme === 'dark') await page.getByRole('button', { name: 'Toggle theme' }).click();
    if (connected) await page.evaluate(() => window.squeek.connect());
    await assertCompactHeader(page, width, connected);
    await page.evaluate(() => { document.activeElement.blur(); return document.fonts.ready; });
    const name = `header-${connected ? 'connected' : 'disconnected'}-${theme}-${width}.png`;
    const image = await page.locator('.topbar').screenshot({ path: testInfo.outputPath(name), animations: 'disabled' });
    await testInfo.attach(name, { body: image, contentType: 'image/png' });
    if (process.env.UPDATE_SCREENSHOTS === '1') fs.writeFileSync(path.resolve('docs/screenshots', name), image);
    if (connected) {
      await page.locator('#btn-connect').click();
      await expect(page.locator('#wallet-chip')).toBeHidden();
    }
    await page.evaluate(() => window.squeek.destroy());
  });
}
for (const width of [900, 1024]) test(`header: single desktop row at ${width}px, connected and disconnected`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await installReviewFixture(page);
  await assertCompactHeader(page, width, false);
  await page.evaluate(() => window.squeek.connect());
  await assertCompactHeader(page, width, true);
  await page.selectOption('#profile-select', 'sepolia');
  await expect(page.locator('#profile-status')).toHaveText('Read-only');
  await expect(page.locator('#verified-chip')).toHaveText('Unverified');
  await expect(page.locator('#verified-chip')).toHaveAttribute('title', /All transactions disabled/);
  await assertCompactHeader(page, width, false);
  await page.evaluate(() => window.squeek.destroy());
});
