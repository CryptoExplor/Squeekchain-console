// Explicit real-browser, public-read-only QA. Not part of the offline test suite.
// No page.route, adapter injection, wallet, private key, prepared action or submission.
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {keccak256} from 'viem';
import {getProfile} from '../sdk/deployments.js';
import {PUBLIC_RPCS} from '../sdk/rpc.js';
import {IMPLEMENTATION_SLOT} from '../sdk/verify.js';
const url=process.env.QA_PREVIEW_URL,head=process.env.QA_HEAD_SHA??'local-unqualified';
if(!url||!/^https:\/\/[a-z0-9-]+\.wheel-house\.pages\.dev\/?$/i.test(url))throw new Error('QA_PREVIEW_URL must identify the exact Cloudflare preview');
const directory=path.join('artifacts','live-browser-qa'),report={head,preview:url,scope:'Real Chromium; direct public API/RPC; no wallet, mocks or signing',qualified:false,probes:[],requests:[],httpErrors:[],captures:[]};fs.mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),...(process.env.PLAYWRIGHT_NO_SANDBOX==='true'?{args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),profile=getProfile('sepolia-v9');
let rpcRequests=0,forbidden=false;
page.on('request',request=>{const u=new URL(request.url());if(PUBLIC_RPCS.some(endpoint=>new URL(endpoint).origin===u.origin)&&request.method()==='POST'){rpcRequests++;let payload;try{payload=request.postDataJSON();}catch{}const methods=(Array.isArray(payload)?payload:[payload]).filter(Boolean).map(item=>item.method);if(methods.some(method=>!/^(eth_(chainId|blockNumber|getBlockByNumber|getCode|getStorageAt|call|getLogs|getBalance)|net_version|web3_clientVersion)$/.test(method)))forbidden=true;}});
page.on('response',response=>{if(response.status()>=400&&PUBLIC_RPCS.some(endpoint=>new URL(endpoint).origin===new URL(response.url()).origin)&&report.httpErrors.length<30)report.httpErrors.push({origin:new URL(response.url()).origin,status:response.status(),retryAfter:response.headers()['retry-after']??null});});
page.on('requestfailed',request=>{if(report.requests.length<40)report.requests.push({origin:new URL(request.url()).origin,error:request.failure()?.errorText});});
await page.addInitScript(()=>{localStorage.setItem('wheelhouse:disconnected','true');localStorage.setItem('squeekchain:profile','sepolia-v9');});
const capture=async(name,width)=>{await page.setViewportSize({width,height:900});await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});if(/\bUnknown\b/.test(await page.locator('body').innerText()))throw new Error('Visible placeholder word outside Developers during '+name);const file=`${name}-${width}.png`;await page.screenshot({path:path.join(directory,file),fullPage:false});report.captures.push(file);};
try {
 const response=await page.goto(url+'/#sepolia-v9/squeeks',{waitUntil:'domcontentloaded',timeout:45000});report.previewHttpStatus=response.status();
 if(response.status()!==200)throw new Error('Preview document is unavailable');
 await page.waitForFunction(()=>window.squeek?.state?.profileKey==='sepolia-v9',{},{timeout:45000});
 if(await page.evaluate(()=>Boolean(window.ethereum)))throw new Error('QA requires a browser without a wallet provider');
 for(const endpoint of PUBLIC_RPCS) {
  const result=await page.evaluate(async({endpoint,address,slot})=>{
   let id=0;const post=async payload=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(payload),signal:controller.signal});let body;try{body=await response.json();}catch{}return {status:response.status,body};}catch(error){return {status:null,error:error.name+': '+error.message};}finally{clearTimeout(timer);}};
   const request=(method,params)=>({jsonrpc:'2.0',id:++id,method,params});
   const chain=await post(request('eth_chainId',[]));if(chain.body?.result!=='0xaa36a7')return {endpoint,chainHttp:chain.status,chainId:chain.body?.result??null,pass:false,error:chain.error??'No Sepolia chain response'};
   const head=await post(request('eth_blockNumber',[]));if(!/^0x[0-9a-f]+$/i.test(head.body?.result??''))return {endpoint,chainId:chain.body.result,pass:false,error:'No block height response'};
   const block='0x'+(BigInt(head.body.result)-12n).toString(16),storage=request('eth_getStorageAt',[address,slot,block]),code=request('eth_getCode',[address,block]);
   const singleStorage=await post(storage),singleCode=await post(code),batch=await post([storage,code]);
   return {endpoint,chainId:chain.body.result,block,singleStorageHttp:singleStorage.status,singleCodeHttp:singleCode.status,batchHttp:batch.status,batchAccepted:Array.isArray(batch.body)&&batch.body.length===2&&batch.body.every(item=>typeof item.result==='string'),slot:singleStorage.body?.result??null,code:singleCode.body?.result??null,error:singleStorage.error??singleCode.error??null};
  },{endpoint,address:profile.addresses.core,slot:IMPLEMENTATION_SLOT});
  if(result.code){if(/^0x(?:[0-9a-f]{2})*$/i.test(result.code))result.runtimeHash=keccak256(result.code);else result.error='Malformed code response';delete result.code;}
  result.pass=result.chainId==='0xaa36a7'&&result.slot?.toLowerCase()==='0x'+profile.identities.pins.core.implSlot.slice(2).toLowerCase().padStart(64,'0')&&result.runtimeHash===profile.identities.pins.core.runtimeCodeHash;report.probes.push(result);
 }
 const verifyBaseline=rpcRequests;report.sdkVerification=await page.evaluate(()=>window.squeek.callTool('squeek_verify'));report.sdkVerificationHttpRequests=rpcRequests-verifyBaseline;
 const baseline=rpcRequests,started=performance.now();await page.getByTestId('tab-explore').click();
 try{await page.waitForFunction(()=>['complete','incomplete','unavailable'].includes(document.getElementById('explore-content')?.dataset.indexStatus),{},{timeout:420000});}catch{report.scanFailure=await page.locator('#explore-content>p').innerText();}
 if(await page.locator('#explore-content').getAttribute('data-index-status')!=='complete')report.scanFailure=await page.locator('#explore-content>p').innerText();
 report.scan={milliseconds:performance.now()-started,httpRpcRequests:rpcRequests-baseline,...await page.locator('#explore-content').evaluate(root=>({status:root.dataset.indexStatus,indexed:root.dataset.indexed??null,supply:root.dataset.supply??null,blockNumber:root.dataset.scanBlock??null}))};
 report.scan.requestDefinition='Physical public-RPC HTTP POSTs from Explore activation to its terminal result, including concurrent app RPC reads; excludes probes and the separate SDK verification.';
 report.sourceDiagnostics=(await page.locator('#display-sources').allTextContents()).map(value=>value.slice(0,8000));report.verification=await page.getByTestId('profile-status').innerText();
 for(const width of [1280,390]) {
  await page.getByTestId('tab-squeeks').click();await capture('squeeks-top',width);
  await page.getByTestId('tab-explore').click();await capture(report.scan.status==='complete'?'explore-finished':'explore-unavailable',width);
  await page.getByTestId('tab-info').click();await page.getByTestId('info-link-trust').click();await capture('info-trust',width);
  await page.getByTestId('settings-open').click();await capture('settings',width);await page.getByTestId('settings-sheet').getByTestId('sheet-close').click();
 }
 report.forbiddenMethodsObserved=forbidden;
 report.qualified=!forbidden&&report.probes.filter(item=>item.pass).length>=2&&report.scan.status==='complete'&&report.scan.indexed===report.scan.supply&&report.sdkVerification?.ok===true&&report.sdkVerification?.trusted===true;
 if(!report.qualified)throw new Error('Live QA is not qualified: inspect the actual probe/scan/verification report');
} catch(error) {report.failure=error.message;process.exitCode=1;}
finally {report.browserVersion=browser.version();report.totalHttpRpcRequests=rpcRequests;fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(process.env.GITHUB_ACTIONS==='true'){const compact={...report,requests:undefined,httpErrors:undefined,sourceDiagnostics:report.sourceDiagnostics?.map(value=>value.slice(0,4000))};console.log('::notice title=Read-only browser QA::'+JSON.stringify(compact).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));}await browser.close();}
