import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {encodeErrorResult} from 'viem';
import {staking9Abi} from '../sdk/abi-v9.js';
import {installV9Fixture} from './v9-fixture.mjs';
test.setTimeout(60_000);
const other='0x1111111111111111111111111111111111111111';
for(const action of ['claim','claimAndStake'])for(const change of ['equal','increase','lower','recipient'])test(`v9 ${action} fresh ${change}: reviewed payout guard`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());
 if(action==='claim')await page.getByTestId('btn-claim').click();
 else{await page.getByTestId('v9-action').selectOption(action);await page.getByTestId('v9-review').click();}
 await expect(page.getByTestId('modal')).toBeVisible();
 await page.evaluate(({change,other})=>{if(change==='increase'||change==='recipient')v9.claimAmount='3000000000000000000';if(change==='lower')v9.claimAmount='2000000000000000000';if(change==='recipient')v9.claimRecipient=other;},{change,other});
 await page.getByTestId('btn-modal-confirm').click();
 const allowed=['equal','increase'].includes(change);
 await expect(page.getByTestId('banner')).toContainText(allowed?'Mock wallet stops':action==='claim'?'Claim outcome changed':'Outcome or fee changed');
 expect(await page.evaluate(()=>v9.sends)).toBe(allowed?1:0);
 expect(await page.evaluate(()=>v9.previews.filter(p=>p.action==='claim'||p.action==='claimAndStake').length)).toBe(2);
 if(change==='increase')await expect(page.getByTestId('claim-update')).toHaveText('Claim amount updated: 3 SQK (reviewed 2.5 SQK).');
 await page.evaluate(()=>squeek.destroy());
});
for(const theme of ['light','dark'])for(const width of [1280,390])test(`non-owner claim recipient / ${theme} / ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:960});await installV9Fixture(page);
 if(theme==='dark')await page.getByTestId('btn-theme').click();
 await page.evaluate(async other=>{v9.claimRecipient=other;await squeek.connect();},other);
 await page.getByTestId('btn-claim').click();await expect(page.getByTestId('modal')).toBeVisible();
 const details=page.getByTestId('confirm-details');await expect(details.locator('dt')).toHaveText('Recipient');await expect(details.locator('dd')).toHaveText(other);await expect(details.locator('dd')).toHaveClass('recipient-warning');
 await expect(page.getByTestId('modal-body')).toContainText('Recipient differs from the owner');
 expect(await details.locator('dd').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>v9.sends)).toBe(0);
 await page.evaluate(()=>document.fonts.ready);const image=await page.screenshot({animations:'disabled'});const name=`claim-recipient-${theme}-${width}.png`;await info.attach(name,{body:image,contentType:'image/png'});if(process.env.UPDATE_SCREENSHOTS==='1')fs.writeFileSync('docs/screenshots/'+name,image);
 await page.getByTestId('btn-modal-cancel').click();await page.evaluate(()=>squeek.destroy());
});
const expired=encodeErrorResult({abi:staking9Abi,errorName:'DeadlineExpired',args:[]});
for(const source of ['simulation','wallet'])test(`DeadlineExpired from ${source}: Quote expired and explicit Re-quote`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());await page.getByTestId('v9-action').selectOption('unstake');await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();await expect(page.getByTestId('modal')).toBeVisible();
 await page.evaluate(({source,data})=>{if(source==='simulation')v9.simulationError={cause:{data}};else v9.sendError={code:-32000,data:{originalError:{data}}};},{source,data:expired});
 await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('quote-reason')).toHaveText('Quote expired');await expect(page.getByTestId('modal')).toBeHidden();
 await expect(page.getByRole('button',{name:'Re-quote',exact:true})).toHaveCount(1);await expect(page.getByTestId('fee-quote')).toContainText('SQK received');
 expect(await page.evaluate(()=>v9.sends)).toBe(source==='wallet'?1:0);
 await page.getByRole('button',{name:'Re-quote',exact:true}).click();await expect(page.getByTestId('modal')).toBeVisible();expect(await page.evaluate(()=>v9.sends)).toBe(source==='wallet'?1:0);
 // This is a new review, not an automatic retry of the expired deadline/cap.
 expect(await page.evaluate(()=>v9.previews.at(-1).input.deadline)).toBeUndefined();expect(await page.evaluate(()=>v9.previews.at(-1).input.maxFee)).toBeUndefined();
 await page.getByTestId('btn-modal-cancel').click();await page.evaluate(()=>squeek.destroy());
});
test.describe('local quote deadline',()=>{
 test.use({timezoneId:'Asia/Kolkata'});
 test('unstake deadline is displayed in the browser local time zone',async({page})=>{
  await installV9Fixture(page);await page.evaluate(()=>squeek.connect());await page.getByTestId('v9-action').selectOption('unstake');await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();
  const expected=await page.evaluate(()=>new Date(1900000000000).toLocaleString(undefined,{timeZoneName:'short'}));expect(expected).toContain('GMT+5:30');
  await expect(page.getByTestId('confirm-details').locator('dd').nth(3)).toHaveText(expected);await page.getByTestId('btn-modal-cancel').click();await page.evaluate(()=>squeek.destroy());
 });
});
test('cross-origin messages cannot inherit or reveal connected/inspected wallet state',async({page,context})=>{
 await installV9Fixture(page);await page.evaluate(async()=>{await squeek.connect();localStorage.setItem('wheelhouse:rpc','https://private.example/?secret=wallet-session');});
 await context.route('https://other.example/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Foreign agent</title>'}));
 const opened=page.waitForEvent('popup');await page.evaluate(()=>window.open('https://other.example/'));const foreign=await opened;await foreign.waitForLoadState('domcontentloaded');
 for(const [name,args] of [['squeek_wallet_status',{}],['squeek_wallet_status',{from:other}],['squeek_request_claim',{owner:other}],['squeek_claim_preview',{owner:other}],['squeek_prepare_claim',{owner:other}]]) {
  const reply=await foreign.evaluate(({name,args})=>new Promise(resolve=>{const handler=e=>{if(e.data?.type==='squeek.result'&&e.data.id===name){removeEventListener('message',handler);resolve(e.data);}};addEventListener('message',handler);opener.postMessage({type:'squeek.tool',id:name,name,args},'http://127.0.0.1:4173');}),{name,args});
  expect(reply.ok).toBe(false);expect(reply.result.error).toMatch(/explicit.*owner|public reads only/);expect(JSON.stringify(reply)).not.toMatch(/598958|wallet-session|private\.example|activeProfile|availableTools|inspected|account/);
 }
 expect(await page.evaluate(()=>v9.previews.length)).toBe(0);expect(await page.evaluate(()=>v9.sends)).toBe(0);await expect(page.getByTestId('modal')).toBeHidden();await foreign.close();await page.evaluate(()=>squeek.destroy());
});
test('Cloudflare strict CSP is enforced without breaking external styles/modules or modal CSSOM',async({page})=>{
 await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.violatedDirective));});
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());await page.getByTestId('btn-claim').click();await expect(page.getByTestId('modal')).toBeVisible();await page.getByTestId('btn-modal-cancel').click();
 await page.getByTestId('settings-open').click();await expect(page.getByTestId('settings-sheet')).toBeVisible();await page.keyboard.press('Escape');
 await page.getByTestId('tab-info').click();await page.getByTestId('info-link-developers').click();await page.getByTestId('btn-copy-manifest').click();
 expect(await page.evaluate(()=>cspViolations)).toEqual([]);
 const headers=(await page.request.get('/')).headers();expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
 await page.evaluate(()=>{window.inlineRan=false;const script=document.createElement('script');script.textContent='window.inlineRan=true';document.body.append(script);});
 await expect.poll(()=>page.evaluate(()=>cspViolations)).toContain('script-src-elem');expect(await page.evaluate(()=>inlineRan)).toBe(false);await page.evaluate(()=>squeek.destroy());
});
