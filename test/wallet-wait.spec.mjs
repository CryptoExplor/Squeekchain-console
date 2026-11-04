import {test,expect} from '@playwright/test';
import {installV9Fixture} from './v9-fixture.mjs';
for(const outcome of ['reject','closed'])test(`wallet ${outcome} releases the app lock without a sticky banner`,async({page})=>{
 await installV9Fixture(page);await page.evaluate(async outcome=>{await squeek.connect();const request=ethereum.request;ethereum.request=async args=>{if(args.method==='eth_sendTransaction')throw Object.assign(new Error(outcome==='reject'?'User rejected request':'Wallet closed'),{code:outcome==='reject'?4001:undefined});return request(args);};window.result=squeek.requestCheckpoint();},outcome);
 await page.waitForFunction(()=>!squeek.state.busy);expect(await page.evaluate(async()=>await window.result)).toMatchObject({ok:false});await expect(page.locator('#wallet-wait')).toBeHidden();await expect(page.getByTestId('banner')).toBeHidden();
});
test('Cancel releases the app lock; a late wallet hash still reaches Activity',async({page})=>{
 await installV9Fixture(page);await page.evaluate(async()=>{await squeek.connect();const request=ethereum.request;ethereum.request=args=>args.method==='eth_sendTransaction'?new Promise(resolve=>window.lateHash=resolve):request(args);window.pendingWallet=squeek.requestCheckpoint();});
 await expect(page.locator('#wallet-wait')).toContainText('Waiting for your wallet…');await page.locator('#wallet-cancel').click();expect(await page.evaluate(()=>squeek.state.busy)).toBe(false);expect(await page.evaluate(async()=>await pendingWallet)).toMatchObject({ok:false});await expect(page.locator('#wallet-wait')).toBeHidden();
 const hash='0x'+'ab'.repeat(32);await page.evaluate(hash=>lateHash(hash),hash);await expect.poll(()=>page.evaluate(()=>squeek.activity.list().length)).toBe(1);expect(await page.evaluate(()=>squeek.activity.list()[0].hash)).toBe(hash);expect(await page.evaluate(()=>squeek.state.busy)).toBe(false);
});
test('preview summary is plain and technical details are collapsed',async({page})=>{
 await installV9Fixture(page);await page.evaluate(()=>squeek.connect());await page.locator('[data-action="unstake"]').click();await page.getByTestId('v9-amount').fill('1');await page.getByTestId('v9-review').click();const preview=page.getByTestId('v9-result');await expect(preview).toContainText('Simulation passed');await expect(preview.locator('details')).not.toHaveAttribute('open','');await expect(preview.locator('summary')).toHaveText('Technical details');await expect(preview.locator('button')).toHaveText('Copy');
});
