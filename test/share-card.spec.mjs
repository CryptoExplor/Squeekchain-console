import {test,expect} from '@playwright/test';
import {installHolderFixture} from './holder-workspace-fixture.mjs';

test('share card: opens from the holder view, saves a PNG, never signs',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await installHolderFixture(page,{profile:'sepolia'});
 const button=page.getByTestId('btn-share-card');
 await expect(button).toBeVisible();await expect(button).toBeEnabled();
 await button.click();
 await expect(page.getByTestId('share-sheet')).toBeVisible();
 await expect(page.locator('#share-preview canvas')).toHaveCount(1);
 const download=page.waitForEvent('download');await page.getByTestId('share-png').click();
 const file=await download;expect(file.suggestedFilename()).toMatch(/^wheelhouse-0x.*\.png$/);
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
  expect(bytes.readUInt32BE(16)).toBe(1200); expect(bytes.readUInt32BE(20)).toBe(675);
  return {bytes,name:file.suggestedFilename()};
 };
 const front=await save('front'), back=await save('back');
 expect(front.name).toContain('-front.png'); expect(back.name).toContain('-back.png');
 expect(front.bytes.equals(back.bytes)).toBe(false);
 await page.getByRole('checkbox',{name:'Wallet address',exact:true}).uncheck();
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
 expect(result.width).toBe(1200);expect(result.height).toBe(675);
});
