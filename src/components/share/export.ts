import {toBlob} from 'html-to-image';
let fontCSS:string|undefined;
/** Embed only bundled same-origin fonts; failed loads can be retried by the user. */
async function embeddedFonts(signal:AbortSignal){
 if(fontCSS)return fontCSS;
 const css=await Promise.all([
  ['PremiumMono','ibm-plex-mono-500.woff2',500],['PremiumSans','quicksand-700.woff2',700],
 ].map(async([family,file,weight])=>{
  const response=await fetch(new URL(`./fonts/${file}`,location.href),{signal});
  if(!response.ok)throw new Error('Local export font could not be loaded. Please retry.');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');}`;
 }));
 signal.throwIfAborted();
 return fontCSS=css.join('\n');
}
/** Warm local fonts/inline SVGs at 1x, then serialize a fixed-size card at 2x.
 * Clone-only styles deliberately ignore preview scaling; failures remain visible/retryable.
 * Callers must pass this pending promise to ClipboardItem before awaiting anything.
 */
async function renderCard(node:HTMLElement,signal:AbortSignal){
 await Promise.all([document.fonts.load('500 16px PremiumMono'),document.fonts.load('700 16px PremiumSans')]);
 await document.fonts.ready;signal.throwIfAborted();
 const options={width:600,height:340,pixelRatio:2,backgroundColor:'#07090E',fontEmbedCSS:await embeddedFonts(signal),cacheBust:false,
  style:{width:'600px',minWidth:'600px',height:'340px',minHeight:'340px',transform:'none',transformOrigin:'top left',margin:'0',flexShrink:'0'}};
 signal.throwIfAborted();
 const warmup=await toBlob(node,{...options,pixelRatio:1});
 signal.throwIfAborted();
 if(!warmup?.size)throw new Error('The browser could not prepare the card. Please retry.');
 const blob=await toBlob(node,options);
 signal.throwIfAborted();
 if(!blob?.size)throw new Error('The browser could not render the card. Please retry.');
 return blob;
}
/** Bound the entire pipeline, cancel font fetches, and fence non-abortable late canvas work. */
export async function exportCard(node:HTMLElement){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
  controller.abort();reject(new Error('Card export timed out. Please retry or reload if fonts remain unavailable.'));
 },15000);});
 try{return await Promise.race([deadline,renderCard(node,controller.signal)]);}
 finally{clearTimeout(timer);controller.abort();}
}
/** Download locally, then release the temporary object URL. */
export function downloadCard(blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wheelhouse-premium-${new Date().toISOString().slice(0,10)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
