import {test,expect} from '@playwright/test';
import {installReviewFixture} from './review-fixture.mjs';
import {installV9Fixture} from './v9-fixture.mjs';
const phase=process.env.SQUEEKS_AUDIT_PHASE??'after';
for(const theme of ['light','dark'])for(const profile of ['v6','v9'])for(const width of [390,1280])for(const mode of ['holder','empty','watch','disconnected'])test(`Squeeks workspace ${theme} ${profile} ${mode} ${width}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setViewportSize({width,height:960});await (profile==='v9'?installV9Fixture(page):installReviewFixture(page));
 if(theme==='dark')await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 if(mode==='watch'){await page.getByTestId('tab-squeeks').click();await page.getByTestId('watch-input').fill('0x598958abf7d8db8dd468cb53dd6ba705581bff54');await page.getByTestId('btn-watch').click();await expect(page.getByTestId('watch-mode')).toBeVisible();}
 else if(mode!=='disconnected')await page.evaluate(()=>squeek.connect());await page.getByTestId('tab-squeeks').click();
 if(mode==='empty')await page.evaluate(async()=>{const read=squeek.adapter.walletStatus;squeek.adapter.walletStatus=async owner=>({...await read(owner),sqkBalance:{sqk:'0',base:'0'},totals:{count:0,deposited:0,power:'0',claimable:{sqk:'0',base:'0'}},staking:{principal:{sqk:'0',base:'0'},fresh:{sqk:'0',base:'0'},mature:{sqk:'0',base:'0'}},squeeks:[],mergePlan:{pairs:[]}});await squeek.refresh();});
 await expect(page.getByTestId('panel-squeeks')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 if(phase==='after'){
 await expect(page.locator('.panel .squeek-card')).toHaveCount(0);await expect(page.locator('#squeek-cards svg')).toHaveCount(0);
 if(mode==='empty'){await expect(page.locator('#nft-empty')).toHaveText('No Squeeks in this wallet');await expect(page.locator('#sqk-empty')).toBeVisible();}
 if(mode==='disconnected')await expect(page.locator('#holder-connect')).toBeVisible();
 if(mode==='watch')for(const button of await page.locator('[data-action]').all())await expect(button).toBeDisabled();
 for(const image of await page.locator('#squeek-cards img').all()){await image.scrollIntoViewIfNeeded();await expect(image).toHaveAttribute('src',/^(data:|blob:)/);}await page.evaluate(()=>scrollTo(0,0));expect(errors).toEqual([]);}
 await page.screenshot({path:`artifacts/screenshots/squeeks-${phase}-${theme}-${profile}-${mode}-${width}.png`,fullPage:true});await page.evaluate(()=>squeek.destroy());
});
