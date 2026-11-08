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

for(const width of [375,1280])test(`V2 cold first export at ${width}px preserves full frame, hero and local assets`,async({page})=>{
 await page.setViewportSize({width,height:800});await installHolderFixture(page,{profile:'sepolia'});
 await page.evaluate(()=>{window.encodedFrames=[];const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){encodedFrames.push([this.width,this.height]);return original.apply(this,args);};});
 const remote=[];page.on('request',r=>{if(new URL(r.url()).origin!==new URL(page.url()).origin)remote.push(r.url());});
 await page.getByTestId('btn-premium-share').click();const modal=page.getByTestId('premium-modal'),card=page.getByTestId('premium-card');
 await expect(card.locator('img')).toHaveCount(0);expect(await card.locator('svg').count()).toBeGreaterThan(0);
 expect(await card.evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight,minWidth:getComputedStyle(el).minWidth,shrink:getComputedStyle(el).flexShrink}))).toEqual({width:600,height:340,minWidth:'600px',shrink:'0'});
 const pending=page.waitForEvent('download');await modal.getByRole('button',{name:'Download PNG',exact:true}).click();
 const fs=await import('node:fs/promises'),bytes=await fs.readFile(await(await pending).path());
 expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(680);
 const pixels=await page.evaluate(async base64=>{
  const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'}));
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  const count=(x,y,w,h,predicate)=>{const {data}=ctx.getImageData(x,y,w,h);let n=0;for(let i=0;i<data.length;i+=4)if(predicate(data[i],data[i+1],data[i+2],data[i+3]))n++;return n;};
  return {hero:count(48,240,540,90,(r,g,b,a)=>r<30&&g>210&&b>170&&b<240&&a===255),rightStats:count(700,240,430,250,(r,g,b,a)=>r>180&&g>180&&b>180&&a===255),edge:[...ctx.getImageData(1198,678,1,1).data],fonts:document.fonts.check('500 16px PremiumMono')&&document.fonts.check('700 16px PremiumSans')};
 },bytes.toString('base64'));
 expect(await page.evaluate(()=>window.encodedFrames)).toEqual([[600,340],[1200,680]]);
 expect(pixels.hero).toBeGreaterThan(100);expect(pixels.rightStats).toBeGreaterThan(100);expect(pixels.edge[3]).toBe(255);expect(pixels.fonts).toBe(true);expect(remote).toEqual([]);
});

test('V2 clipboard receives a pending PNG within the trusted click even with delayed export fonts',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 let release;
 let unblock;const gate=new Promise(resolve=>{unblock=resolve;});
 await page.route('**/fonts/*.woff2',async route=>{
  if(route.request().resourceType()==='fetch'){release=true;await gate;}await route.continue();
 });
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{
  window.copyActivation=navigator.userActivation.isActive;window.copyCalled=true;
  const blob=await items[0].getType('image/png');window.copySize=blob.size;
 }}}));
 await page.getByTestId('btn-premium-share').click();const modal=page.getByTestId('premium-modal');
 await modal.getByRole('button',{name:'Copy image'}).click();
 await expect.poll(()=>page.evaluate(()=>window.copyCalled)).toBe(true);expect(await page.evaluate(()=>window.copyActivation)).toBe(true);
 await expect.poll(()=>Boolean(release)).toBe(true);expect(await page.evaluate(()=>window.copySize)).toBeUndefined();
 unblock();await expect(modal.getByRole('status')).toContainText('Image copied');expect(await page.evaluate(()=>window.copySize)).toBeGreaterThan(15000);
});

test('V2 unknown metrics stay unknown without NaN, fabricated PnL or a verification claim',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 await page.evaluate(async()=>{
  const {openPremiumShare}=await import('/premium-share.js');
  openPremiumShare({snapshot:{walletAddress:null,count:undefined,power:'NaN',powerLabel:'Power',claimable:null,claimed:'Infinity',compounded:'Not available',network:'Sepolia',date:'2026-11-07'},holderUrl:location.href});
 });
 const card=page.getByTestId('premium-card');await expect(card).toBeVisible();await expect(card).not.toContainText(/NaN|Infinity|342\.8|verified-on-chain/);expect((await card.innerText()).match(/—/g)).toHaveLength(5);
});

test('V2 native Chromium clipboard round-trips a real 1200x680 PNG',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await installHolderFixture(page,{profile:'sepolia'});await page.getByTestId('btn-premium-share').click();
 const modal=page.getByTestId('premium-modal');await modal.getByRole('button',{name:'Copy image'}).click();
 await expect(modal.getByRole('status')).toContainText('Image copied');
 expect(await page.evaluate(async()=>{
  const items=await navigator.clipboard.read(),blob=await items[0].getType('image/png'),bitmap=await createImageBitmap(blob);
  const result={type:blob.type,width:bitmap.width,height:bitmap.height};bitmap.close();return result;
 })).toEqual({type:'image/png',width:1200,height:680});
});
