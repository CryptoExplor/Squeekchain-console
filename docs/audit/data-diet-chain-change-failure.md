# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: display-browser.spec.mjs >> production display path: API-only network; holder connect; lock, switch, wrong chain, disconnect/reload
- Location: test/display-browser.spec.mjs:17:1

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator:  getByTestId('btn-checkpoint')
Expected: disabled
Received: enabled
Timeout:  15000ms

Call log:
  - Expect "toBeDisabled" getByTestId('btn-checkpoint') with timeout 15000ms
  - waiting for getByTestId('btn-checkpoint')
    33 × locator resolved to <button id="btn-checkpoint" class="btn btn-gold" data-testid="btn-checkpoint">Simulate & checkpoint</button>
       - unexpected value "enabled"

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- banner:
  - text: WHEELHOUSE. Independent Squeekchain console
  - combobox "Network deployment":
    - option "Sepolia v9 · Unknown in wallet · Staked (Unknown)" [selected]
    - option "Sepolia v6 · Unknown in wallet · Staked (Unknown)"
    - option "Mainnet"
  - 'button "Live verification: open Info Trust"': Unverified
  - status: Unverified
  - button "Wallet menu": 0x5989…FF54 ▾
  - button "Toggle theme"
  - button "Refresh"
  - button "Settings"
- main:
  - tablist "Console sections":
    - tab "Squeeks" [selected]
    - tab "Art"
    - tab "Network"
    - tab "Info"
  - paragraph
  - tabpanel "Squeeks":
    - heading "Squeeks" [level=2]
    - textbox "View address":
      - /placeholder: 0x… (view only)
    - button "View address"
    - region "Holdings":
      - heading "Holdings" [level=2]
      - text: 0x598958ABF7D8DB8DD468CB53DD6BA705581BFF54 Squeeks
      - strong: "2"
      - text: Deposited
      - strong: "0"
      - text: Share
      - strong: Unknown
      - text: Claimable
      - strong: 1 SQK
      - button "Simulate & claim"
      - status: "Rewards paused: settlement stopped at round 1198."
      - button "Refresh merge plan"
      - table "Squeek holdings at the verified snapshot":
        - caption: Squeek holdings at the verified snapshot
        - rowgroup:
          - row "token level next merge deposited art":
            - columnheader "token"
            - columnheader "level"
            - columnheader "next merge"
            - columnheader "deposited"
            - columnheader "art"
        - rowgroup:
          - 'row "41 1 0 no View art for Squeek #41"':
            - cell "41"
            - cell "1"
            - cell "0"
            - cell "no"
            - 'cell "View art for Squeek #41"':
              - 'button "View art for Squeek #41"': View
          - 'row "42 1 0 no View art for Squeek #42"':
            - cell "42"
            - cell "1"
            - cell "0"
            - cell "no"
            - 'cell "View art for Squeek #42"':
              - 'button "View art for Squeek #42"': View
      - region "Staking and custody":
        - heading "Staking and custody" [level=3]
        - text: Action
        - combobox "Action":
          - option "Deposit NFTs" [selected]
          - option "Withdraw NFTs"
          - option "Merge staked NFTs"
          - option "Claim and stake rewards"
          - option "Stake SQK"
          - option "Unstake SQK"
          - option "Approve one NFT"
          - option "Approve ALL NFTs (broad permission)"
          - option "Approve exact SQK amount"
        - text: NFT IDs
        - textbox "NFT IDs to deposit or withdraw":
          - /placeholder: 1, 2
        - button "Preview action"
      - heading "Merge plan" [level=3]
      - paragraph: Merging burns the donor NFT permanently and raises the survivor one level.
      - list
      - textbox "Survivor token ID":
        - /placeholder: Keep token ID
      - textbox "Donor token ID to burn":
        - /placeholder: Burn token ID
      - button "Review my pair"
      - paragraph: Choose which image and token ID survives. Type the exact BURN-<id> acknowledgement before call construction or simulation; review the simulation before wallet signing.
      - region "Account activity":
        - heading "Account activity" [level=2]
        - list
- contentinfo:
  - text: WHEELHOUSE. Powered by a hamster. Built for the holders.
  - link "Read the docs ↗":
    - /url: https://docs.squeekchain.com/developers/
  - link "Source ↗":
    - /url: https://github.com/CryptoExplor/Squeekchain-console
  - link "Safety & owner actions ↗":
    - /url: https://docs.squeekchain.com/developers/owner-actions/
  - text: Independent community console · not affiliated with Squeekchain · Sepolia only · not investment advice
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import fs from 'node:fs';
  3  | import {decodeFunctionData,encodeFunctionResult,multicall3Abi} from 'viem';
  4  | import {nftAbi} from '../sdk/abi.js';
  5  | import {displayFixtures,fixtureRoute,owner} from './fixtures/display-api.mjs';
  6  | async function install(page,{countsReader=false}={}){
  7  |  const fixtures=displayFixtures(),counts={api:0,rpc:0,walletReads:0,sends:0,paths:[]},listeners={};let failStatus=false;
  8  |  async function contract(data){const decoded=decodeFunctionData({abi:multicall3Abi,data});if(decoded.functionName==='aggregate3'){const result=decoded.args[0].map(()=>({success:true,returnData:encodeFunctionResult({abi:nftAbi,functionName:'balanceOf',result:0n})}));return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result});}throw new Error('Unexpected display contract read');}
  9  |  async function rpc(request){const {method,params=[]}=request;if(method==='eth_chainId')return '0xaa36a7';if(method==='eth_blockNumber')return '0xb7f2d0';if(method==='eth_getBlockByNumber')return {number:params[0],hash:'0x'+'ab'.repeat(32),timestamp:'0x6b000000',transactions:[]};if(method==='eth_getCode')return '0x';if(method==='eth_getStorageAt')return '0x'+'00'.repeat(32);if(method==='eth_call')return contract(params[0].data);throw new Error('Unexpected RPC '+method);}
  10 |  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname==='api.squeekchain.com'){counts.api++;const path=url.pathname.replace('/v1','')+url.search;counts.paths.push(path);if(path==='/status'&&failStatus)return route.fulfill({status:503,headers:{'Retry-After':'1'}});fixtures.status.measurement.receivedAt=new Date().toISOString();return route.fulfill({json:fixtureRoute(fixtures,path),headers:{ETag:'"display-fixture"'}});}counts.rpc++;try{const payload=request.postDataJSON();const respond=async r=>({jsonrpc:'2.0',id:r.id,result:await rpc(r)});return route.fulfill({json:Array.isArray(payload)?await Promise.all(payload.map(respond)):await respond(payload)});}catch(error){throw error;}});
  11 |  await page.exposeFunction('displayWalletRpc',async request=>{counts.walletReads++;return rpc(request);});
  12 |  await page.addInitScript(()=>{window.__squeekMounted=true;});await page.goto('/');
  13 |  await page.evaluate(async({owner,countsReader})=>{const {mount}=await import('/app.js');localStorage.setItem('squeekchain:profile','sepolia-v9');history.replaceState(null,'','#sepolia-v9/network');window.displayEvents={};window.ethereum={request:async request=>{if(['eth_accounts','eth_requestAccounts'].includes(request.method))return [owner];if(request.method==='wallet_revokePermissions')return null;if(request.method==='eth_sendTransaction')throw new Error('No signing');return window.displayWalletRpc(request);},on:(name,fn)=>window.displayEvents[name]=fn};window.squeek=mount(countsReader?{profileBalanceReader:async()=>({'sepolia-v6':{wallet:'0',staked:'0',nftPower:'0'},'sepolia-v9':{wallet:'2',staked:'0',nftPower:'2000'}})}:{});},{owner,countsReader});
  14 |  await expect(page.getByTestId('net-round')).toHaveText('1198');await expect(page.getByTestId('wheel-rpm')).toHaveText('12.5');await expect(page.getByTestId('provisional-blocks')).toContainText('Block 2,394 · provisional');
  15 |  return {fixtures,counts,setFailure:value=>failStatus=value};
  16 | }
  17 | test('production display path: API-only network; holder connect; lock, switch, wrong chain, disconnect/reload',async({page})=>{
  18 |  const {counts}=await install(page);const cold={...counts};expect(cold.rpc).toBe(0);await page.evaluate(()=>window.squeek.refresh());await expect(page.getByTestId('net-round')).toHaveText('1198');const warm={api:counts.api-cold.api,rpc:counts.rpc-cold.rpc};const before={api:counts.api,rpc:counts.rpc,walletReads:counts.walletReads};await page.evaluate(()=>window.squeek.connect());await expect(page.getByTestId('holder-count')).toHaveText('2');const wallet={api:counts.api-before.api,rpc:counts.rpc-before.rpc,walletReads:counts.walletReads-before.walletReads};await expect(page.getByTestId('btn-checkpoint')).toBeEnabled();
  19 |  await page.evaluate(()=>window.displayEvents.accountsChanged([]));await expect(page.getByTestId('holder-empty')).toBeVisible();await expect(page.getByTestId('net-round')).toHaveText('1198');
  20 |  await page.evaluate(owner=>window.displayEvents.accountsChanged([owner.toUpperCase().replace('0X','0x')]),owner);await expect(page.getByTestId('holder-count')).toHaveText('2');
> 21 |  await page.evaluate(()=>window.displayEvents.chainChanged('0x1'));await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();await expect(page.getByTestId('v9-review')).toBeDisabled();
     |                                                                                                                     ^ Error: expect(locator).toBeDisabled() failed
  22 |  await page.evaluate(()=>window.displayEvents.chainChanged('0xaa36a7'));await expect(page.getByTestId('holder-count')).toHaveText('2');
  23 |  await page.evaluate(()=>document.getElementById('btn-disconnect').onclick());await expect(page.getByTestId('net-round')).toHaveText('1198');expect(await page.evaluate(()=>localStorage.getItem('wheelhouse:disconnected'))).toBe('true');
  24 |  const result={fixture:'production app and default profile chooser; synthetic API + intercepted RPC; no action/signing',cold:{api:cold.api,rpc:cold.rpc},warm,wallet};fs.mkdirSync('.cache',{recursive:true});fs.writeFileSync('.cache/display-browser-counts.json',JSON.stringify(result,null,2));
  25 |  await page.reload();expect(await page.evaluate(()=>localStorage.getItem('wheelhouse:disconnected'))).toBe('true');await page.evaluate(async owner=>{let probes=0;window.ethereum={request:async({method})=>{if(method==='eth_accounts'){probes++;return[owner];}return '0xaa36a7';},on(){}};const{mount}=await import('/app.js');window.squeek=mount();window.disconnectProbes=()=>probes;},owner);await expect(page.getByTestId('net-round')).toHaveText('1198');expect(await page.evaluate(()=>window.squeek.state.account)).toBeNull();expect(await page.evaluate(()=>window.disconnectProbes())).toBe(0);
  26 | });
  27 | for(const width of [390,1280])for(const theme of ['light','dark'])test(`API network and provisional wheel screenshot ${theme} ${width}`,async({page})=>{
  28 |  await page.setViewportSize({width,height:1000});await install(page);await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);await expect(page.getByTestId('net-round')).toHaveText('1198');await page.screenshot({path:`docs/screenshots/api-wheel-${theme}-${width}.png`,fullPage:true});
  29 | });
  30 | test('API identity mismatch cannot retain or paint the previous API value; fresh RPC fallback may fail closed',async({page})=>{
  31 |  const {fixtures}=await install(page,{countsReader:true});fixtures.economy.release.id='wrong-release';await page.evaluate(()=>window.squeek.refresh());await expect(page.getByTestId('net-round')).toHaveText('Unknown');await expect(page.getByTestId('btn-checkpoint')).toBeDisabled();
  32 | });
  33 | 
```