import {test,expect} from '@playwright/test';
import {installHolderFixture} from './holder-workspace-fixture.mjs';

// Export/layout checks do not need a continuous GPU animation in software-rendered CI.
test.beforeEach(async ({page}) => {
 await page.addInitScript(()=>{window.__squeekMounted=true;});
 await page.emulateMedia({reducedMotion:'reduce'});
});

test('share card: opens from the holder view, saves a PNG, never signs',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await installHolderFixture(page,{profile:'sepolia'});
 const button=page.getByTestId('btn-share-card');
 await expect(button).toBeVisible();await expect(button).toBeEnabled();
 await button.click();
 await expect(page.getByTestId('share-sheet')).toBeVisible();
 await expect(page.locator('#share-preview canvas')).toHaveCount(1);
 const download=page.waitForEvent('download');await page.getByTestId('share-png').click();
 const file=await download;expect(file.suggestedFilename()).toMatch(/^wheelhouse-holder-.*\.png$/);
 const path=await file.path();const fs=await import('node:fs');expect(fs.statSync(path).size).toBeGreaterThan(5000);
 await page.getByTestId('share-close').click();await expect(page.getByTestId('share-sheet')).toBeHidden();
 expect(errors).toEqual([]);
});

test('share studio: front and back PNGs, style switching and anonymous export', async ({page}) => {
 await installHolderFixture(page,{profile:'sepolia'});
 await page.getByTestId('btn-share-card').click();
 await expect(page.locator('#share-preview canvas')).toHaveCount(1);
 const save = async side => {
  await page.locator('#share-side').selectOption(side);
  const pending=page.waitForEvent('download');
  await page.getByTestId('share-png').click();
  const file=await pending;
  const fs=await import('node:fs'); const bytes=fs.readFileSync(await file.path());
  expect(bytes.readUInt32BE(16)).toBe(1920); expect(bytes.readUInt32BE(20)).toBe(1080);
  return {bytes,name:file.suggestedFilename()};
 };
 const front=await save('front'), back=await save('back');
 expect(front.name).toContain('-front.png'); expect(back.name).toContain('-back.png');
 expect(front.bytes.equals(back.bytes)).toBe(false);
 await page.getByRole('button',{name:'Wallet address',exact:true}).click();
 expect((await save('front')).name).toMatch(/^wheelhouse-0x/);
 await page.getByRole('button',{name:'Wallet address',exact:true}).click();
 expect((await save('front')).name).toContain('wheelhouse-holder-');
 for(const name of ['Night scene','Classic','Flip card']) {
  await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
 }
});

test('share studio: canvas fallback works without WebGL', async ({page}) => {
 await page.addInitScript(() => {
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
   if(type==='webgl'||type==='webgl2')return null;
   return original.call(this,type,...args);
  };
 });
 await installHolderFixture(page,{profile:'sepolia'});
 await page.getByTestId('btn-share-card').click();
 await expect(page.locator('#share-preview canvas')).toHaveCount(1);
 const pending=page.waitForEvent('download'); await page.getByTestId('share-png').click();
 expect((await pending).suggestedFilename()).toContain('-front.png');
});

test('real Three.js Flip initializes and renders both sides without silently falling back', async ({page}) => {
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');
  if(!canvas.getContext('webgl2'))return {supported:false};
  const {cardStage}=await import('/hero3d.js');
  const source=document.createElement('canvas');source.width=760;source.height=460;
  const ctx=source.getContext('2d');ctx.fillStyle='#fcbe46';ctx.fillRect(0,0,760,460);
  const stage=cardStage();let flip;
  try {stage.frame(0);flip=stage.createFlip(source,source);flip.frame(0,0);flip.frame(4,Math.PI);return {supported:true,width:flip.canvas.width,height:flip.canvas.height};}
  finally {flip?.dispose();stage.dispose();}
 });
 test.skip(!result.supported,'WebGL unavailable in this browser runner');
 expect(result.width).toBe(1920);expect(result.height).toBe(1080);
});

test('Night lazy loading is awaited by export, privacy updates GPU orbs, and late close never mounts', async ({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const card=await import('/share-card.js');
  if(!card.webglAvailable())return {supported:false};
  const host=document.createElement('div');document.body.append(host);
  const data=card.applyShow(card.cardData({count:'4',power:'4',claimable:'1 SQK',levels:[1,2,2,3]}));
  let resolveFactory, created=0, disposed=0, gpuOrbs, exported=false;
  const source=document.createElement('canvas');source.width=1200;source.height=675;
  source.getContext('2d').fillRect(0,0,1200,675);
  const view=await card.mountCard(host,data,{style:'classic',reducedMotion:true,loadNight:()=>new Promise(resolve=>{resolveFactory=resolve;})});
  view.setStyle('night');await Promise.resolve();
  const pending=view.png().then(blob=>{exported=true;return blob;});
  await new Promise(resolve=>setTimeout(resolve,10));const waited=!exported;
  resolveFactory(options=>{created++;gpuOrbs=options.orbs;return {canvas:source,frame(){},setOrbs(value){gpuOrbs=value;},dispose(){disposed++;}};});
  const blob=await pending;const before=gpuOrbs.length;
  view.update(card.applyShow(card.cardData({count:'4',levels:[1,2,2,3]}),{levels:false}));
  const after=gpuOrbs.length;view.stop();
  const controller=new AbortController();let lateResolve,lateCreated=0;
  const late=card.mountCard(host,data,{style:'night',signal:controller.signal,reducedMotion:true,loadNight:()=>new Promise(resolve=>{lateResolve=resolve;})});
  while(!lateResolve)await new Promise(resolve=>setTimeout(resolve,1));
  controller.abort();lateResolve(()=>{lateCreated++;return {canvas:source,frame(){},dispose(){}};});
  let cancelled=false;try{await late;}catch{cancelled=true;}
  return {supported:true,waited,created,disposed,before,after,size:blob.size,cancelled,lateCreated,children:host.childElementCount};
 });
 test.skip(!result.supported,'WebGL2 unavailable');
 expect(result).toMatchObject({waited:true,created:1,disposed:1,before:4,after:0,cancelled:true,lateCreated:0,children:0});
 expect(result.size).toBeGreaterThan(1000);
});

test('real Night stage supports live privacy updates and recording produces a nonempty video', async ({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const card=await import('/share-card.js');if(!card.webglAvailable())return {supported:false};
  const {nightStage}=await import('/hero3d.js');const night=nightStage({orbs:[1,2,3]});
  const before=night.orbCount;night.frame(0);night.setOrbs([]);night.frame(0.5);const after=night.orbCount;night.dispose();
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
  if(!card.pickVideoType()||!canvas.captureStream)return {supported:true,before,after,videoSupported:false};
  const {blob,ext}=await card.recordCanvas(canvas,t=>{const ctx=canvas.getContext('2d');ctx.fillStyle=t>0?'#fcbe46':'#597af7';ctx.fillRect(0,0,320,180);},{seconds:0.2});
  return {supported:true,before,after,videoSupported:true,size:blob.size,ext};
 });
 test.skip(!result.supported,'WebGL2 unavailable');expect(result.before).toBe(3);expect(result.after).toBe(0);
 if(result.videoSupported){expect(result.size).toBeGreaterThan(100);expect(['mp4','webm']).toContain(result.ext);}
});

test('closing a recording cancels download and reopening retains working controls',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 await page.getByTestId('btn-share-card').click();
 await expect(page.getByTestId('share-video')).toBeEnabled();
 let downloads=0;page.on('download',()=>downloads++);
 // Cancel from the page as soon as the recorder reports its first frame. This avoids
 // software-GPU protocol/actionability delays accidentally waiting for the whole clip.
 await page.getByTestId('share-style-classic').click();
 await page.evaluate(()=>new Promise(resolve=>{
  const status=document.getElementById('share-status');
  const observer=new MutationObserver(()=>{
   if(!/^Recording…/.test(status.textContent))return;
   observer.disconnect();document.querySelector('[data-testid="share-close"]').click();resolve();
  });
  observer.observe(status,{childList:true,subtree:true,characterData:true});
  document.getElementById('share-video').click();
 }));
 await expect(page.getByTestId('share-sheet')).toBeHidden();
 await page.getByTestId('btn-share-card').click();
 await expect(page.getByTestId('share-png')).toBeEnabled();
 await expect(page.getByTestId('share-style-flip')).toBeEnabled();
 expect(downloads).toBe(0);
});

test('all styles bound long metric values and Flip always labels testnet exports',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const card=await import('/share-card.js'),styles=await import('/share-styles.js');
  const value='9'.repeat(78),data=card.applyShow(card.cardData({count:value,power:value,claimable:value+' SQK',claimed:value+' SQK',compounded:value+' SQK',levels:[1,2,3,4,5]}),{claimed:true,compounded:true,meta:false});
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
  const ctx=canvas.getContext('2d'),calls=[];const fill=ctx.fillText.bind(ctx);
  ctx.fillText=(text,x,y,max)=>{calls.push({text:String(text),x,max});if(max===undefined)fill(text,x,y);else fill(text,x,y,max);};
  styles.drawNight(ctx,data);styles.drawClassic(ctx,data);card.drawFront(ctx,data);card.drawBack(ctx,data);card.drawCard(ctx,data);
  return {metrics:calls.filter(item=>item.text===value),disclaimer:calls.some(item=>item.text.includes('Testnet snapshot'))};
 });
 expect(result.metrics.length).toBeGreaterThanOrEqual(15);
 for(const metric of result.metrics){expect(metric.max).toBeGreaterThan(0);expect(metric.x+metric.max).toBeLessThanOrEqual(1200);}
 expect(result.disclaimer).toBe(true);
});

test('mobile share controls, corrupt saved style recovery and keyboard dismissal',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await installHolderFixture(page,{profile:'sepolia'});
 await page.evaluate(()=>localStorage.setItem('wheelhouse.shareStyle.v1','not-a-style'));
 await page.getByTestId('btn-share-card').click();
 await expect(page.getByTestId('share-style-flip')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('share-png')).toBeEnabled();
 expect(await page.locator('#share-sheet .share-sheet').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 await page.getByTestId('share-style-classic').click();await expect(page.locator('#share-side')).toBeDisabled();
 await page.getByTestId('share-style-flip').click();await expect(page.locator('#share-side')).toBeEnabled();
 await page.keyboard.press('Escape');await expect(page.getByTestId('share-sheet')).toBeHidden();
 await expect(page.getByTestId('btn-share-card')).toBeFocused();
 expect(await page.evaluate(()=>window.holderFixture.sends)).toBe(0);
});

test('lost WebGL context switches to fallback and remains exportable',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const card=await import('/share-card.js');if(!card.webglAvailable())return {supported:false};
  const host=document.createElement('div');document.body.append(host);
  const source=document.createElement('canvas');source.width=1200;source.height=675;let disposed=0;
  const view=await card.mountCard(host,card.applyShow(card.cardData({count:'1',power:'1',levels:[1]})),{style:'night',reducedMotion:true,loadNight:async()=>()=>({canvas:source,frame(){},setOrbs(){},dispose(){disposed++;}})});
  const before=view.mode;source.dispatchEvent(new Event('webglcontextlost'));
  const after=view.mode,blob=await view.png();view.stop();return {supported:true,before,after,disposed,size:blob.size};
 });
 test.skip(!result.supported,'WebGL2 unavailable');
 expect(result).toMatchObject({before:'3d',after:'2d',disposed:1});expect(result.size).toBeGreaterThan(1000);
});

test('Flip foil wheels stay fully framed and use filled, coordinated marks', async ({page}) => {
 await installHolderFixture(page,{profile:'sepolia'});
 const result=await page.evaluate(async()=>{
  const {drawFront,drawBack,cardData,applyShow,FACE_W,FACE_H,BACK_WHEEL}=await import('/share-card.js');
  const canvas=document.createElement('canvas');canvas.width=FACE_W;canvas.height=FACE_H;
  const ctx=canvas.getContext('2d'),arcs=[];const arc=ctx.arc.bind(ctx);
  ctx.arc=(x,y,r,...rest)=>{const m=ctx.getTransform();arcs.push({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f,r});arc(x,y,r,...rest);};
  const data=applyShow(cardData({count:'10',power:'16,349',claimable:'8,695.43 SQK',levels:[1,2]}));
  const bounds=[];
  for(const t of [0,2,5,8]){
   arcs.length=0;drawBack(ctx,data,{t});
   const ring=arcs.find(a=>a.r===BACK_WHEEL.radius+BACK_WHEEL.lineWidth/2),edge=ring.r;
   bounds.push({left:ring.x-edge,right:ring.x+edge,top:ring.y-edge,bottom:ring.y+edge});
  }
  let gradientFills=0;const fill=ctx.fill.bind(ctx);ctx.fill=(...args)=>{if(ctx.fillStyle instanceof CanvasGradient)gradientFills++;fill(...args);};
  drawFront(ctx,data);drawBack(ctx,data);
  return {bounds,gradientFills,width:FACE_W,height:FACE_H};
 });
 for(const b of result.bounds){expect(b.left).toBeGreaterThan(400);expect(b.right).toBeLessThanOrEqual(result.width-24);expect(b.top).toBeGreaterThan(100);expect(b.bottom).toBeLessThanOrEqual(result.height-40);}
 expect(result.gradientFills).toBeGreaterThanOrEqual(4);
});

test('share options are pastel toggle buttons with keyboard and persisted state',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 await page.getByTestId('btn-share-card').click();
 const options=page.getByTestId('share-options'),address=page.getByTestId('share-show-address');
 await expect(options.locator('input')).toHaveCount(0);
 await expect(options.getByRole('button')).toHaveCount(8);
 await expect(address).toHaveAttribute('aria-pressed','false');
 await expect(page.getByTestId('share-show-count')).toHaveAttribute('aria-pressed','true');
 const fill=await page.getByTestId('share-show-count').evaluate(el=>getComputedStyle(el).backgroundImage);
 expect(fill).toContain('linear-gradient');
 expect(await page.getByTestId('share-style-flip').evaluate(el=>getComputedStyle(el).backgroundImage)).toBe(fill);
 await expect(address).toBeEnabled();await address.focus();await page.keyboard.press('Space');
 await expect(address).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('share-link')).toBeEnabled();
 await page.getByTestId('share-close').click();await page.getByTestId('btn-share-card').click();
 await expect(address).toHaveAttribute('aria-pressed','true');
 await expect(address).toBeEnabled();await address.focus();await page.keyboard.press('Enter');
 await expect(address).toHaveAttribute('aria-pressed','false');
 await expect(page.getByTestId('share-link')).toBeDisabled();
});

test('Classic shares pastel wheel, stat and trim accents in both themes',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});
 const results=await page.evaluate(async()=>{
  const {cardData,applyShow,CARD_W,CARD_H}=await import('/share-card.js');
  const {drawClassic}=await import('/share-styles.js');
  const canvas=document.createElement('canvas');canvas.width=CARD_W;canvas.height=CARD_H;
  const ctx=canvas.getContext('2d');let fills=[],strokes=[];
  const fill=ctx.fill.bind(ctx),stroke=ctx.stroke.bind(ctx);
  ctx.fill=(...args)=>{fills.push(ctx.fillStyle);fill(...args);};ctx.stroke=(...args)=>{strokes.push(ctx.strokeStyle);stroke(...args);};
  const base=cardData({count:'10',power:'16,349',claimable:'8,695.43 SQK',levels:[1,2]});
  return [false,true].flatMap(dark=>[false,true].map(levels=>{
   fills=[];strokes=[];drawClassic(ctx,applyShow(base,{levels}),{dark,t:2});
   return {dark,levels,foilFills:fills.filter(v=>v instanceof CanvasGradient).length,foilStrokes:strokes.filter(v=>v instanceof CanvasGradient).length,hasGold:[...fills,...strokes].some(v=>String(v).toLowerCase()==='#fcbe46')};
  }));
 });
 for(const result of results){expect(result.foilFills).toBeGreaterThanOrEqual(3);expect(result.foilStrokes).toBeGreaterThanOrEqual(1);expect(result.hasGold).toBe(false);}
});


test('share output format remains disclosed after style and visibility edits',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia'});await page.getByTestId('btn-share-card').click();
 const format=page.getByTestId('share-format');await expect(format).toContainText('PNG');
 const text=await format.textContent();await page.getByTestId('share-style-classic').click();
 await page.getByTestId('share-show-address').click();await expect(format).toHaveText(text);
});

for(const style of ['classic','flip','night'])test(`${style}: PNG and encoded video are native 1920x1080`,async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async style=>{
  const card=await import('/share-card.js'),host=document.createElement('div');document.body.append(host);
  const data=card.applyShow(card.cardData({count:'12',power:'123.45',claimable:'67.89 SQK',network:'Sepolia'}));
  const view=await card.mountCard(host,data,{style,wide:false,reducedMotion:true});
  try{
   const canvas=host.querySelector('canvas'),png=await view.png(),bitmap=await createImageBitmap(png);
   const result={canvas:[canvas.width,canvas.height],png:[bitmap.width,bitmap.height],videoSupported:view.videoSupported};bitmap.close();
   if(view.videoSupported){
    const {blob}=await view.video(1);
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    result.videoBase64=btoa(binary);result.videoType=blob.type;result.bytes=blob.size;
   }
   return result;
  }finally{view.stop();host.remove();}
 },style);
 expect(result.canvas).toEqual([1920,1080]);expect(result.png).toEqual([1920,1080]);
 expect(result.videoSupported).toBe(true);expect(result.bytes).toBeGreaterThan(1000);
 // Decode through a same-origin test response: the production CSP intentionally disallows blob media.
 await page.route('**/__recorded_share_video',route=>route.fulfill({contentType:result.videoType,body:Buffer.from(result.videoBase64,'base64')}));
 const size=await page.evaluate(async()=>{
  const video=document.createElement('video');video.preload='metadata';video.src='/__recorded_share_video';
  try{await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error(`Encoded video could not be decoded: ${video.error?.code}`));});return [video.videoWidth,video.videoHeight];}
  finally{video.removeAttribute('src');video.load();}
 });
 expect(size).toEqual([1920,1080]);
});

test('mounted Flip uses double-density face textures and a Full HD GPU render target',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const card=await import('/share-card.js');if(!card.webglAvailable())return {supported:false};
  const {cardStage}=await import('/hero3d.js'),host=document.createElement('div');document.body.append(host);
  let textures,gpu;
  const view=await card.mountCard(host,card.applyShow(card.cardData({count:'12',power:'456',claimable:'7 SQK'})),{
   style:'flip',wide:true,reducedMotion:true,loadStage:async()=>options=>{
    const stage=cardStage(options),create=stage.createFlip;
    stage.createFlip=(front,back)=>{textures=[[front.width,front.height],[back.width,back.height]];const flip=create(front,back);gpu=[flip.canvas.width,flip.canvas.height];return flip;};return stage;
   },
  });
  try{const blob=await view.png();return {supported:true,textures,gpu,mode:view.mode,bytes:blob.size};}
  finally{view.stop();host.remove();}
 });
 test.skip(!result.supported,'WebGL2 unavailable');expect(result.mode).toBe('3d');
 expect(result.textures).toEqual([[1520,920],[1520,920]]);expect(result.gpu).toEqual([1920,1080]);expect(result.bytes).toBeGreaterThan(10000);
});
