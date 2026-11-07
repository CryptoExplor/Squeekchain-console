import {test,expect} from '@playwright/test';
import {installHolderFixture} from './holder-workspace-fixture.mjs';

test('share card: opens from the holder view, saves a PNG, never signs',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await installHolderFixture(page,{profile:'sepolia'});
 const button=page.getByTestId('btn-share-card');
 await expect(button).toBeVisible();await expect(button).toBeEnabled();
 await button.click();
 await expect(page.getByTestId('share-sheet')).toBeVisible();
 await expect(page.locator('#share-preview canvas')).toHaveCount(1);
 const download=page.waitForEvent('download');await page.getByTestId('share-png').click();
 const file=await download;expect(file.suggestedFilename()).toMatch(/^wheelhouse-0x.*\.png$/);
 const path=await file.path();const fs=await import('node:fs');expect(fs.statSync(path).size).toBeGreaterThan(5000);
 await page.getByTestId('share-close').click();await expect(page.getByTestId('share-sheet')).toBeHidden();
 expect(errors).toEqual([]);
});
