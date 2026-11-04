import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {encodeErrorResult} from 'viem';
import {staking9Abi} from '../sdk/abi-v9.js';
import {installV9Fixture}from './v9-fixture.mjs';
const capture=async(page,testInfo,name)=>{await page.evaluate(()=>document.fonts.ready);if(name.includes('fee-rose'))await page.evaluate(()=>scrollTo(0,0));const image=await page.screenshot({fullPage:name.includes('squeeks')||name.includes('fee-rose'),animations:'disabled'});await testInfo.attach(name,{body:image,contentType:'image/png'});fs.mkdirSync('artifacts/screenshots',{recursive:true});fs.writeFileSync('artifacts/screenshots/'+name,image);};
for(const theme of ['light','dark'])for(const width of [1280,390])for(const view of ['squeeks','merge','unstake'])test(`v9 mocked ${view} / ${theme} / ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:960});await installV9Fixture(page);
 if(theme==='dark')await page.getByTestId('btn-theme').click();await page.evaluate(()=>window.squeek.connect());
 await expect(page.getByTestId('squeek-card').nth(0)).toContainText('Deposited');await expect(page.getByTestId('squeek-card').nth(2)).toContainText('Wallet');
 if(view==='merge'){await page.getByRole('checkbox',{name:'Select Squeek #41',exact:true}).check();await page.getByRole('checkbox',{name:'Select Squeek #42',exact:true}).check();await page.getByTestId('btn-custom-merge').click();await page.getByTestId('modal-input').fill('BURN-42');await expect(page.getByTestId('btn-modal-confirm')).toBeEnabled();expect(await page.evaluate(()=>v9.previews.length)).toBe(0);}
 if(view==='unstake'){await page.locator(`[data-action="${'unstake'}"]`).first().click();await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();await expect(page.getByTestId('confirm-details')).toContainText('0.01 SQK');await expect(page.getByTestId('confirm-details')).toContainText('0.99 SQK');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>v9.sends)).toBe(0);
 await capture(page,info,`v9-${view}-${theme}-${width}.png`);await page.evaluate(()=>window.squeek.destroy());
});
for(const action of ['deposit','withdraw','approveNft','approveAll','approveSqk','stake','unstake','claimAndStake'])test(`v9 ${action}: simulate, review, re-preview before mock wallet`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>window.squeek.connect());if(['deposit','approveNft'].includes(action))await page.getByRole('checkbox',{name:'Select Squeek #87',exact:true}).check();if(action==='withdraw')await page.getByRole('checkbox',{name:'Select Squeek #41',exact:true}).check();await page.locator(`[data-action="${action}"]`).first().click();
 if(['deposit','withdraw'].includes(action))await page.getByTestId('v9-ids').fill(action==='withdraw'?'41':'87');
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
 await page.getByRole('checkbox',{name:'Select Squeek #87',exact:true}).check();await page.locator(`[data-action="${'approveNft'}"]`).first().click();await expect(page.getByTestId('approval-scope')).toContainText('only this NFT');
 await page.locator(`[data-action="${'approveAll'}"]`).first().click();await expect(page.getByTestId('approval-scope')).toContainText('ALL current and future');
 await page.locator(`[data-action="${'unstake'}"]`).first().click();await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();await page.evaluate(()=>{v9.fee='20000000000000000';});await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('banner')).toContainText('Fee rose');expect(await page.evaluate(()=>v9.sends)).toBe(0);
 await page.getByTestId('btn-claim').click();await expect(page.getByTestId('modal')).toBeVisible();await page.evaluate(()=>{v9.claimAmount='1';});await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('banner')).toContainText('Claim outcome changed');expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
test('v9 staked merge BURN guard and SQK-only account claim',async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());await page.getByRole('checkbox',{name:'Select Squeek #41',exact:true}).check();await page.getByRole('checkbox',{name:'Select Squeek #42',exact:true}).check();await page.locator('[data-action="mergeDeposited"]').click();await page.getByTestId('v9-ids').fill('41, 42');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal-title')).toHaveText('Keep #41 · burn #42');await expect(page.getByTestId('modal-body')).toContainText('Keep #41 · burn #42');await expect(page.getByTestId('modal-input')).toHaveAccessibleName('Type BURN-42 to acknowledge permanent burn');await page.getByTestId('modal-input').fill('42');await expect(page.getByTestId('btn-modal-confirm')).toBeDisabled();expect(await page.evaluate(()=>v9.previews.length)).toBe(0);await page.getByTestId('modal-input').fill('BURN-42');await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('modal')).toBeVisible();await expect(page.getByTestId('modal-title')).toHaveText('Keep #41 · burn #42');await expect(page.getByTestId('modal-body')).toContainText('Keep #41 · burn #42');expect(await page.evaluate(()=>v9.previews[0].input.confirm)).toBe('BURN-42');await page.getByTestId('btn-modal-cancel').click();
 await page.evaluate(async()=>{v9.wallet.totals.count=0;v9.wallet.totals.deposited=0;v9.wallet.squeeks=[];await squeek.refresh();});await expect(page.getByTestId('btn-claim')).toBeEnabled();await page.getByTestId('btn-claim').click();await expect(page.getByTestId('modal')).toBeVisible();expect(await page.evaluate(()=>v9.previews.at(-1).action)).toBe('claim');await page.evaluate(()=>squeek.destroy());
});
for(const [a,b,expected]of [['2','0','sepolia-v6'],['0','2','sepolia-v9'],['2','3','sepolia-v9'],['0','0','sepolia-v9'],[null,'2','sepolia-v9']])test(`connect inventory ${a}/${b} chooses ${expected}`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(([a,b])=>{v9.counts={'sepolia-v6':a,'sepolia-v9':b};},[a,b]);await page.evaluate(()=>squeek.connect());await expect(page.getByTestId('profile-select')).toHaveValue(expected);expect(await page.getByTestId('profile-select').locator('option').allTextContents()).toEqual(expect.arrayContaining([`Sepolia v6 · ${a??'Unknown'} in wallet · 0 staked`,`Sepolia v9 · ${b} in wallet · 0 staked`]));
 await expect(page.getByTestId('profile-choice'))[a==='2'&&b==='3'?'toBeVisible':'toBeHidden']();
 await page.getByTestId('wallet-button').click();await page.getByTestId('btn-disconnect').click();
 expect(await page.getByTestId('profile-select').locator('option').allTextContents()).toEqual(['Sepolia v9','Sepolia v6','Mainnet']);
 await page.evaluate(()=>squeek.destroy());
});
test('restored frontend: active policy, one footer, baseline copy, conditional warning/pause and lazy modules',async({page})=>{
 const loaded=[];page.on('request',r=>loaded.push(new URL(r.url()).pathname));await installV9Fixture(page);
 expect(loaded).not.toContain('/settings.js');expect(loaded).not.toContain('/developers.js');
 await page.getByTestId('tab-info').click();await expect(page.getByTestId('policy-levels')).toContainText('2200');await expect(page.getByTestId('policy-levels').locator('tr')).toHaveCount(1);
 await expect(page.getByTestId('core-pause-note')).toBeHidden();await page.evaluate(async()=>{v9.net.core.paused=true;await squeek.refresh();});await expect(page.getByTestId('core-pause-note')).toBeVisible();await expect(page.getByTestId('trust-summary')).toContainText('Current snapshot block');await expect(page.getByTestId('trust-block')).toHaveText('12101024');await expect(page.getByTestId('trust-result')).toHaveText('Verified');await expect(page.getByTestId('trust-rpcs')).toContainText('Agreed');
 await expect(page.getByTestId('developer-surfaces').locator('tbody tr')).toHaveCount(4);
 await page.getByTestId('settings-open').click();await expect(page.getByTestId('settings-sheet')).toBeVisible();expect(loaded).toContain('/settings.js');await page.getByTestId('rpc-url').fill('https://rpc.example/');await expect(page.getByTestId('rpc-secret-warning')).toBeHidden();await page.getByTestId('rpc-url').fill('https://rpc.example/?apiKey=private');await expect(page.getByTestId('rpc-secret-warning')).toBeVisible();await page.keyboard.press('Escape');
 await page.getByTestId('info-link-developers').click();await page.getByTestId('btn-copy-manifest').click();expect(loaded).toContain('/developers.js');
 const body=await page.locator('body').textContent();expect(body.match(/not affiliated with Squeekchain/g)).toHaveLength(1);expect(body).toMatch(/Powered by a hamster/);expect(body).toMatch(/Build with Squeekchain/);expect(body).toMatch(/Network/);expect(body).not.toMatch(/undocumented|no v9 transactions|read-only and unverified|all transactions disabled/);
 await page.getByTestId('tab-squeeks').click();await expect(page.locator('.telemetry-source')).toHaveCount(0);await expect(page.getByTestId('panel-explore')).toBeHidden();await expect(page.locator('.network-strip')).toContainText('Official Status');await page.evaluate(()=>squeek.destroy());
});

for(const [name,v6,v9,expected] of [
 ['only staked v9',{wallet:'0',staked:'0',nftPower:'0'},{wallet:'0',staked:'2',nftPower:'9000'},'sepolia-v9'],
 ['wallet v6 and staked v9',{wallet:'3',staked:'0',nftPower:'0'},{wallet:'0',staked:'2',nftPower:'9000'},'sepolia-v6'],
 ['staked history unavailable',{wallet:'0',staked:'0',nftPower:'0'},{wallet:'0',staked:null,nftPower:'9000'},'sepolia-v9'],
])test(`staked profile selector: ${name}`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(async({v6,v9})=>{window.v9.counts={'sepolia-v6':v6,'sepolia-v9':v9};await squeek.switchProfile('sepolia-v6');await squeek.connect();},{v6,v9});
 await expect(page.getByTestId('profile-select')).toHaveValue(expected);
 const text=await page.getByTestId('profile-select').locator('option[value="sepolia-v9"]').textContent();
 expect(text).toContain(v9.staked==null?'Staked (Unknown)':'0 in wallet · 2 staked');expect(text).not.toContain('9000');
 if(name==='wallet v6 and staked v9'){await expect(page.getByTestId('profile-choice')).toBeVisible();await expect(page.getByTestId('profile-choice')).toContainText('3 in wallet · 0 staked');await expect(page.getByTestId('profile-choice')).toContainText('0 in wallet · 2 staked');}
 await page.evaluate(()=>squeek.destroy());
});
test('v9 Unknown holdings keep Claim and otherwise-ready Checkpoint disabled; known zero still allows SQK claim',async({page})=>{
 await installV9Fixture(page);await page.evaluate(async()=>{v9.wallet.totals.count=null;v9.net.checkpoint.canCheckpoint=true;await squeek.connect();});
 await expect(page.getByTestId('btn-claim')).toBeDisabled();await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();
 await page.evaluate(async()=>{v9.wallet.totals.count=0;await squeek.refresh();});await expect(page.getByTestId('btn-claim')).toBeEnabled();await expect(page.getByTestId('btn-checkpoint')).toBeEnabled();
 await page.evaluate(()=>squeek.destroy());
});
const feeRevert=encodeErrorResult({abi:staking9Abi,errorName:'FeeLimitExceeded',args:[20000000000000000n,10000000000000000n]});
for(const source of ['simulation','wallet'])test(`FeeLimitExceeded decoded from ${source}: Fee rose, fresh quote and one explicit Re-quote`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());
 await page.locator(`[data-action="${'unstake'}"]`).first().click();await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();
 await page.evaluate(({source,data})=>{if(source==='simulation')v9.simulationError={cause:{data}};else v9.sendError={code:-32000,data:{originalError:{data}}};},{source,data:feeRevert});
 await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('fee-rose')).toBeVisible();await expect(page.getByTestId('fee-quote')).toContainText('0.02 SQK fee');await expect(page.getByTestId('fee-quote')).toContainText('0.98 SQK received');
 await expect(page.getByRole('button',{name:'Re-quote',exact:true})).toHaveCount(1);await expect(page.getByTestId('modal')).toBeHidden();
 expect(await page.evaluate(()=>v9.sends)).toBe(source==='wallet'?1:0);
 expect(await page.evaluate(()=>v9.previews[1].input.maxFee)).toBe('10000000000000000');
 await page.getByRole('button',{name:'Re-quote',exact:true}).click();await expect(page.getByTestId('modal')).toBeVisible();await expect(page.getByTestId('confirm-details')).toContainText('0.02 SQK');
 expect(await page.evaluate(()=>v9.sends)).toBe(source==='wallet'?1:0);await page.getByTestId('btn-modal-cancel').click();await page.evaluate(()=>squeek.destroy());
});
test('mixed custody merge gives the withdrawal/deposit remedy without simulation or wallet',async({page})=>{
 await installV9Fixture(page);await page.evaluate(async()=>{v9.mixedCustody=true;await squeek.connect();});
 await page.getByRole('checkbox',{name:'Select Squeek #41',exact:true}).check();await page.getByRole('checkbox',{name:'Select Squeek #87',exact:true}).check();await expect(page.locator('[data-action="mergeDeposited"]')).toBeDisabled();await page.evaluate(()=>{window.mixedRequest=squeek.requestAction('mergeDeposited',{survivor:'41',donor:'87'});});
 await page.getByTestId('modal-input').fill('BURN-87');await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('banner')).toContainText('#41 is staked; withdraw it or deposit #87 first');await expect(page.getByTestId('modal')).toBeHidden();expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
for(const theme of ['light','dark'])for(const width of [1280,390])test(`Fee rose mocked / ${theme} / ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:960});await installV9Fixture(page);if(theme==='dark')await page.getByTestId('btn-theme').click();await page.evaluate(()=>squeek.connect());
 await page.locator(`[data-action="${'unstake'}"]`).first().click();await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();await page.evaluate(()=>{v9.fee='20000000000000000';});await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('fee-rose')).toBeVisible();
 await expect(page.getByRole('button',{name:'Re-quote',exact:true})).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await capture(page,info,`fee-rose-${theme}-${width}.png`);await page.evaluate(()=>squeek.destroy());
});

for(const width of [1280,390])test(`b705683 layout and live-only badges / ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:960});await installV9Fixture(page);
 await expect(page.locator('.brand .label')).toHaveText('Independent Squeekchain console');
 await expect(page.getByTestId('panel-explore')).toBeHidden();
 await expect(page.getByTestId('btn-checkpoint')).toHaveText('Simulate & checkpoint');await expect(page.getByTestId('cp-explain')).toContainText('Turns settled rounds into issued SQK.');
 await expect(page.locator('.footer-top')).toContainText('Powered by a hamster. Built for the holders.');
 await page.evaluate(()=>squeek.connect());await expect(page.getByTestId('profile-status')).toHaveText('Verified');
 await expect(page.getByTestId('btn-claim')).toHaveText('Claim');await expect(page.getByTestId('btn-holder-refresh')).toHaveAccessibleName('Refresh Squeeks');await expect(page.locator('#btn-plan')).toHaveCount(0);
 await expect(page.getByTestId('claim-ids')).toBeHidden();await expect(page.getByTestId('v9-actions')).toBeVisible();
 await page.evaluate(async()=>{v9.net.verification.trusted=false;await squeek.refresh();});await expect(page.getByTestId('profile-status')).toHaveText('Mismatch: stop');
 await page.getByTestId('profile-select').selectOption('mainnet');await expect(page.getByTestId('profile-status')).toHaveText('Not deployed');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>squeek.destroy());
});
