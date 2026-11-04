// Display-only cards. Selection is a hint; the app reconstructs action inputs on-chain.
import {formatNumber,formatAmount} from './components.js';
export function createHoldings({doc,win,state,loadImage,onAction,onMerge,onConnect}){
 const $=id=>doc.getElementById(id),selected=new Set();let observer,version=0;
 function pick(action,ids){$('v9-ids').value=ids.join(', ');$('v9-token').value=ids[0]??'';if(ids.length===2){$('v9-survivor').value=ids[0];$('v9-donor').value=ids[1];$('merge-survivor').value=ids[0];$('merge-donor').value=ids[1];}onAction(action);}
 function render(status){const epoch=++version;observer?.disconnect();selected.clear();const root=$('squeek-cards');root.replaceChildren();$('nft-empty').classList.toggle('hidden',!status||status.squeeks?.length>0);if(!status)return;
 const signer=!state.busy&&state.account?.toLowerCase()===status.owner?.toLowerCase()&&state.chainId===11155111, v9=state.profileKey==='sepolia-v9';
 for(const button of doc.querySelectorAll('[data-action]'))button.disabled=!signer;
 const rows=status.squeeks??[];for(const token of rows){const card=doc.createElement('article');card.className='squeek-card';card.dataset.testid='squeek-card';card.dataset.token=token.tokenId;
 const frame=doc.createElement('div');frame.className='squeek-image is-skeleton';const img=doc.createElement('img');img.loading='lazy';img.decoding='async';img.alt=`Squeek #${token.tokenId}`;img.width=320;img.height=320;frame.append(img);
 const title=doc.createElement('h3');title.textContent=`Squeek #${token.tokenId}`;const data=doc.createElement('dl');data.className='card-facts';
 for(const [label,value] of [['Level',token.level],['Power',token.basePower??token.activeWeight??status.net?.policy?.levels?.find(l=>l.level===token.level)?.basePower],['Next merge',token.nextMergeHeight??token.nextMergeBlock],['Custody',token.deposited?'Deposited':'Wallet']]){const group=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;dd.textContent=label==='Custody'?value:formatNumber(value);group.append(dt,dd);data.append(group);}
 const actions=doc.createElement('div');actions.className='card-actions';const label=doc.createElement('label'),check=doc.createElement('input');check.type='checkbox';check.disabled=!signer;check.setAttribute('aria-label',`Select Squeek #${token.tokenId}`);check.onchange=()=>{check.checked?selected.add(token.tokenId):selected.delete(token.tokenId);$('selection-count').textContent=`${selected.size} selected`;};label.append(check,'Select');actions.append(label);
 if(v9){const button=doc.createElement('button');button.className='btn';button.textContent=token.deposited?'Withdraw':'Deposit';button.disabled=!signer;button.onclick=()=>pick(token.deposited?'withdraw':'deposit',[token.tokenId]);actions.append(button);}
 card.append(frame,title,data,actions);root.append(card);
 const load=async()=>{try{const item=await loadImage(token);if(epoch!==version)return;img.onload=()=>frame.classList.remove('is-skeleton');img.onerror=()=>{frame.classList.remove('is-skeleton');img.alt='Image unavailable';};img.src=item.image;}catch{if(epoch===version){frame.classList.remove('is-skeleton');img.alt='Image unavailable';}}};
 card.loadImage=load;
 }
 if(win.IntersectionObserver){observer=new win.IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);void e.target.loadImage();}},{rootMargin:'200px'});root.querySelectorAll('article').forEach(card=>observer.observe(card));}else root.querySelectorAll('article').forEach(card=>void card.loadImage());
 for(const [id,value] of [['sqk-balance',status.sqkBalance],['sqk-claimable',status.totals?.claimable],['sqk-staked',status.staking?.principal],['sqk-fresh',status.staking?.fresh],['sqk-mature',status.staking?.mature]])$(id).textContent=formatAmount(value);
 for(const id of ['sqk-staked','sqk-fresh','sqk-mature'])$(id).parentElement.classList.toggle('hidden',!v9);
 const amounts=[status.sqkBalance,status.totals?.claimable,...(v9?[status.staking?.principal]:[])];$('sqk-empty').classList.toggle('hidden',!amounts.every(a=>a?.base==='0'));$('sqk-v9-buttons').classList.toggle('hidden',!v9);$('nft-v9-buttons').classList.toggle('hidden',!v9);$('selection-count').textContent='0 selected';
 }
 $('holder-connect').onclick=onConnect;
 for(const node of doc.querySelectorAll('[data-action]'))node.onclick=()=>{const action=node.dataset.action;if(action==='merge'){const ids=[...selected];if(ids.length!==2)return;$('merge-survivor').value=ids[0];$('merge-donor').value=ids[1];onMerge();}else pick(action,[...selected]);};
 return {render,destroy(){version++;observer?.disconnect();}};
}
