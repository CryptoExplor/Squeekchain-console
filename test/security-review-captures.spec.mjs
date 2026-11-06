import {test,expect} from '@playwright/test';
import {installV9Fixture} from './v9-fixture.mjs';
import {getProfile} from '../sdk/deployments.js';

for(const width of [390,1280])for(const action of ['approveAll','approveNft','approveSqk'])test(`approval review capture ${action} ${width}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:960});await installV9Fixture(page);const {staking,nft,token}=getProfile('sepolia').addresses;
 await page.evaluate(async({action,staking,nft,token})=>{
  await squeek.connect();const read=squeek.adapter.actionPreview;
  squeek.adapter.actionPreview=async(...args)=>{const preview=await read(...args);return {...preview,tx:{...preview.tx,to:action==='approveSqk'?token:nft},recipient:undefined,amount:action==='approveSqk'?'1000000000000000000':undefined,spender:staking,scope:action==='approveAll'?'collection':action==='approveNft'?'token':'exact amount',...(action==='approveNft'?{tokenId:'87'}:{}),...(action==='approveSqk'?{amount:'1000000000000000000'}:{}),warning:action==='approveAll'?'Allow staking to transfer ALL current and future NFTs. Broad approval can be revoked in your wallet.':action==='approveNft'?'Allow staking to transfer NFT #87':'Allow staking to spend exactly this SQK amount'};};
  window.reviewRequest=squeek.requestAction(action,{amount:'1000000000000000000',tokenId:'87'});
 },{action,staking,nft,token});
 await expect(page.getByTestId('modal')).toBeVisible();await expect(page.getByTestId('confirm-details')).toContainText(staking);await expect(page.getByTestId('btn-modal-confirm')).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=await page.getByTestId('modal').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`artifacts/screenshots/security-review-${action}-${width}.png`,fullPage:true});expect(errors).toEqual([]);expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.getByTestId('btn-modal-cancel').click();await page.evaluate(()=>squeek.destroy());
});

test('Cancel during wallet preflight prevents overlapping sends and never submits when preflight resolves',async({page})=>{
 await installV9Fixture(page);await page.evaluate(async()=>{
  await squeek.connect();const request=ethereum.request;window.chainRequests=0;ethereum.request=args=>{if(args.method==='eth_chainId'){chainRequests++;return new Promise(resolve=>window.finishPreflight=resolve);}return request(args);};window.preflightSend=squeek.requestCheckpoint();
 });await page.waitForFunction(()=>typeof finishPreflight==='function');await page.locator('#wallet-cancel').click();expect(await page.evaluate(()=>squeek.state.busy)).toBe(false);expect(await page.evaluate(()=>squeek.state.walletPromptPending)).toBe(true);expect(await page.evaluate(()=>squeek.requestCheckpoint())).toMatchObject({ok:false});expect(await page.evaluate(()=>chainRequests)).toBe(1);await page.evaluate(()=>finishPreflight('0xaa36a7'));await expect.poll(()=>page.evaluate(()=>squeek.state.walletPromptPending)).toBe(false);expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
test('changed approval spender after confirmation stops before any wallet prompt',async({page})=>{
 await installV9Fixture(page);await page.evaluate(async()=>{
  await squeek.connect();const read=squeek.adapter.actionPreview;let previews=0;squeek.adapter.actionPreview=async(...args)=>({...await read(...args),amount:'1000000000000000000',scope:'exact amount',spender:++previews===1?'0x1111111111111111111111111111111111111111':'0x2222222222222222222222222222222222222222'});window.changedTerms=squeek.requestAction('approveSqk',{amount:'1000000000000000000'});
 });await expect(page.getByTestId('modal')).toBeVisible();await page.getByTestId('btn-modal-confirm').click();await expect(page.getByTestId('banner')).toContainText('Outcome or fee changed');expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
