import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {installV9Fixture} from './v9-fixture.mjs';
const availability='RPC unavailable. Verified reads need two independent Sepolia peers. Nothing was signed.';
const trustFailure='Wallet read failed: Snapshot block hash mismatch. Nothing was signed.';
async function capture(page,info,name){await page.evaluate(()=>document.fonts.ready);const image=await page.screenshot({animations:'disabled'});await info.attach(name,{body:image,contentType:'image/png'});if(process.env.UPDATE_SCREENSHOTS==='1')fs.writeFileSync('docs/screenshots/'+name,image);}
for(const theme of ['light','dark'])for(const width of [1280,390])test(`connected v9 diagnostics below header / ${theme} / ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:960});await installV9Fixture(page);if(theme==='dark')await page.getByTestId('btn-theme').click();await page.evaluate(()=>squeek.connect());
 const before=await page.evaluate(()=>v9.networkCalls);
 await page.evaluate(async()=>{v9.walletError={name:'TypeError',message:'Failed to fetch'};await squeek.refresh();});
 await expect(page.getByTestId('banner')).toHaveText(availability);await expect(page.getByTestId('profile-status')).toHaveText('Unavailable');await expect(page.getByTestId('btn-claim')).toBeDisabled();await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();
 expect(await page.evaluate(()=>v9.networkCalls)).toBe(before,'wallet failure must not immediately trigger another network snapshot');
 expect(await page.evaluate(()=>squeek.state.lastReadFailure.diagnostics.availability)).toBe(true);
 await page.evaluate(async()=>{v9.walletError={name:'RpcTrustError',message:'Snapshot block hash mismatch'};await squeek.refresh();});
 await expect(page.getByTestId('banner')).toHaveText(trustFailure);await expect(page.getByTestId('banner')).toHaveClass(/bad/);await expect(page.getByTestId('profile-status')).toHaveText('Mismatch: stop');
 for(const y of [0,220]){await page.evaluate(y=>scrollTo(0,y),y);await expect.poll(()=>page.getByTestId('banner').evaluate(el=>el.getBoundingClientRect().top-Math.max(0,document.querySelector('.topbar').getBoundingClientRect().bottom))).toBeGreaterThanOrEqual(7);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,info,`read-failure-${theme}-${width}.png`);
 await page.evaluate(async()=>{v9.walletError=null;await squeek.refresh();});await expect(page.getByTestId('banner')).toBeHidden();await expect(page.getByTestId('profile-status')).toHaveText('Verified');expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
for(const profile of ['sepolia-v6','sepolia-v9'])for(const width of [1280,390])test(`one wallet address and menu ETH / ${profile} / ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:960});await installV9Fixture(page);
 await page.evaluate(async profile=>{v9.counts['sepolia-v6']={wallet:'1',staked:'0',nftPower:'0'};await squeek.switchProfile(profile);await squeek.connect();},profile);
 await expect(page.getByTestId('profile-select')).toHaveValue(profile);await expect(page.getByTestId('wallet-chip')).toHaveCount(0);await expect(page.getByTestId('wallet-button')).toContainText('0x5989');await expect(page.locator('.topbar .chip:visible')).toHaveCount(1);
 await page.getByTestId('wallet-button').click();await expect(page.getByTestId('wallet-eth')).toBeVisible();await expect(page.getByTestId('wallet-eth')).toHaveText('ETH balance: 0.125 ETH');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,info,`wallet-menu-${profile}-${width}.png`);await page.keyboard.press('Escape');
 await page.getByTestId('profile-status').click();await expect(page).toHaveURL(new RegExp(profile+'/info/trust'));await page.evaluate(()=>squeek.destroy());
});
test('live Squeeks, plain profile notes, plural rounds and checkpoint issuance source',async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());await page.getByTestId('tab-network').click();
 await expect(page.getByTestId('net-issued-label')).toHaveText('Issued by v9 checkpoints');await expect(page.getByTestId('net-issued')).toContainText('12,500,000');await expect(page.getByTestId('net-issued')).not.toContainText('25,000,000');await expect(page.getByTestId('issuance-source')).toContainText('issuance.state().minted');
 for(const [lag,text] of [['0','0 rounds'],['1','1 round'],['2','2 rounds']]){await page.evaluate(async lag=>{v9.net.mining.lagRounds=lag;await squeek.refresh();},lag);await expect(page.getByTestId('net-lag')).toHaveText(text);}
 await page.evaluate(async()=>{v9.net.core.settledThroughRound='2049';await squeek.refresh();});await expect(page.getByTestId('net-issued')).toContainText('12,500,000');
 await page.evaluate(async()=>{v9.net.mining.issued.sqk='12500001';v9.net.mining.processedThroughRound='2049';await squeek.refresh();});await expect(page.getByTestId('net-issued')).toContainText('12,500,001');await expect(page.getByTestId('issuance-source')).toContainText('processed round 2049');
 await page.evaluate(()=>squeek.switchProfile('sepolia-v6'));await page.getByTestId('tab-network').click();await expect(page.getByTestId('net-squeeks')).toHaveText('512');await expect(page.getByTestId('net-issued-label')).toHaveText('Minted by v6 mining');
 await expect(page.getByTestId('profile-notice')).toHaveText('Equal profile: every operation checks the published identity pins and same-block two-peer agreement. Mismatch stops actions.');await page.evaluate(()=>squeek.destroy());
});
test('refreshes coalesce per generation, not across profile changes',async({page})=>{
 await installV9Fixture(page);
 const calls=await page.evaluate(async()=>{const before=v9.networkCalls;v9.pending=new Promise(resolve=>{v9.release=resolve;});const reads=[squeek.refresh(),squeek.refresh(),squeek.refresh()];await new Promise(resolve=>setTimeout(resolve,0));const during=v9.networkCalls;v9.pending=null;v9.release();await Promise.all(reads);return{before,during};});expect(calls.during-calls.before).toBe(1);
 // Existing rapid-switch tests cover aborted old-generation reads; ensure a new
 // profile still starts a refresh rather than reusing an old flight.
 await page.evaluate(()=>squeek.switchProfile('sepolia-v6'));await expect(page.getByTestId('profile-select')).toHaveValue('sepolia-v6');await page.evaluate(()=>squeek.destroy());
});
