import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {decodeFunctionData,encodeFunctionResult,multicall3Abi} from 'viem';
import {staking9Abi} from '../sdk/abi-v9.js';
import {nftAbi} from '../sdk/abi.js';
import {displayFixtures,fixtureRoute,owner} from './fixtures/display-api.mjs';
import {installDisplayFixture as install} from './display-fixture.mjs';
test('production display path: API-only network; holder connect; lock, switch, wrong chain, disconnect/reload',async({page})=>{
 const {counts}=await install(page);const cold={...counts};expect(cold.rpc).toBe(0);await page.evaluate(()=>window.squeek.refresh());await expect(page.getByTestId('net-round')).toHaveText('1198');const warm={api:counts.api-cold.api,rpc:counts.rpc-cold.rpc};const before={api:counts.api,rpc:counts.rpc,walletReads:counts.walletReads};await page.evaluate(()=>window.squeek.connect());await expect(page.getByTestId('holder-count')).toHaveText('2');const wallet={api:counts.api-before.api,rpc:counts.rpc-before.rpc,walletReads:counts.walletReads-before.walletReads};await expect(page.getByTestId('btn-checkpoint')).toBeEnabled();await page.getByTestId('wallet-button').click();await expect(page.getByTestId('wallet-eth')).toHaveText('ETH balance: 0.125 ETH');await page.keyboard.press('Escape');
 await page.evaluate(()=>window.displayEvents.accountsChanged([]));await expect(page.getByTestId('holder-empty')).toBeVisible();await expect(page.getByTestId('net-round')).toHaveText('1198');
 await page.evaluate(owner=>window.displayEvents.accountsChanged([owner.toUpperCase().replace('0X','0x')]),owner);await expect(page.getByTestId('holder-count')).toHaveText('2');
 await page.evaluate(()=>window.displayEvents.chainChanged('0x1'));await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();await expect(page.getByTestId('v9-review')).toBeDisabled();
 await page.evaluate(()=>window.displayEvents.chainChanged('0xaa36a7'));await expect(page.getByTestId('holder-count')).toHaveText('2');
 await page.evaluate(()=>document.getElementById('btn-disconnect').onclick());await expect(page.getByTestId('net-round')).toHaveText('1198');expect(await page.evaluate(()=>localStorage.getItem('wheelhouse:disconnected'))).toBe('true');
 const result={fixture:'production app and default profile chooser; synthetic API + intercepted RPC; no action/signing',cold:{api:cold.api,rpc:cold.rpc},warm,wallet};fs.mkdirSync('.cache',{recursive:true});fs.writeFileSync('.cache/display-browser-counts.json',JSON.stringify(result,null,2));
 await page.reload();expect(await page.evaluate(()=>localStorage.getItem('wheelhouse:disconnected'))).toBe('true');await page.evaluate(async owner=>{let probes=0;window.ethereum={request:async({method})=>{if(method==='eth_accounts'){probes++;return[owner];}return '0xaa36a7';},on(){}};const{mount}=await import('/app.js');window.squeek=mount();window.disconnectProbes=()=>probes;},owner);await expect(page.getByTestId('net-round')).toHaveText('1198');expect(await page.evaluate(()=>window.squeek.state.account)).toBeNull();expect(await page.evaluate(()=>window.disconnectProbes())).toBe(0);
});
for(const width of [390,1280])for(const theme of ['light','dark'])test(`API network and provisional wheel screenshot ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await install(page);await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);await expect(page.getByTestId('net-round')).toHaveText('1198');await page.screenshot({path:`docs/screenshots/api-wheel-${theme}-${width}.png`,fullPage:true});
});
test('API identity mismatch cannot retain or paint the previous API value; fresh RPC fallback may fail closed',async({page})=>{
 const {fixtures}=await install(page,{countsReader:true});fixtures.economy.release.id='wrong-release';await page.evaluate(()=>window.squeek.refresh());await expect(page.getByTestId('net-round')).toHaveText('Unknown');await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();
});

test('automatic owned art survives a full reload with zero art network requests',async({page})=>{
 const snapshot=c=>({api:c.api,rpc:c.rpc,walletReads:c.walletReads});const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]-b[k]]));
 const first=await install(page),cold=snapshot(first.counts);await page.evaluate(()=>squeek.connect());for(const image of await page.locator('#squeek-cards img').all()){await image.scrollIntoViewIfNeeded();await expect(image).toHaveAttribute('src',/^(data:|blob:)/);}expect(first.counts.paths.filter(p=>p.startsWith('/squeeks/')).length).toBe(2);const firstWallet=delta(snapshot(first.counts),cold);await page.evaluate(()=>squeek.destroy());
 const second=await install(page),warmReload=snapshot(second.counts);await page.evaluate(()=>squeek.connect());for(const image of await page.locator('#squeek-cards img').all()){await image.scrollIntoViewIfNeeded();await expect(image).toHaveAttribute('src',/^(data:|blob:)/);}expect(second.counts.paths.filter(p=>p.startsWith('/squeeks/')).length).toBe(0);const warmWallet=delta(snapshot(second.counts),warmReload);await page.evaluate(()=>squeek.destroy());
 fs.writeFileSync('docs/audit/data-diet-browser-art-counts.json',JSON.stringify({scope:'Production app, synthetic intercepted API/RPC, default dual-profile chooser; HTTP envelopes plus EIP-1193 chain reads; no actions/signing; reload keeps IndexedDB',cold,warmReload,firstWallet,warmWallet,firstVisitArtRequests:2,secondVisitArtRequests:0},null,2)+'\n');
});

test('projected-block schema failure preserves telemetry; failed frontier refresh retries the same round',async({page})=>{
 const {fixtures,counts}=await install(page,{countsReader:true});fixtures.blocks.schemaVersion='bad';fixtures.status.builder.projected.blockHeight='2395';await page.evaluate(()=>squeek.pollDisplay());await expect(page.getByTestId('wheel-rpm')).toHaveText('12.5');await expect(page.getByTestId('wheel-state')).toHaveText('Running');
 fixtures.core.status='unavailable';fixtures.status.builder.anchor.settledThroughRound='1199';await page.evaluate(()=>squeek.pollDisplay());await expect(page.getByTestId('net-round')).toHaveText('Unknown');const failedReads=counts.paths.filter(p=>p==='/core').length;
 fixtures.core.status='available';await page.evaluate(()=>squeek.pollDisplay());await expect(page.getByTestId('net-round')).toHaveText('1198');expect(counts.paths.filter(p=>p==='/core').length).toBeGreaterThan(failedReads);await expect(page.getByTestId('wheel-rpm')).toHaveText('12.5');await page.evaluate(()=>squeek.destroy());
});
