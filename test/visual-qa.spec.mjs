import {test,expect} from '@playwright/test';
// Failure injection is only for this regression, never for the live QA captures.
for(const width of [1280,390])test(`every external source fails: no placeholder word outside Developers / ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(()=>{localStorage.setItem('wheelhouse:disconnected','true');localStorage.setItem('squeekchain:profile','sepolia-v9');});await page.goto('/');
 await expect(page.getByTestId('banner')).toHaveText("Can't verify right now");await expect(page.getByTestId('profile-status')).toHaveAccessibleName('Unavailable');expect(await page.getByTestId('profile-status').getAttribute('aria-describedby')).toBeNull();
 for(const tab of ['squeeks','art','explore','info']){await page.getByTestId('tab-'+tab).click();expect(await page.locator('body').innerText()).not.toContain('Unknown');}
 await expect(page.locator('#explore-content .pairs-chip')).toBeHidden();await expect(page.locator('#btn-planner')).toBeHidden();await expect(page.locator('#network-events')).toHaveCount(0);
 for(const section of ['how-it-works','trust','status','contracts','about']){await page.getByTestId('info-link-'+section).click();await expect(page.locator('#panel-info .info-section:visible')).toHaveCount(1);expect(new URL(page.url()).hash).toBe('#sepolia-v9/info/'+section);expect(await page.locator('body').innerText()).not.toContain('Unknown');}
 await page.getByTestId('info-link-contracts').click();await page.reload();await expect(page.locator('#info-contracts')).toBeVisible();await expect(page.locator('#panel-info .info-section:visible')).toHaveCount(1);
 await page.getByTestId('info-link-trust').click();await expect(page.getByTestId('trust-result')).toHaveText("Can't verify right now");expect(await page.locator('#info-trust').innerText()).not.toMatch(/https?:|eth_getStorageAt|viem|RPC rpc failure/);
 await page.getByTestId('info-link-developers').click();await expect(page.locator('#agent-setup')).not.toHaveAttribute('open','');await expect(page.getByTestId('mcp-snippet')).toBeHidden();await expect(page.locator('#net-kind')).toHaveCount(0);await expect(page.getByTestId('rpc-diagnostics')).not.toBeEmpty();
 await page.getByTestId('settings-open').click();await expect(page.getByTestId('btn-clear-cache')).toHaveText('Clear saved data');expect(await page.getByTestId('settings-sheet').innerText()).not.toContain('Unknown');await page.evaluate(()=>squeek.destroy());
});
