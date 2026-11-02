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
  await expect(page.locator('#profile-notice')).toContainText('no mainnet deployment');
  await expect(page.locator('#btn-checkpoint')).toBeDisabled();
  await expect(page.locator('#net-round')).toHaveText('—');
  await page.keyboard.press('Control+Home');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeInViewport();
  await page.screenshot({ path: 'test-results/wheelhouse-mobile.png', fullPage: true });
  await page.evaluate(() => window.squeek.destroy());
});
