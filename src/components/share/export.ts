import {toBlob} from 'html-to-image';
let fontCSS:Promise<string>|undefined;
/** Embed only bundled same-origin fonts; failed loads can be retried by the user. */
function embeddedFonts(){
 return fontCSS??=Promise.all([
  ['PremiumMono','ibm-plex-mono-500.woff2',500],['PremiumSans','quicksand-700.woff2',700],
 ].map(async([family,file,weight])=>{
  const response=await fetch(new URL(`./fonts/${file}`,location.href));
  if(!response.ok)throw new Error('Local export font could not be loaded. Please retry.');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');}`;
 })).then(css=>css.join('\n')).catch(error=>{fontCSS=undefined;throw error;});
}
/** Render a frozen card at 2x resolution; reject failed/empty exports instead of reporting success. */
export async function exportCard(node:HTMLElement){
 await document.fonts.ready;
 const blob=await toBlob(node,{width:600,height:340,pixelRatio:2,backgroundColor:'#07090E',fontEmbedCSS:await embeddedFonts(),cacheBust:false});
 if(!blob||!blob.size)throw new Error('The browser could not render the card. Please retry.');
 return blob;
}
/** Download locally, then release the temporary object URL. */
export function downloadCard(blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wheelhouse-premium-${new Date().toISOString().slice(0,10)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
