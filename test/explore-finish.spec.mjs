// OFFLINE regression: actual production reader + SDK, synthetic pins/RPC only.
// Live qualification uses browser-readonly-qa.mjs separately, without these routes.
import {test,expect} from '@playwright/test';
import {createExploreWireFixture} from './explore-wire-fixture.mjs';
import {installV9Fixture,mountV9Fixture} from './v9-fixture.mjs';
import {PUBLIC_RPCS} from '../sdk/rpc.js';
import {observeExplore} from './explore-observer.mjs';
let wire;
test.beforeAll(async()=>{wire=await createExploreWireFixture({browser:true,count:480});});
async function setup(page,{failFinal=false,stallFinal=false,delayHydration=false}={}){
 await page.addInitScript(observeExplore);await installV9Fixture(page);
 await page.route('**/explore-chain.js',route=>route.fulfill({contentType:'text/javascript',body:wire.readerSource}));
 const seen={final:[],hydrations:0};
 for(const endpoint of PUBLIC_RPCS)await page.route(endpoint+'**',async route=>{
  const request=route.request(),payload=request.postDataJSON(),items=Array.isArray(payload)?payload:[payload];
  const phase=await page.locator('#explore-content').getAttribute('data-phase');
  if(phase==='final'){
   seen.final.push(...items.map(q=>q.method));
   if(stallFinal)return; // never answered: only the app's own bounded final window can end this
   if(failFinal){const body=items.map(q=>({jsonrpc:'2.0',id:q.id,result:q.method==='eth_getBlockByNumber'?{number:q.params[0],hash:'0x'+'ff'.repeat(32),timestamp:'0x6553f100',transactions:[]}:null}));await route.fulfill({contentType:'application/json',body:JSON.stringify(Array.isArray(payload)?body:body[0])});return;}
  }
  if(phase==='hydrate'&&items.some(q=>q.method==='eth_call')){seen.hydrations++;if(delayHydration)await new Promise(resolve=>setTimeout(resolve,200));}
  const response=await wire.fetcher(request.url(),{body:request.postData()});
  await route.fulfill({contentType:'application/json',body:await response.text()});
 });
 await page.evaluate(async()=>{
  // Empty the real IndexedDB, not a memory-store substitute.
  const {createDiscoveryStore}=await import('/bundle.js');await createDiscoveryStore(indexedDB).clear();
  window.exploreTimes={};const observer=new MutationObserver(()=>{const root=document.getElementById('explore-content');if(root?.dataset.phase==='final')exploreTimes.final??=performance.now();if(root?.dataset.indexStatus==='complete')exploreTimes.complete??=performance.now();});observer.observe(document.getElementById('explore-content'),{attributes:true,childList:true,subtree:true});
 });
 return seen;
}
test('empty IndexedDB: real same-snapshot final guard renders stats and leaderboard within five seconds',async({page})=>{
 const seen=await setup(page);await page.evaluate(()=>location.hash='#sepolia/explore?section=leaders');
 await expect(page.locator('#explore-content')).toHaveAttribute('data-index-status','complete');
 await expect(page.locator('.explore-stats .stat').first()).toContainText('480');
 await expect(page.getByTestId('explore-leaderboard').locator('tbody tr').first()).toBeVisible();
 const times=await page.evaluate(()=>__qaExplore);expect(times.initialDatabases).toEqual([]);expect(times.finalAt).toBeGreaterThan(0);expect(times.hundredAt).toBeGreaterThan(0);expect(times.renderedAt).toBeGreaterThanOrEqual(times.finalAt);expect(times.renderedAt-times.hundredAt).toBeLessThan(5000);expect(times.leaderRows).toBeGreaterThan(0);
 expect(seen.final.filter(m=>m==='eth_getBlockByNumber').length).toBeGreaterThanOrEqual(2);expect(seen.final).not.toContain('eth_getLogs');expect(seen.final).not.toContain('eth_getStorageAt');
 expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
// The final supply/snapshot check now retries (4 attempts, 20s window each) and, when it
// still cannot confirm, KEEPS the hydrated data as an 'incomplete' index with a Retry button
// instead of discarding it ('unavailable'). The bounded-failure guarantee is the same:
// progress never stays running and the user is always offered Retry.
const expectBoundedRetry=async page=>{
 await expect(page.locator('#explore-content')).toHaveAttribute('data-phase','done');
 await expect(page.locator('#explore-content>p').first()).toHaveText("Couldn't finish, retry");
 await expect(page.locator('#explore-content').getByRole('button',{name:'Retry',exact:true})).toBeVisible();
};
test('final mismatch: bounded failure offers Retry, never leaves progress running',async({page})=>{
 await setup(page,{failFinal:true});await page.getByTestId('tab-explore').click();
 await expect(page.locator('#explore-content')).toHaveAttribute('data-index-status','incomplete',{timeout:25_000});
 await expectBoundedRetry(page);
 expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
test('final timeout: bounded failure offers Retry, never leaves progress running',async({page})=>{
 // Fake timers so the 4 x 20s final windows elapse without 80s of wall time. Final-phase
 // RPC requests never answer; everything before the final phase runs on real-time flow.
 await page.clock.install();
 const seen=await setup(page,{stallFinal:true});await page.getByTestId('tab-explore').click();
 await expect(page.locator('#explore-content')).toHaveAttribute('data-phase','final');
 await expect.poll(async()=>{await page.clock.fastForward(21_000);return page.locator('#explore-content').getAttribute('data-index-status');},{timeout:20_000,intervals:[100]}).toBe('incomplete');
 await expectBoundedRetry(page);
 expect(seen.final.length).toBeGreaterThan(0);
 expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
test('partial stats, leaderboard and controls; actual reload at 50% resumes IndexedDB hydration chunks',async({page})=>{
 const seen=await setup(page,{delayHydration:true});await page.getByTestId('tab-explore').click();
 await expect(page.locator('#explore-content')).toHaveAttribute('data-index-status','partial');
 await page.waitForFunction(()=>Number(document.getElementById('explore-content').dataset.hydrated)>=240);
 await expect(page.locator('#explore-content>p').first()).toContainText('Partial');await expect(page.locator('.explore-stats')).toBeVisible();await expect(page.locator('#explore-content').getByRole('combobox',{name:'Level',exact:true})).toBeVisible();
 const before=seen.hydrations;await page.reload();await mountV9Fixture(page);
 await page.getByTestId('tab-explore').click();await expect(page.locator('#explore-content')).toHaveAttribute('data-index-status','complete');
 await expect(page.locator('#explore-content')).toHaveAttribute('data-resumed','true');expect(seen.hydrations-before).toBeLessThan(8);
 await page.locator('#explore-content button[data-section=leaders]').click();await expect(page.getByTestId('explore-leaderboard').locator('tbody tr').first()).toBeVisible();await page.evaluate(()=>squeek.destroy());
});
