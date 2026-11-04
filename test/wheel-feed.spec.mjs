import {test,expect} from '@playwright/test';
import {installDisplayFixture} from './display-fixture.mjs';
test('public checkpoint-round list removed; forming-block line remains provisional, never a completed round',async({page})=>{
 const {fixtures}=await installDisplayFixture(page,{countsReader:true});await expect(page.getByTestId('profile-status')).toHaveText('Checking…');await page.getByTestId('profile-status').click();await expect(page.getByTestId('trust-result')).toHaveText('—');await page.getByTestId('tab-squeeks').click();
 await page.getByTestId('btn-refresh').click();await page.locator('#holder-history-link').click();await expect(page.locator('#network-events')).toHaveCount(0);await expect(page.locator('#wheel-show-more')).toHaveCount(0);await expect(page.getByTestId('activity-drawer')).not.toContainText('0 SQK issued (checkpoint)');await page.getByTestId('activity-drawer').getByTestId('sheet-close').click();
 await expect(page.getByTestId('provisional-blocks')).toHaveText('Block 2,394 forming · 13% · provisional');expect(await page.getByTestId('provisional-blocks').locator('li').count()).toBe(0);fixtures.status.measurement.coreStatus='IDLE';await page.evaluate(()=>squeek.pollDisplay());await expect(page.getByTestId('provisional-blocks')).toBeHidden();await page.evaluate(()=>squeek.destroy());
});
