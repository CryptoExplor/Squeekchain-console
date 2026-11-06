import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { installReviewFixture } from './review-fixture.mjs';
import { installV9Fixture } from './v9-fixture.mjs';

const other='0x1111111111111111111111111111111111111111';
const actions={checkpoint:'checkpoint',claim:'claim',merge:'merge',deposit:'deposit',withdraw:'withdraw',merge_deposited:'mergeDeposited',claim_and_stake:'claimAndStake',stake:'stake',unstake:'unstake'};
for(const [name,action] of Object.entries(actions)) for(const profile of (['checkpoint','claim','merge'].includes(name)?['sepolia']:['sepolia'])) test(`agent request ${name} / ${profile}: simulation and human wallet only`,async({page})=>{
  await installV9Fixture(page);await page.evaluate(()=>squeek.connect());
  await page.evaluate(()=>Object.assign(v9.tx,{gas:'0x111',gasPrice:'0x222',maxFeePerGas:'0x333',maxPriorityFeePerGas:'0x444'}));
  if(profile==='sepolia'){await page.getByTestId('profile-select').selectOption(profile);expect(await page.evaluate(()=>v9.adapterProfiles)).toContain('sepolia');}
  const input={survivor:'41',donor:'42',confirm:'BURN-42',tokenIds:['87'],amount:'1000000000000000000'};
  if(name.includes('merge')) {
    const refused=await page.evaluate(([name,input])=>squeek.callTool(name,{...input,confirm:''}),[`squeek_request_${name}`,input]);
    expect(refused.error).toContain('BURN-42');expect(await page.evaluate(()=>v9.previews.length)).toBe(0);
  }
  await page.evaluate(([name,input])=>{window.agentResult=null;void squeek.callTool(name,input).then(result=>window.agentResult=result);},[`squeek_request_${name}`,input]);
  if(name!=='checkpoint') {
    await expect(page.getByTestId('modal')).toBeVisible();
    expect(await page.evaluate(()=>v9.sends)).toBe(0);
    if(name.includes('merge')) {
      expect(await page.evaluate(()=>v9.previews.length)).toBe(0);
      await page.getByTestId('modal-input').fill('42');await expect(page.getByTestId('btn-modal-confirm')).toBeDisabled();
      await page.getByTestId('modal-input').fill('BURN-42');await page.getByTestId('btn-modal-confirm').click();
      await expect(page.getByTestId('modal-input')).toBeHidden();
    }
    await expect(page.getByTestId('modal')).not.toContainText('Gas estimate');await expect(page.getByTestId('modal')).not.toContainText('Simulated gas');await page.getByTestId('btn-modal-confirm').click();
  }
  await page.waitForFunction(()=>window.agentResult!==null);
  const result=await page.evaluate(()=>({result:agentResult,previews:v9.previews,sends:v9.sends,transactions:v9.sentTransactions}));
  expect(result.transactions).toHaveLength(1);expect(Object.keys(result.transactions[0]).sort()).toEqual(['data','from','to','value']);expect(result.transactions[0].value).toBe('0x0');
  expect(result.result.error).toContain('Mock wallet stops');expect(result.sends).toBe(1);
  expect(result.previews).toHaveLength(name==='checkpoint'?1:2);
  expect(result.previews.every(p=>p.action===action)).toBe(true);
  await page.evaluate(()=>squeek.destroy());
});

test('agent requests reject cross-origin messages and profile changes; same-origin postMessage reaches human review',async({page})=>{
  await installV9Fixture(page);await page.evaluate(()=>squeek.connect());
  await page.evaluate(names=>{for(const name of names)window.dispatchEvent(new MessageEvent('message',{origin:'https://other.example',source:window,data:{type:'squeek.tool',name:`squeek_request_${name}`,args:{survivor:'41',donor:'42',confirm:'BURN-42'}}}));},Object.keys(actions));
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,30)));
  expect(await page.evaluate(()=>({previews:v9.previews.length,sends:v9.sends}))).toEqual({previews:0,sends:0});
  expect((await page.evaluate(()=>squeek.callTool('squeek_request_checkpoint',{profile:'sepolia'}))).error).toContain('Select the requested profile');
  await page.evaluate(()=>{window.agentReply=null;window.addEventListener('message',event=>{if(event.data?.type==='squeek.result'&&event.data.id==='same-origin')window.agentReply=event.data;});window.postMessage({type:'squeek.tool',id:'same-origin',name:'squeek_request_claim',args:{}},location.origin);});
  await expect(page.getByTestId('modal')).toBeVisible();expect(await page.evaluate(()=>v9.previews.length)).toBe(1);
  await page.getByTestId('btn-modal-cancel').click();await page.waitForFunction(()=>window.agentReply!==null);
  expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});

test('watch mode keeps wallet identity, disables owner requests and exits to connected or empty view',async({page})=>{
  await installReviewFixture(page);await page.evaluate(()=>squeek.connect());
  await expect(page.getByTestId('watch-input')).toHaveAttribute('placeholder','0x… (view only)');
  await page.getByTestId('watch-input').fill(other);await page.getByTestId('btn-watch').click();
  await expect(page.getByTestId('watch-mode')).toBeVisible();await expect(page.getByTestId('watch-chip')).toContainText('Viewing 0x1111…1111');
  await expect(page.getByTestId('wallet-button')).toContainText('0x5989');await expect(page.getByTestId('btn-claim')).toBeDisabled();
  expect((await page.evaluate(()=>squeek.callTool('squeek_request_claim'))).error).toContain('view-only');
  await page.getByTestId('btn-exit-watch').click();await expect(page.getByTestId('watch-mode')).toBeHidden();await expect(page.getByTestId('btn-claim')).toBeEnabled();
  await page.getByTestId('watch-input').fill((await page.evaluate(()=>squeek.state.account)).toLowerCase());await page.getByTestId('btn-watch').click();await expect(page.getByTestId('watch-mode')).toBeVisible();await expect(page.getByTestId('btn-claim')).toBeDisabled();await page.getByTestId('btn-exit-watch').click();await expect(page.getByTestId('watch-mode')).toBeHidden();
  await page.getByTestId('wallet-button').click();await page.getByTestId('btn-disconnect').click();await page.getByTestId('tab-squeeks').click();
  await page.getByTestId('watch-input').fill(other);await page.getByTestId('btn-watch').click();await expect(page.getByTestId('watch-mode')).toBeVisible();
  await page.getByTestId('btn-exit-watch').click();await expect(page.getByTestId('watch-mode')).toBeHidden();await expect(page.getByTestId('holder-empty')).toBeVisible();await expect(page.getByTestId('holder-empty')).toContainText('Connect your wallet to see your Squeeks and SQK.');await page.evaluate(()=>squeek.destroy());
});

async function seedPending(page) {
  await page.addInitScript(()=>localStorage.setItem('wheelhouse:pending-transactions:v1',JSON.stringify([{hash:'0x'+'ab'.repeat(32),label:'checkpoint()',profile:'sepolia',chainId:11155111,time:'2026-11-03T15:00:00.000Z',status:'pending'}])));
}
test('pending activity persists across switches; warning is a conditional View toast, never permanent header text',async({page})=>{
  await seedPending(page);await installReviewFixture(page);
  await expect(page.locator('#profile-pending-notice')).toHaveCount(0);await expect(page.locator('.toast')).toHaveCount(0);
  await page.getByTestId('profile-select').selectOption('sepolia');await expect(page.locator('.toast').last()).toContainText("1 transaction still pending. Switching won't cancel it.");expect(await page.evaluate(()=>squeek.activity.list().length)).toBe(1);
  await page.getByTestId('profile-select').selectOption('mainnet');expect(await page.evaluate(()=>squeek.activity.list().length)).toBe(1);
  await page.locator('.toast').last().getByRole('button',{name:'View',exact:true}).click();await expect(page.getByTestId('activity-drawer')).toBeVisible();await page.getByTestId('activity-drawer').locator('[data-close-sheet]').click();
  await page.getByTestId('settings-open').click();await page.getByTestId('btn-clear-activity').click();await page.getByTestId('btn-modal-confirm').click();await page.getByTestId('settings-sheet').locator('[data-close-sheet]').click();
  for(const button of await page.locator('.toast-close').all())await button.click();await page.getByTestId('profile-select').selectOption('sepolia');await expect(page.locator('.toast')).toHaveCount(0);await page.evaluate(()=>squeek.destroy());
});

test('Trust checklist tracks verified, stopped and unknown; Developers wallet permissions are accurate',async({page})=>{
  await installV9Fixture(page);await page.getByTestId('tab-info').click();
  await expect(page.getByTestId('trust-checklist').locator('li')).toHaveCount(7);await expect(page.getByTestId('trust-checklist')).toHaveAttribute('data-state','verified');
  for(const text of ['Network','Contract permissions','Contract software','Versions','Data compatibility','Connected contracts','Two RPC peers agreeing on the block hash'])await expect(page.getByTestId('trust-checklist')).toContainText(text);
  await page.evaluate(async()=>{v9.net.verification.trusted=false;await squeek.refresh();});await expect(page.getByTestId('trust-checklist')).toHaveAttribute('data-state','stopped');await expect(page.getByTestId('verified-chip')).toHaveText('Stopped');
  await page.getByTestId('profile-select').selectOption('mainnet');await expect(page.getByTestId('trust-checklist')).toHaveAttribute('data-state','unknown');
  await page.getByTestId('info-link-developers').click();await expect(page.getByTestId('developer-surfaces')).toBeHidden();await page.locator('#agent-setup>summary').click();await expect(page.getByTestId('developer-surfaces').locator('tbody tr').nth(1)).toContainText('Your wallet popup');
  await expect(page.getByTestId('developer-surfaces').locator('tbody tr').nth(0)).toContainText('No');await expect(page.getByTestId('developer-surfaces').getByRole('row').filter({has:page.getByRole('rowheader',{name:'SDK',exact:true})})).toContainText('No');
  await expect(page.getByTestId('developer-surfaces').locator('tfoot')).toHaveText('Agents never see a private key.');await page.evaluate(()=>squeek.destroy());
});

for(const theme of ['light','dark'])for(const width of [1280,390])for(const view of ['stall-network','stall-squeeks','watch','pending'])test(`restored context ${view} / ${theme} / ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:960});await page.emulateMedia({reducedMotion:'reduce'});
  if(view==='pending')await seedPending(page);
  await installReviewFixture(page);if(theme==='dark')await page.getByTestId('btn-theme').click();
  if(view.startsWith('stall'))await page.evaluate(async()=>{Object.assign(reviewNetwork.core,{settledThroughRound:'1973',genesisTimestamp:'1000',roundDuration:'600'});Object.assign(reviewNetwork.snapshot,{timestamp:String(1000+1976*600)});await squeek.refresh();});
  if(view==='stall-squeeks'||view==='watch')await page.evaluate(()=>squeek.connect());
  if(view==='watch'){await page.getByTestId('watch-input').fill(other);await page.getByTestId('btn-watch').click();await expect(page.getByTestId('watch-mode')).toBeVisible();}
  if(view==='stall-squeeks')await expect(page.getByTestId('holder-rewards-notice')).toBeVisible();
  if(view==='stall-network'){await expect(page.getByTestId('settlement-notice')).toBeHidden();await expect(page.locator('#v6-frozen')).toHaveText('Settlement frozen at round 1973');}
  if(view==='pending'){await page.getByTestId('profile-select').selectOption('sepolia');await expect(page.locator('.toast').last()).toContainText('1 transaction still pending');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>document.fonts.ready);const image=await page.screenshot({fullPage:true,animations:'disabled'});const name=`${view}-${theme}-${width}.png`;await info.attach(name,{body:image,contentType:'image/png'});fs.mkdirSync('artifacts/screenshots',{recursive:true});fs.writeFileSync('artifacts/screenshots/'+name,image);
  await page.evaluate(()=>squeek.destroy());
});

for(const action of ['approveNft','approveAll','approveSqk'])test(`wallet owns gas and fees for ${action}`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(async action=>{await squeek.connect();Object.assign(v9.tx,{gas:'0x111',gasPrice:'0x222',maxFeePerGas:'0x333',maxPriorityFeePerGas:'0x444'});window.gasActionResult=null;void squeek.requestAction(action,{tokenId:'87',amount:'1000000000000000000'}).then(result=>window.gasActionResult=result);},action);
 await expect(page.getByTestId('modal')).toBeVisible();await expect(page.getByTestId('modal')).not.toContainText('Gas estimate');await page.getByTestId('btn-modal-confirm').click();await expect.poll(()=>page.evaluate(()=>v9.sentTransactions.length)).toBe(1);const tx=await page.evaluate(()=>v9.sentTransactions[0]);expect(Object.keys(tx).sort()).toEqual(['data','from','to','value']);await page.evaluate(()=>squeek.destroy());
});
