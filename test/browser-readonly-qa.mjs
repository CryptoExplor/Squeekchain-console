// Authorized real-browser public-read-only QA, separate from offline tests.
// No routes, fake adapters, wallet, private key, prepared action or submission.
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {keccak256} from 'viem';
import {getProfile} from '../sdk/deployments.js';
import {PUBLIC_RPCS} from '../sdk/rpc.js';
import {IMPLEMENTATION_SLOT} from '../sdk/verify.js';
import {observeExplore} from './explore-observer.mjs';
import {createHash} from 'node:crypto';
const url=process.env.QA_PREVIEW_URL,head=process.env.QA_HEAD_SHA??'local-unqualified';
if(!url||!/^https:\/\/[a-z0-9-]+\.wheel-house\.pages\.dev\/?$/i.test(url))throw new Error('QA_PREVIEW_URL must identify the exact Cloudflare preview');
const directory=path.join('artifacts','live-browser-qa'),report={head,preview:url,scope:'Fresh real Chromium contexts; direct public API/RPC; no wallet, mocks or signing',qualified:false,probes:[],requests:[],httpErrors:[],captures:[]};fs.mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),...(process.env.PLAYWRIGHT_NO_SANDBOX==='true'?{args:['--no-sandbox','--disable-dev-shm-usage']}: {})}),profile=getProfile('sepolia-v9');
let rpcRequests=0,forbidden=false,page;
async function fresh(){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('request',request=>{const u=new URL(request.url());if(PUBLIC_RPCS.some(endpoint=>new URL(endpoint).origin===u.origin)&&request.method()==='POST'){rpcRequests++;let payload;try{payload=request.postDataJSON();}catch{}const methods=(Array.isArray(payload)?payload:[payload]).filter(Boolean).map(item=>item.method);if(methods.some(method=>!/^(eth_(chainId|blockNumber|getBlockByNumber|getCode|getStorageAt|call|getLogs|getBalance)|net_version|web3_clientVersion)$/.test(method)))forbidden=true;}});
 page.on('response',response=>{if(response.status()>=400&&PUBLIC_RPCS.some(endpoint=>new URL(endpoint).origin===new URL(response.url()).origin)&&report.httpErrors.length<30)report.httpErrors.push({origin:new URL(response.url()).origin,status:response.status(),retryAfter:response.headers()['retry-after']??null});});
 page.on('requestfailed',request=>{if(report.requests.length<40)report.requests.push({origin:new URL(request.url()).origin,error:request.failure()?.errorText});});
 await page.addInitScript(()=>{
  localStorage.setItem('wheelhouse:disconnected','true');localStorage.setItem('squeekchain:profile','sepolia-v9');
 });
 await page.addInitScript(observeExplore);
 return {context,page};
}
const capture=async(name,width=1280,focusExplore=false)=>{await page.setViewportSize({width,height:900});await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});if(focusExplore)await page.locator('.explore-stats').evaluate(n=>{n.scrollIntoView({block:'start'});window.scrollBy(0,-72);});if(/\bUnknown\b/.test(await page.locator('body').innerText()))throw new Error('Visible placeholder word outside Developers during '+name);const file=`${name}-${width}.png`;await page.screenshot({path:path.join(directory,file),fullPage:false});report.captures.push(file);};
const enter=async()=>{const response=await page.goto(url+'/#sepolia-v9/explore?section=leaders',{waitUntil:'domcontentloaded',timeout:45000});if(response.status()!==200)throw new Error('Preview document is unavailable');report.previewHttpStatus=response.status();await page.waitForFunction(()=>window.squeek?.state?.profileKey==='sepolia-v9',{},{timeout:45000});if(await page.evaluate(()=>Boolean(window.ethereum)))throw new Error('QA requires a browser without a wallet provider');};
async function finish(started,baseline){
 await page.waitForFunction(()=>['complete','incomplete','unavailable'].includes(document.getElementById('explore-content')?.dataset.indexStatus),{},{timeout:420000});
 const result={milliseconds:performance.now()-started,httpRpcRequests:rpcRequests-baseline,...await page.locator('#explore-content').evaluate(root=>({status:root.dataset.indexStatus,indexed:root.dataset.indexed??null,supply:root.dataset.supply??null,blockNumber:root.dataset.scanBlock??null,text:root.querySelector('p')?.textContent})),monitor:await page.evaluate(()=>__qaExplore)};
 result.hydration100ToRenderedMs=result.monitor.hundredAt==null||result.monitor.renderedAt==null?null:result.monitor.renderedAt-result.monitor.hundredAt;
 result.finalToRenderedMs=result.monitor.finalAt==null||result.monitor.renderedAt==null?null:result.monitor.renderedAt-result.monitor.finalAt;
 if(result.status!=='complete'||result.indexed!==result.supply||!result.monitor.leaderRows||result.hydration100ToRenderedMs==null||result.hydration100ToRenderedMs>=5000){report.scanFailure=result;throw new Error('Explore did not render finished stats + leaderboard within five seconds of 100% hydration');}
 return result;
}
try{
 const cold=await fresh();page=cold.page;let baseline=rpcRequests,started=performance.now();await enter();report.cold=await finish(started,baseline);
 if(report.cold.monitor.initialDatabases?.length!==0)throw new Error('Cold run did not begin with empty IndexedDB');
 if(!report.cold.monitor.firstPartialAt||!report.cold.monitor.partialRows)throw new Error('Cold run did not show partial stats and leaderboard during hydration');
 await capture('explore-finished-leaderboard',1280,true);
 // The same fresh-profile finished view also has a small JPEG companion in a
 // check annotation: GitHub's API can retrieve/inspect it when artifact-CDN
 // downloads are unavailable. The full-resolution PNG remains in the artifact.
 for(const quality of [70,50,35]){const image=await page.screenshot({type:'jpeg',quality,fullPage:false});if(image.length<=45000){const file='explore-finished-leaderboard-1280.jpg';fs.writeFileSync(path.join(directory,file),image);report.captures.push(file);if(process.env.GITHUB_ACTIONS==='true')console.log('::notice title=Finished Explore screenshot::'+JSON.stringify({head,file,sha256:createHash('sha256').update(image).digest('hex'),base64:image.toString('base64')}));break;}}

 baseline=rpcRequests;started=performance.now();await page.reload({waitUntil:'domcontentloaded'});report.warm=await finish(started,baseline);
 // An independent, empty-storage browser context; pause the real cold scan at
 // approximately half hydration, inspect its IDB chunks, then actually reload.
 const interrupted=await fresh(),coldPage=page;page=interrupted.page;const resumeBaseline=rpcRequests,resumeStart=performance.now();await enter();
 await page.waitForFunction(()=>{const d=document.getElementById('explore-content')?.dataset;return d?.phase==='hydrate'&&Number(d.hydrated)>=Number(d.hydrationTotal)*0.5&&Number(d.hydrated)<Number(d.hydrationTotal)*0.55;},{},{timeout:420000});
 const checkpoint=await page.evaluate(async()=>{
  const d=document.getElementById('explore-content').dataset,monitor=structuredClone(__qaExplore);
  const entries=await new Promise((resolve,reject)=>{const req=indexedDB.open('wheelhouse',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('discovery','readonly'),get=tx.objectStore('discovery').getAll();tx.oncomplete=()=>{resolve(get.result);db.close();};tx.onerror=()=>reject(tx.error);};});
  return {hydrated:Number(d.hydrated),total:Number(d.hydrationTotal),durableTokens:entries.filter(v=>Array.isArray(v?.tokens)).reduce((n,v)=>n+v.tokens.length,0),monitor};
 });
 if(checkpoint.monitor.initialDatabases?.length!==0||checkpoint.durableTokens<checkpoint.hydrated)throw new Error('50% reload lacks a durable empty-profile hydration checkpoint');
 const reloadBaseline=rpcRequests,reloadStarted=performance.now();await page.reload({waitUntil:'domcontentloaded'});report.reloadResume=await finish(reloadStarted,reloadBaseline);report.reloadResume.beforeReloadMs=reloadStarted-resumeStart;report.reloadResume.totalMs=performance.now()-resumeStart;report.reloadResume.totalHttpRpcRequests=rpcRequests-resumeBaseline;report.reloadResume.checkpoint=checkpoint;
 if(!report.reloadResume.monitor.resumed||report.reloadResume.monitor.firstHydrated<checkpoint.hydrated)throw new Error('Reload restarted hydration instead of resuming saved chunks');
 await capture('explore-reload-resumed-leaderboard',1280,true);await interrupted.context.close();page=coldPage;
 report.requestDefinition='Physical public-RPC HTTP POSTs, including concurrent app reads. Cold/warm start before navigation/reload; resume starts before the actual 50% reload. No native probes or separate SDK verification precede these timings.';
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
 report.sourceDiagnostics=(await page.locator('#display-sources').allTextContents()).map(value=>value.slice(0,8000));report.verification=await page.getByTestId('profile-status').innerText();
 for(const width of [1280,390]){
  await page.getByTestId('tab-squeeks').click();await capture('squeeks-top',width);
  await page.getByTestId('tab-explore').click();await capture('explore-finished',width);
  await page.getByTestId('tab-info').click();await page.getByTestId('info-link-trust').click();await capture('info-trust',width);
  await page.getByTestId('settings-open').click();await capture('settings',width);await page.getByTestId('settings-sheet').getByTestId('sheet-close').click();
 }
 report.forbiddenMethodsObserved=forbidden;
 report.qualified=!forbidden&&report.probes.filter(item=>item.pass).length>=2&&report.sdkVerification?.ok===true&&report.sdkVerification?.trusted===true;
 if(!report.qualified)throw new Error('Live QA is not qualified: inspect the actual probe/scan/verification report');
}catch(error){report.failure=error.message;process.exitCode=1;}
finally{report.browserVersion=browser.version();report.totalHttpRpcRequests=rpcRequests;fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(process.env.GITHUB_ACTIONS==='true'){const compact={...report,requests:undefined,httpErrors:undefined,sourceDiagnostics:report.sourceDiagnostics?.map(value=>value.slice(0,4000))};for(const key of ['cold','warm','reloadResume'])if(compact[key]){compact[key]={...compact[key],monitor:{...compact[key].monitor,trace:undefined},checkpoint:compact[key].checkpoint?{...compact[key].checkpoint,monitor:{...compact[key].checkpoint.monitor,trace:undefined}}:undefined};}console.log('::notice title=Read-only browser QA::'+JSON.stringify(compact).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));}await browser.close();}
