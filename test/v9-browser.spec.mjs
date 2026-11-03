import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {installV9Fixture}from './v9-fixture.mjs';
const capture=async(page,testInfo,name)=>{await page.evaluate(()=>document.fonts.ready);const image=await page.screenshot({fullPage:name.includes('squeeks'),animations:'disabled'});await testInfo.attach(name,{body:image,contentType:'image/png'});if(process.env.UPDATE_SCREENSHOTS==='1')fs.writeFileSync('docs/screenshots/'+name,image);};
for(const theme of ['light','dark'])for(const width of [1280,390])for(const view of ['squeeks','merge','unstake'])test(`v9 mocked ${view} / ${theme} / ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:960});await installV9Fixture(page);
 if(theme==='dark')await page.getByTestId('btn-theme').click();await page.evaluate(()=>window.squeek.connect());
 await expect(page.getByTestId('squeeks-tbody')).toContainText('Wallet');await expect(page.getByTestId('squeeks-tbody')).toContainText('Staked');
 if(view==='merge'){await page.getByTestId('merge-list').getByRole('button').click();await page.getByTestId('modal-input').fill('BURN-42');await expect(page.getByTestId('btn-modal-confirm')).toBeEnabled();expect(await page.evaluate(()=>v9.previews.length)).toBe(0);}
 if(view==='unstake'){await page.getByTestId('v9-action').selectOption('unstake');await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();await expect(page.getByTestId('confirm-details')).toContainText('0.01 SQK');await expect(page.getByTestId('confirm-details')).toContainText('0.99 SQK');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>v9.sends)).toBe(0);
 await capture(page,info,`v9-${view}-${theme}-${width}.png`);await page.evaluate(()=>window.squeek.destroy());
});
for(const action of ['deposit','withdraw','approveNft','approveAll','approveSqk','stake','unstake','claimAndStake'])test(`v9 ${action}: simulate, review, re-preview before mock wallet`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>window.squeek.connect());await page.getByTestId('v9-action').selectOption(action);
 if(['deposit','withdraw'].includes(action))await page.getByTestId('v9-ids').fill('87');
 if(action==='approveNft')await page.getByTestId('v9-token').fill('87');
 if(['approveSqk','stake','unstake'].includes(action))await page.getByTestId('v9-amount').fill('1');
 await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();expect(await page.evaluate(()=>v9.sends)).toBe(0);
 await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('banner')).toContainText('Mock wallet stops');
 const h=await page.evaluate(()=>({previews:v9.previews,sends:v9.sends}));expect(h.previews).toHaveLength(2);expect(h.previews.every(p=>p.action===action)).toBe(true);expect(h.sends).toBe(1);
 if(action==='unstake'){expect(h.previews[1].input.maxFee).toBe('10000000000000000');expect(h.previews[1].input.deadline).toBe('1900000000');}
 await page.evaluate(()=>window.squeek.destroy());
});
test('v9 explicit approval scope, deposit failure never signs; fee increase and changed claim stop',async({page})=>{
 await installV9Fixture(page);await page.evaluate(async()=>{await squeek.connect();v9.approvalRequired=true;});await page.getByTestId('v9-ids').fill('87');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeHidden();expect(await page.evaluate(()=>v9.sends)).toBe(0);
 await page.getByTestId('v9-action').selectOption('approveNft');await expect(page.getByTestId('approval-scope')).toContainText('only this NFT');
 await page.getByTestId('v9-action').selectOption('approveAll');await expect(page.getByTestId('approval-scope')).toContainText('ALL current and future');
 await page.getByTestId('v9-action').selectOption('unstake');await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();await page.evaluate(()=>{v9.fee='20000000000000000';});await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('banner')).toContainText('Outcome or fee changed');expect(await page.evaluate(()=>v9.sends)).toBe(0);
 await page.getByTestId('btn-claim').click();await expect(page.getByTestId('modal')).toBeVisible();await page.evaluate(()=>{v9.claimAmount='1';});await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('banner')).toContainText('Claim outcome changed');expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
test('v9 staked merge BURN guard and SQK-only account claim',async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());await page.getByTestId('v9-action').selectOption('mergeDeposited');await page.getByTestId('v9-survivor').fill('41');await page.getByTestId('v9-donor').fill('42');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal-input')).toHaveAccessibleName('Type BURN-42 to confirm');await page.getByTestId('modal-input').fill('42');await expect(page.getByTestId('btn-modal-confirm')).toBeDisabled();expect(await page.evaluate(()=>v9.previews.length)).toBe(0);await page.getByTestId('modal-input').fill('BURN-42');await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('modal')).toBeVisible();expect(await page.evaluate(()=>v9.previews[0].input.confirm)).toBe('BURN-42');await page.getByTestId('btn-modal-cancel').click();
 await page.evaluate(async()=>{v9.wallet.totals.count=0;v9.wallet.totals.deposited=0;v9.wallet.squeeks=[];await squeek.refresh();});await expect(page.getByTestId('btn-claim')).toBeEnabled();await page.getByTestId('btn-claim').click();await expect(page.getByTestId('modal')).toBeVisible();expect(await page.evaluate(()=>v9.previews.at(-1).action)).toBe('claim');await page.evaluate(()=>squeek.destroy());
});
for(const [a,b,expected]of [['2','0','sepolia-v6'],['0','2','sepolia-v9'],['2','3','sepolia-v9'],['0','0','sepolia-v9'],[null,'2','sepolia-v9']])test(`connect inventory ${a}/${b} chooses ${expected}`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(([a,b])=>{v9.counts={'sepolia-v6':a,'sepolia-v9':b};},[a,b]);await page.evaluate(()=>squeek.connect());await expect(page.getByTestId('profile-select')).toHaveValue(expected);expect(await page.getByTestId('profile-select').locator('option').allTextContents()).toEqual(expect.arrayContaining([`Sepolia v6 · ${a??'Unknown'} Squeeks`,`Sepolia v9 · ${b} Squeeks`]));
 await expect(page.getByTestId('profile-choice'))[a==='2'&&b==='3'?'toBeVisible':'toBeHidden']();
 await page.getByTestId('wallet-button').click();await page.getByTestId('btn-disconnect').click();
 expect(await page.getByTestId('profile-select').locator('option').allTextContents()).toEqual(['Sepolia v9','Sepolia v6','Mainnet']);
 await page.evaluate(()=>squeek.destroy());
});
test('subtract pass: active policy, one footer, source icons, conditional warning/pause and lazy modules',async({page})=>{
 const loaded=[];page.on('request',r=>loaded.push(new URL(r.url()).pathname));await installV9Fixture(page);
 expect(loaded).not.toContain('/settings.js');expect(loaded).not.toContain('/developers.js');
 await page.getByTestId('tab-info').click();await expect(page.getByTestId('policy-levels')).toContainText('2200');await expect(page.getByTestId('policy-levels').locator('tr')).toHaveCount(1);
 await expect(page.getByTestId('core-pause-note')).toBeHidden();await page.evaluate(async()=>{v9.net.core.paused=true;await squeek.refresh();});await expect(page.getByTestId('core-pause-note')).toBeVisible();await expect(page.getByTestId('trust-summary')).toContainText('Verified · block 12101024');await expect(page.getByTestId('trust-rpcs')).toContainText('Agreed');
 await expect(page.getByTestId('developer-surfaces').locator('tbody tr')).toHaveCount(3);
 await page.getByTestId('settings-open').click();await expect(page.getByTestId('settings-sheet')).toBeVisible();expect(loaded).toContain('/settings.js');await page.getByTestId('rpc-url').fill('https://rpc.example/');await expect(page.getByTestId('rpc-secret-warning')).toBeHidden();await page.getByTestId('rpc-url').fill('https://rpc.example/?apiKey=private');await expect(page.getByTestId('rpc-secret-warning')).toBeVisible();await page.keyboard.press('Escape');
 await page.getByTestId('info-link-developers').click();await page.getByTestId('btn-copy-manifest').click();expect(loaded).toContain('/developers.js');
 const body=await page.locator('body').textContent();expect(body.match(/not affiliated with Squeekchain/g)).toHaveLength(1);expect(body).not.toMatch(/Powered by a hamster|Build with Squeekchain|Network at a glance|undocumented|no v9 transactions|read-only and unverified/);
 await page.getByTestId('tab-network').click();await expect(page.getByTestId('source-api')).toHaveAccessibleName('API · device readings, not settled work');await expect(page.getByTestId('source-chain')).toHaveAccessibleName('Chain · same-block verified RPC reads');await page.evaluate(()=>squeek.destroy());
});
