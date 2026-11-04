import {test,expect} from '@playwright/test';
import {installDisplayFixture} from './display-fixture.mjs';
import {installReviewFixture} from './review-fixture.mjs';
const phase=process.env.WALLET_WHEEL_AUDIT_PHASE??'after';
for(const profile of ['v6','v9'])for(const width of [390,1280])test(`wallet/wheel audit ${profile} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:960});
 if(profile==='v9')await installDisplayFixture(page,{countsReader:true});else await installReviewFixture(page);
 await page.evaluate(()=>squeek.connect());await page.evaluate(()=>document.fonts.ready);
 await page.locator('.topbar').screenshot({path:`artifacts/screenshots/wallet-wheel-${phase}-${profile}-header-${width}.png`});
 await page.getByTestId('tab-network').click();await page.screenshot({path:`artifacts/screenshots/wallet-wheel-${phase}-${profile}-network-${width}.png`,fullPage:true});
 await page.getByTestId('tab-squeeks').click();await page.screenshot({path:`artifacts/screenshots/wallet-wheel-${phase}-${profile}-squeeks-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>squeek.destroy());
});
