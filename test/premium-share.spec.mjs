import {test,expect} from '@playwright/test';
import {installHolderFixture} from './holder-workspace-fixture.mjs';

test('V2 premium exports a 2x PNG with real snapshot data and private identity',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await installHolderFixture(page,{profile:'sepolia'});
 await page.evaluate(async()=>{
  const status=await squeek.adapter.walletStatus(holderFixture.holder);status.totals.power='500000000000000000';
  squeek.adapter.walletStatus=async()=>status;await squeek.refresh();
 });
 await page.getByTestId('btn-premium-share').click();
 const modal=page.getByTestId('premium-modal');await expect(modal).toBeVisible();
 await expect(page.getByTestId('premium-card')).toContainText('0.5');
 await expect(modal).toContainText('Wallet address hidden');
 await expect(modal).not.toContainText('verified-on-chain');await expect(modal).not.toContainText('342.8');
 const download=page.waitForEvent('download');await modal.getByRole('button',{name:'Download PNG',exact:true}).click();
 const file=await download;const fs=await import('node:fs/promises'),bytes=await fs.readFile(await file.path());
 expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(680);expect(bytes.length).toBeGreaterThan(15000);
 expect(file.suggestedFilename()).not.toContain('0x');
 await modal.getByRole('button',{name:'Close premium card'}).click();await expect(modal).toHaveCount(0);
 await expect(page.getByTestId('btn-premium-share')).toBeFocused();expect(errors).toEqual([]);
 await fs.mkdir('artifacts',{recursive:true});
 await fs.writeFile('artifacts/premium-share-reviewed.png',bytes);
});

test('V2 scales on mobile, traps focus, and never leaks a hidden wallet to X',async({page})=>{
 await page.setViewportSize({width:320,height:800});await installHolderFixture(page,{profile:'sepolia'});
 await page.evaluate(()=>{window.shared=[];window.open=(...args)=>{shared.push(args);return null;};});
 await page.getByTestId('btn-premium-share').click();const modal=page.getByTestId('premium-modal');
 await expect(modal).toBeVisible();expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await modal.getByRole('button',{name:'Share on X'}).click();
 let calls=await page.evaluate(()=>shared);expect(calls).toHaveLength(1);expect(calls[0][2]).toBe('noopener,noreferrer');
 expect(decodeURIComponent(calls[0][0])).not.toContain('598958');
 const address=modal.getByRole('button',{name:'Wallet address: hidden'});await address.click();
 await expect(page.getByTestId('premium-card')).toContainText('0x5989');await modal.getByRole('button',{name:'Share on X'}).click();
 calls=await page.evaluate(()=>shared);expect(decodeURIComponent(calls[1][0])).not.toContain('598958');
 await modal.getByRole('button',{name:'Full-address link: excluded'}).click();
 await expect(modal.getByText('The X link will reveal your full wallet address.')).toBeVisible();
 await modal.getByRole('button',{name:'Share on X'}).click();
 calls=await page.evaluate(()=>shared);expect(decodeURIComponent(calls[2][0])).toContain('598958');
 await modal.getByRole('button',{name:'Wallet address: shown'}).click();
 await expect(modal.getByRole('button',{name:/Full-address link/})).toHaveCount(0);
 await address.click();await expect(modal.getByRole('button',{name:'Full-address link: excluded'})).toHaveAttribute('aria-pressed','false');
 const close=modal.getByRole('button',{name:'Close premium card'});await close.focus();await page.keyboard.press('Shift+Tab');
 await expect(modal.getByRole('button',{name:'Share on X'})).toBeFocused();await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);
 expect(await page.evaluate(()=>holderFixture.sends)).toBe(0);
});

test('V2 clipboard failures are visible and controls recover',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});await page.getByTestId('btn-premium-share').click();const modal=page.getByTestId('premium-modal');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{throw new Error('Clipboard permission denied. Use Download PNG.');}}}));
 await modal.getByRole('button',{name:'Copy image'}).click();await expect(modal.getByRole('status')).toContainText('Clipboard permission denied');
 await expect(modal.getByRole('button',{name:'Download PNG'})).toBeEnabled();
});

test('V2 copies a real PNG and shows actionable font-loading errors',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{const blob=await items[0].getType('image/png');window.copiedBytes=blob.size;}}}));
 await page.getByTestId('btn-premium-share').click();const modal=page.getByTestId('premium-modal');
 await modal.getByRole('button',{name:'Copy image'}).click();await expect(modal.getByRole('status')).toContainText('Image copied');
 expect(await page.evaluate(()=>copiedBytes)).toBeGreaterThan(15000);
 await modal.getByRole('button',{name:'Close premium card'}).click();
 // New page/module lifecycle removes the successfully cached embedded-font promise.
 await page.reload();await installHolderFixture(page,{profile:'sepolia'});
 await page.route('**/fonts/*.woff2',r=>r.request().resourceType()==='fetch'?r.fulfill({status:503,body:'offline'}):r.continue());
 await page.getByTestId('btn-premium-share').click();await modal.getByRole('button',{name:'Download PNG'}).click();
 await expect(modal.getByRole('status')).toContainText('Local export font could not be loaded');
 await expect(modal.getByRole('button',{name:'Download PNG'})).toBeEnabled();
});

test('V2 failed lazy module load leaves the dashboard usable',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});await page.route('**/premium-share.js',r=>r.abort());
 await page.getByTestId('btn-premium-share').click();
 await expect(page.getByTestId('banner')).toContainText('Premium card unavailable');
 await expect(page.getByTestId('btn-premium-share')).toBeEnabled();
 await expect(page.getByTestId('btn-share-card')).toBeEnabled();
 expect(await page.evaluate(()=>holderFixture.sends)).toBe(0);
});

test('V2 import completion preserves the new wallet loading gate',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 let release;
 await page.route('**/premium-share.js',async route=>{await new Promise(resolve=>{release=resolve;});await route.continue();});
 const button=page.getByTestId('btn-premium-share');await button.click();
 await expect.poll(()=>Boolean(release)).toBe(true);
 await page.evaluate(()=>{
  holderFixture.lateWallet=new Promise(()=>{});
  location.hash='#/sepolia/address/0x1111111111111111111111111111111111111111';
 });
 await expect(page.getByTestId('holder-owner')).toHaveAttribute('title','0x1111111111111111111111111111111111111111');
 await expect(button).toBeDisabled();release();
 await expect(button).not.toHaveAttribute('aria-busy','true');
 await expect(button).toBeDisabled();await expect(page.getByTestId('premium-modal')).toHaveCount(0);
});

test('V2 root cleanup is idempotent',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 const count=await page.evaluate(async()=>{
  const {openPremiumShare}=await import('/premium-share.js');let closed=0;
  const close=openPremiumShare({snapshot:{walletAddress:null,count:'0',power:'0',powerLabel:'Power',claimable:'—',claimed:'—',compounded:'—',network:'Sepolia',date:'2026-11-07'},holderUrl:location.href,onClosed:()=>closed++});
  close();close();return closed;
 });
 expect(count).toBe(1);await expect(page.getByTestId('premium-modal')).toHaveCount(0);
});
