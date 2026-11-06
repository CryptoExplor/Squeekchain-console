import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {installV9Fixture} from './v9-fixture.mjs';
for(const width of [1280,390])for(const mode of ['no-wallet','connected','api-blocked'])test(`Network top strip ${mode} / ${width}`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:900});
  await installV9Fixture(page,{telemetry:mode!=='api-blocked'});
  await page.evaluate(async mode=>{v9.net.core.blockProgress='500000000';if(mode==='connected')await squeek.connect();await squeek.refresh();},mode);await page.getByTestId('tab-network').click();
  await expect(page.locator('#wheel-state')).toHaveText(mode==='api-blocked'?'Offline':'Running');
  if(mode!=='api-blocked')await expect(page.locator('#wheel-rpm')).toHaveText('12.5');
  await expect(page.locator('#strip-block')).toHaveText('Squeek blocks: 8,192 · next one 50.0% done');
  await expect(page.locator('.network-strip')).not.toContainText('Unknown');await expect(page.locator('#genesis-row')).toHaveText('Genesis sale: not open yet');
  expect(await page.locator('nav [data-tab]').allTextContents()).toEqual(['Home','Squeeks','Playground','Network','Info']);
  const positions=await page.locator('.network-strip').evaluate(root=>{const rect=id=>{const r=root.querySelector(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left};};return {wheel:rect('#wheel-line'),block:rect('#strip-block'),link:rect('a'),genesis:rect('#genesis-row'),font:[root.querySelector('#wheel-line'),root.querySelector('#genesis-row')].map(n=>getComputedStyle(n).fontSize)};});
  expect(positions.font[0]).toBe(positions.font[1]);if(width===390){expect(positions.block.top).toBeGreaterThanOrEqual(positions.wheel.bottom);expect(positions.link.top).toBeGreaterThanOrEqual(positions.block.bottom);expect(positions.genesis.top).toBeGreaterThanOrEqual(positions.link.bottom);}
  if(mode==='api-blocked'){await expect(page.locator('#display-sources')).toContainText('Block height — Source: RPC');expect(await page.evaluate(()=>v9.networkCalls)).toBeGreaterThan(0);await expect(page.locator('#wheel-reading')).toBeHidden();}
  await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo({top:0,left:0,behavior:'instant'});});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);expect(await page.evaluate(()=>v9.sends)).toBe(0);
  fs.mkdirSync('artifacts/screenshots/phase5-fixes',{recursive:true});await page.screenshot({path:`artifacts/screenshots/phase5-fixes/network-${mode}-${width}.png`,fullPage:false});await page.evaluate(()=>squeek.destroy());
});
test('strip keeps last good RPM with visible age on failure, then recovers without an age label',async({page})=>{
  await installV9Fixture(page,{telemetry:true});await expect(page.locator('#wheel-rpm')).toHaveText('12.5');
  await page.evaluate(async()=>{v9.statusBlocked=true;await squeek.pollDisplay();});await expect(page.locator('#wheel-line')).toContainText('Running · 12.5 RPM · as of 1 min');await expect(page.locator('#display-sources')).toContainText('Block height — Source: RPC');
  await page.evaluate(async()=>{v9.statusBlocked=false;await squeek.pollDisplay();});await expect(page.locator('#wheel-rpm')).toHaveText('12.5');await expect(page.locator('#wheel-asof')).toBeHidden();expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
// The v6 legacy-freeze strip assertion was removed with the v6 profile; the drawer and CSP-host checks stay.
test('Activity only opens drawer; unlisted custom RPC is rejected before persistence',async({page})=>{
  await installV9Fixture(page,{telemetry:true});
  await page.locator('#holder-history-link').click();await expect(page.getByTestId('activity-drawer')).toBeVisible();expect(await page.locator('#activity-panel > p').count()).toBe(0);await page.getByTestId('activity-drawer').getByTestId('sheet-close').click();
  await page.getByTestId('settings-open').click();await page.getByTestId('rpc-url').fill('https://ethereum-sepolia-rpc.publicnode.com.evil.invalid/');await page.getByTestId('btn-save-rpc').click();await expect(page.getByTestId('rpc-test-result')).toContainText('CSP-listed host');expect(await page.evaluate(()=>localStorage.getItem('wheelhouse:rpc'))).toBeNull();expect(await page.evaluate(()=>v9.sends)).toBe(0);await page.evaluate(()=>squeek.destroy());
});
test('before the first device reading: successful empty status stays dash, actual status failure shows offline',async({page})=>{
 await installV9Fixture(page,{telemetry:true,emptyStatus:true});
 await expect(page.locator('#wheel-state')).toHaveText('Checking…');await expect(page.locator('#wheel-reading')).toBeHidden();
 await page.evaluate(async()=>{v9.statusBlocked=true;await squeek.pollDisplay();});await expect(page.locator('#wheel-state')).toHaveText('Offline');
 await page.evaluate(async()=>{v9.statusBlocked=false;v9.emptyStatus=false;await squeek.pollDisplay();});await expect(page.locator('#wheel-state')).toHaveText('Running');await expect(page.locator('#wheel-rpm')).toHaveText('12.5');await page.evaluate(()=>squeek.destroy());
});
