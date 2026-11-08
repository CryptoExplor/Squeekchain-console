import {test,expect} from '@playwright/test';
import {installHolderFixture} from './holder-workspace-fixture.mjs';

test('muted home palette: filled logo, primary buttons, bars and distinct warnings',async({page})=>{
 await installHolderFixture(page,{profile:'sepolia',route:'#sepolia/home',connect:false});
 await expect(page.getByTestId('hero')).toBeVisible();
 await expect(page.locator('.brand .mark svg linearGradient')).toHaveCount(1);
 await expect(page.locator('.brand .mark svg circle').first()).toHaveAttribute('fill','url(#brand-wheel-foil)');
 for(const theme of ['light','dark']){
  const result=await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;
   const probe=document.createElement('div');probe.innerHTML='<button class="btn btn-primary">Primary</button><button class="btn btn-gold">Checkpoint</button><span class="earnings-bar"></span><span class="chip warn">Warning</span><button class="btn btn-danger">Danger</button>';
   document.body.append(probe);
   const styles=[...probe.children].map(el=>{const s=getComputedStyle(el);return {fill:s.backgroundImage,bg:s.backgroundColor,ink:s.color,border:s.borderColor};});
   const lum=rgb=>rgb.map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const ink=lum(styles[0].ink.match(/\d+/g).map(Number));
   const contrast=[...styles[0].fill.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map(m=>{const l=lum(m.slice(1).map(Number));return (Math.max(l,ink)+.05)/(Math.min(l,ink)+.05);});
   probe.remove();return {styles,contrast};
  },theme);
  expect(result.styles[0].fill).toContain('linear-gradient');expect(result.styles[1].fill).toBe(result.styles[0].fill);
  expect(result.styles[2].fill).toContain('linear-gradient');expect(result.contrast.length).toBe(4);
  for(const ratio of result.contrast)expect(ratio).toBeGreaterThanOrEqual(4.5);
  expect(result.styles[3].bg).not.toBe(result.styles[4].bg);expect(result.styles[4].fill).toBe('none');
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:900});
   await expect(page.locator('.brand .mark')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 }
});
