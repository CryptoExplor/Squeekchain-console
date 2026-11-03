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
      expect(boxes.every(box => box.height === 44)).toBe(true);
      const badges = await page.locator('.header-badges > .chip').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().y)));
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
