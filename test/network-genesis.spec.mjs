import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {installDisplayFixture as install} from './display-fixture.mjs';
const capture=async(page,name)=>{fs.mkdirSync('artifacts/screenshots/phase5',{recursive:true});await page.screenshot({path:`artifacts/screenshots/phase5/${name}.png`,fullPage:true});};
const delta=(a,b)=>({api:a.api-b.api,rpc:a.rpc-b.rpc,walletReads:a.walletReads-b.walletReads});
for(const width of [1280,390])for(const scenario of ['running','resting','stale','stalled','unknown-supply','chart-gaps','genesis-available','genesis-unknown-schema'])test(`Network ${scenario} / ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:800});const {fixtures,counts}=await install(page,{countsReader:true});
 const genesis=BigInt(fixtures.core.configuration.genesisTimestamp);
 fixtures.economy.chain.safeBlockTimestamp=new Date(Number(genesis+1200n*600n)*1000).toISOString();
 if(scenario==='resting'){fixtures.status.measurement.coreStatus='IDLE';fixtures.status.measurement.rpmMilli=0;fixtures.status.measurement.speedMmPerSecond=0;}
 if(scenario==='stale')fixtures.status.measurement.freshness='stale';
 if(scenario==='stalled')fixtures.economy.chain.safeBlockTimestamp=new Date(Number(genesis+1201n*600n)*1000).toISOString();
 if(scenario==='unknown-supply'){fixtures.economy.supply=null;fixtures.economy.staking=null;}
 if(scenario==='genesis-available'){fixtures.genesis=fixtures.availableGenesis;await page.evaluate(()=>squeek.connect());await page.getByTestId('tab-network').click();}
 if(scenario==='genesis-unknown-schema')fixtures.genesis.schemaVersion=123;
 await page.evaluate(()=>squeek.refresh());await page.evaluate(()=>squeek.pollDisplay());
 await expect(page.getByTestId('wheel-state')).toHaveText(scenario==='resting'?'Resting':scenario==='stale'?'Stale':'Running');
 if(scenario==='resting')await expect(page.getByTestId('wheel-rpm')).toHaveText('0.0');
 await expect(page.getByTestId('settlement-notice'))[scenario==='stalled'?'toBeVisible':'toBeHidden']();
 if(scenario==='unknown-supply')for(const id of ['net-supply','net-issued','net-staked'])await expect(page.getByTestId(id)).toHaveText('Unknown');
 if(scenario==='chart-gaps'){
  expect(counts.paths.filter(p=>p.includes('range=7d'))).toHaveLength(0);
  fixtures.history.buckets.splice(5,1);await page.locator('#settlements-details summary').click();
  await expect(page.locator('#settlements-chart rect')).toHaveCount(28);expect(await page.locator('#settlements-chart .chart-gap').count()).toBeGreaterThanOrEqual(2);await expect(page.locator('#settlements-chart .chart-zero').first()).toBeVisible();
 }
 if(scenario==='genesis-available'){await expect(page.getByTestId('genesis-row')).toHaveText('Genesis: claimable · inventory issued: 9999');await expect(page.getByTestId('genesis-wallet')).toHaveText('Receipts: 1 · Claimable entries: 1');expect(counts.paths.some(p=>p.startsWith('/genesis-launch/wallet/'))).toBe(true);}
 else {await expect(page.getByTestId('genesis-row')).toHaveText('Genesis: not open yet');expect(counts.paths.some(p=>p.startsWith('/genesis-launch/wallet/'))).toBe(false);}
 if(scenario==='genesis-unknown-schema'){await expect(page.locator('#display-sources')).toContainText('Unsupported Genesis schemaVersion');await expect(page.getByTestId('panel-network')).not.toContainText('schemaVersion');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // Every expanded dashboard card must fit, not just the first row. Mobile may stack vertically.
 if(width===1280){const box=await page.getByTestId('panel-network').boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(800);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);}
 expect(await page.locator('#panel-network button').count()).toBe(0);await capture(page,`${scenario}-${width}`);await page.evaluate(()=>squeek.destroy());
});
test('Network browser request counts and lazy chart module',async({page})=>{
 const modules=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/settlements.js')modules.push(r.url());});
 const {counts,fixtures}=await install(page,{countsReader:true});await expect(page.locator('#display-sources')).toContainText('Genesis — Source: API');
 const cold={api:counts.api,rpc:counts.rpc,walletReads:counts.walletReads},coldPaths=[...counts.paths];expect(cold.rpc).toBe(0);expect(modules).toHaveLength(0);expect(coldPaths.some(p=>p.includes('range=7d'))).toBe(false);
 fixtures.genesis.reason='projection_rebuilding';await page.evaluate(()=>squeek.refresh());await expect(page.locator('#display-sources')).toContainText('projection_rebuilding');const warm=delta(counts,cold);
 await page.locator('#settlements-details summary').click();await expect(page.locator('#settlements-chart rect')).toHaveCount(28);expect(modules).toHaveLength(1);expect(counts.paths.filter(p=>p.includes('range=7d'))).toHaveLength(1);
 // Re-expansion uses the last valid range for sixty seconds, with no independent timer.
 await page.locator('#settlements-details summary').click();await page.locator('#settlements-details summary').click();await expect(page.locator('#settlements-chart rect')).toHaveCount(28);expect(counts.paths.filter(p=>p.includes('range=7d'))).toHaveLength(1);
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/phase5-network-browser-counts.json',JSON.stringify({scope:'Production app; intercepted synthetic API; disconnected Network cold shell and immediate refresh; no signing. v6 SDK wire counts are separately measured by phase1-safety.',v9:{cold,warm,coldPaths,chart:{api:1,rpc:0,module:1}}},null,2));await page.evaluate(()=>squeek.destroy());
});
for(const field of ['release.id','identities.core'])test(`Network API ${field} mismatch names the field and uses guarded-RPC seam`,async({page})=>{
 // Read-composition seam only. Real two-peer RPC safety is qualified in the SDK suites;
 // no production verifier/bypass or injected adapterFactory is added to the app.
 const appSource=fs.readFileSync('web/app.js','utf8').replace('function buildAdapter(profileKey) {','function buildAdapter(profileKey) { if(globalThis.__phase5RpcAdapter)return globalThis.__phase5RpcAdapter;');
 await page.addInitScript(()=>{window.__phase5RpcReads=0;window.__phase5RpcAdapter={networkStatus:async()=>{window.__phase5RpcReads++;return {core:{settledThroughRound:'777',blockHeight:'123',blockProgress:'0',paused:false},mining:{lagRounds:'0',issued:{sqk:'2'}},supply:{total:{sqk:'3'},issued:{sqk:'2'},staked:null},checkpoint:{canCheckpoint:false},verification:{ok:true,trusted:true},snapshot:{timestamp:'1000'}};},verify:async()=>({ok:true,trusted:true})};});
 const {fixtures}=await install(page,{countsReader:true,appSource});if(field==='release.id')fixtures.economy.release.id='foreign';else fixtures.economy.identities.core='0x'+'11'.repeat(20);
 await page.evaluate(()=>squeek.refresh());await expect(page.getByTestId('net-round')).toHaveText('777');await expect(page.locator('#display-sources')).toContainText(`Chain — Source: RPC · API identity mismatch: ${field}`);await expect(page.locator('#display-sources')).toContainText(`SQK — Source: RPC · API identity mismatch: ${field}`);await expect(page.getByTestId('panel-network')).not.toContainText(field);expect(await page.evaluate(()=>__phase5RpcReads)).toBeGreaterThan(0);await page.evaluate(()=>squeek.destroy());
});
for(const width of [1280,390])test(`v6 frozen cached supply and mainnet no reads / ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:800});const {counts}=await install(page,{countsReader:true});
 await page.evaluate(async()=>{const {createDisplayCache,displayKey,getProfile}=await import('/bundle.js');const cache=createDisplayCache(indexedDB),p=getProfile('sepolia-v6');await cache.set(displayKey(p,'network:'),{at:Date.now(),value:{core:{settledThroughRound:'1973',blockHeight:'1973',blockProgress:'0',paused:false},mining:{lagRounds:'0',minted:{sqk:'12'}},supply:{total:{sqk:'100'},issued:{sqk:'12'},staked:null},nft:{totalSupply:'99'},checkpoint:{canCheckpoint:false}}});});
 const before={...counts};await page.getByTestId('profile-select').selectOption('sepolia-v6');await expect(page.getByTestId('net-round')).toHaveText('1973');await page.getByTestId('tab-network').click();await expect(page.locator('#v6-frozen')).toHaveText('Settlement frozen at round 1973');await expect(page.getByTestId('net-supply')).toHaveText('100 SQK');await expect(page.locator('#net-holders')).toHaveText('Unknown');await expect(page.locator('#settlements-details')).toBeHidden();await expect(page.getByTestId('genesis-row')).toHaveText('Genesis: not open yet');expect(delta(counts,before)).toEqual({api:0,rpc:0,walletReads:0});await capture(page,`v6-frozen-${width}`);
 const prior={...counts};await page.getByTestId('profile-select').selectOption('mainnet');await expect(page.getByTestId('not-deployed')).toContainText('Genesis: not open yet');await expect(page.getByTestId('profile-status')).toHaveText('Not deployed');await expect(page.getByTestId('btn-checkpoint')).toBeHidden();expect(delta(counts,prior)).toEqual({api:0,rpc:0,walletReads:0});await capture(page,`mainnet-${width}`);await page.evaluate(()=>squeek.destroy());
});
