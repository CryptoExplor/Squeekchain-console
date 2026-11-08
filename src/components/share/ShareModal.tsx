import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Copy,Download,Share2,X} from 'lucide-react';
import {ShareCard,type ShareCardProps} from './ShareCard';
import {useSqueekMetrics} from './useSqueekMetrics';
import {downloadCard,exportCard} from './export';
export interface ShareModalProps {snapshot:Readonly<ShareCardProps>;holderUrl:string;onClose:()=>void}
/** Export controller: frozen metrics, explicit identity consent, and no automatic wallet actions. */
export function ShareModal({snapshot,holderUrl,onClose}:ShareModalProps){
 const card=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDivElement>(null),preview=useRef<HTMLDivElement>(null);
 const busy=useRef(false),alive=useRef(true),[exporting,setExporting]=useState(false),[message,setMessage]=useState('PNG · 1200 × 680 · Generated locally'),[showAddress,setShowAddress]=useState(false),[includeLink,setIncludeLink]=useState(false),[scale,setScale]=useState(1);
 const data=useSqueekMetrics(snapshot,showAddress);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>{alive.current=false;document.body.style.overflow=overflow;previous?.focus();};},[]);
 useLayoutEffect(()=>{const node=preview.current;if(!node)return;const ro=new ResizeObserver(()=>setScale(Math.min(1,node.clientWidth/600)));ro.observe(node);return()=>ro.disconnect();},[]);
 /** Serialize exports and surface failures; an unmounted dialog cannot trigger a late download. */
 const save=async(copy:boolean)=>{
  if(busy.current||!card.current)return;busy.current=true;setExporting(true);setMessage(copy?'Copying image…':'Rendering PNG…');
  try{
   if(copy&&(!window.isSecureContext||!navigator.clipboard?.write||typeof ClipboardItem==='undefined'))throw new Error('Image clipboard unavailable. Use Download PNG instead.');
   const blobPromise=exportCard(card.current);
   if(copy){
    await Promise.all([blobPromise,navigator.clipboard.write([new ClipboardItem({'image/png':blobPromise})])]);
   }else{const blob=await blobPromise;if(alive.current)downloadCard(blob);}
   if(alive.current)setMessage(copy?'Image copied. Paste it into your post.':'PNG downloaded.');
  }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Export failed. Please retry.');}
  finally{busy.current=false;if(alive.current)setExporting(false);}
 };
 /** Open a draft only; full-address URLs require consent separate from the shortened card identity. */
 const share=()=>{const text=`My ${data.network} Squeekchain holder snapshot: ${data.count} Squeeks · ${data.claimable} claimable.\nPNG can be attached manually.`,url=new URL('https://twitter.com/intent/tweet');url.searchParams.set('text',text);url.searchParams.set('url',showAddress&&includeLink?holderUrl:new URL('/',location.href).href);window.open(url.href,'_blank','noopener,noreferrer');};
 return <div className="premium-overlay"><div ref={dialog} className="premium-modal" role="dialog" aria-modal="true" aria-labelledby="premium-title" data-testid="premium-modal" onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
  if(event.key==='Tab'){const nodes=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')];const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}>
  <header className="premium-modal-header"><div><h2 id="premium-title">Premium holder card</h2><p>Read-only snapshot. Nothing is signed or sent.</p></div><button aria-label="Close premium card" className="premium-button" onClick={onClose}><X size={18}/></button></header>
  <div ref={preview} className="premium-preview" style={{height:340*scale}}><div className="premium-scale" style={{transform:`scale(${scale})`}}><ShareCard ref={card} {...data}/></div></div>
  <button className="premium-button" aria-pressed={showAddress} disabled={exporting} onClick={()=>{setShowAddress(v=>!v);setIncludeLink(false);}}>Wallet address: {showAddress?'shown':'hidden'}</button>
  {showAddress&&<><button className="premium-button" aria-pressed={includeLink} disabled={exporting} onClick={()=>setIncludeLink(v=>!v)}>Full-address link: {includeLink?'included':'excluded'}</button><p className="premium-status">{includeLink?'The X link will reveal your full wallet address.':'The card shows a shortened address. Including its X link reveals the full address; this requires separate consent.'}</p></>}
  <p className="premium-status" role="status">{message}</p>
  <div className="premium-actions"><button className="premium-button" disabled={exporting} onClick={()=>void save(true)}><Copy size={16}/>Copy image</button><button className="premium-button" disabled={exporting} onClick={()=>void save(false)}><Download size={16}/>{exporting?'Rendering…':'Download PNG'}</button><button className="premium-button premium-primary" disabled={exporting} onClick={share}><Share2 size={16}/>Share on X</button></div>
 </div></div>;
}
