// Retirement regression: keep the original studio, without a premium entry point or shipped assets.
import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {installHolderFixture} from './holder-workspace-fixture.mjs';

test('premium retirement preserves the original share studio without loading premium assets',async({page})=>{
 // Isolate retirement wiring from the unrelated homepage's continuous GPU animation.
 await page.addInitScript(()=>{window.__squeekMounted=true;});
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[],premiumRequests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',request=>{if(/\/premium-share\.(?:js|css)(?:\?|$)/.test(request.url()))premiumRequests.push(request.url());});
 await installHolderFixture(page,{profile:'sepolia'});
 await expect(page.getByTestId('btn-premium-share')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Premium card',exact:true})).toHaveCount(0);
 const button=page.getByTestId('btn-share-card');await expect(button).toBeVisible();await expect(button).toBeEnabled();
 await button.click();await expect(page.getByTestId('share-sheet')).toBeVisible();
 await expect(page.locator('#share-preview canvas')).toHaveCount(1);
 await page.getByTestId('share-close').click();await expect(page.getByTestId('share-sheet')).toBeHidden();
 await page.evaluate(()=>squeek.destroy());expect(errors).toEqual([]);expect(premiumRequests).toEqual([]);
});

test('production output excludes the retired premium bundle and stylesheet',()=>{
 expect(existsSync('dist/premium-share.js')).toBe(false);
 expect(existsSync('dist/premium-share.css')).toBe(false);
 expect(existsSync('dist/share-card.js')).toBe(true);
 expect(existsSync('dist/share-styles.js')).toBe(true);
});
