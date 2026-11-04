// Display-only cards. Selection is a hint; the app reconstructs action inputs on-chain.
import {squeekHash} from './holder-routes.js';
import {formatNumber,formatAmount} from './components.js';
export function createHoldings({doc,win,state,loadImage,onAction,onMerge,onConnect,onSelection=()=>{}}){
 const $=id=>doc.getElementById(id),selected=new Set();let observer,version=0,current;
 function pick(action,ids){$('v9-ids').value=ids.join(', ');$('v9-token').value=ids[0]??'';if(ids.length===2){$('v9-survivor').value=ids[0];$('v9-donor').value=ids[1];$('merge-survivor').value=ids[0];$('merge-donor').value=ids[1];}onAction(action);}
 function pairValid(tokens){return tokens.length===2&&String(tokens[0].tokenId)!==String(tokens[1].tokenId)&&Number.isInteger(tokens[0].level)&&tokens[0].level>0&&tokens[0].level===tokens[1].level&&tokens[0].level<(current?.net?.policy?.maximumLevel??10)&&Boolean(tokens[0].deposited)===Boolean(tokens[1].deposited)&&current?.net?.policy?.mergesOpen!==false;}
 function canSign(){return Boolean(current&&!state.watchOnly&&!state.busy&&!state.walletPromptPending&&state.account?.toLowerCase()===current.owner?.toLowerCase()&&state.chainId===11155111&&current.totals?.count!=null);}
 function renderPair(){const rows=current?.squeeks??[],a=rows.find(t=>String(t.tokenId)===$('merge-survivor').value),b=rows.find(t=>String(t.tokenId)===$('merge-donor').value),valid=a&&b&&pairValid([a,b]);
  $('merge-selection').textContent=valid?`Keep #${a.tokenId} · burn #${b.tokenId}`:'Choose two same-level Squeeks';
  $('merge-level').textContent=valid?`Result: level ${a.level+1}`:'';
  $('merge-burn-step').textContent=valid?`Type BURN-${b.tokenId} in the confirmation before simulation. The donor burn is permanent.`:'BURN confirmation is required before simulation. The donor burn is permanent.';
  $('btn-custom-merge').disabled=!canSign()||!valid;
 }
 function selectionChanged(){const rows=current?.squeeks??[],ids=[...selected],tokens=ids.map(id=>rows.find(t=>t.tokenId===id)),signer=canSign(),v9=state.profileKey==='sepolia-v9';
  $('selection-count').textContent=`${ids.length} selected`;$('v9-ids').value=ids.join(', ');$('v9-token').value=ids[0]??'';
  $('merge-survivor').value=ids[0]??'';$('merge-donor').value=ids[1]??'';
  $('v9-survivor').value=ids[0]??'';$('v9-donor').value=ids[1]??'';
  const gates={merge:pairValid(tokens)&&tokens.every(t=>!t.deposited),deposit:v9&&tokens.length>0&&tokens.every(t=>!t.deposited),withdraw:v9&&tokens.length>0&&tokens.every(t=>t.deposited),mergeDeposited:v9&&pairValid(tokens)&&tokens.every(t=>t.deposited),approveNft:v9&&tokens.length===1&&!tokens[0].deposited,approveAll:v9&&rows.some(t=>!t.deposited)};
  for(const button of doc.querySelectorAll('[data-action]'))button.disabled=!signer||(button.dataset.action in gates&&!gates[button.dataset.action]);
  renderPair();onSelection();
 }
 function render(status){current=status;const epoch=++version;observer?.disconnect();selected.clear();const root=$('squeek-cards');root.replaceChildren();$('nft-empty').classList.toggle('hidden',!status||status.squeeks?.length>0);$('squeek-controls').classList.toggle('hidden',!status||!(status.squeeks?.length>0));for(const button of doc.querySelectorAll('[data-action]'))button.disabled=true;selectionChanged();if(!status)return;
 const signer=!state.watchOnly&&!state.busy&&!state.walletPromptPending&&state.account?.toLowerCase()===status.owner?.toLowerCase()&&state.chainId===11155111, v9=state.profileKey==='sepolia-v9';
 for(const button of doc.querySelectorAll('[data-action]'))button.disabled=!signer;
 const rows=status.squeeks??[];for(const token of rows){const card=doc.createElement('article');card.className='squeek-card';card.dataset.testid='squeek-card';card.dataset.token=token.tokenId;
 const frame=doc.createElement('div');frame.className='squeek-image is-skeleton';const img=doc.createElement('img');img.loading='lazy';img.decoding='async';img.alt=`Squeek #${token.tokenId}`;img.width=320;img.height=320;frame.append(img);
 const title=doc.createElement('h3'),link=doc.createElement('a');link.href=squeekHash(state.profileKey,token.tokenId);link.textContent=`Squeek #${token.tokenId}`;title.append(link);frame.onclick=()=>{win.location.hash=squeekHash(state.profileKey,token.tokenId);};const data=doc.createElement('dl');data.className='card-facts';
 for(const [label,value] of [['Level',token.level],['Power',token.basePower??token.activeWeight??status.net?.policy?.levels?.find(l=>l.level===token.level)?.basePower],['Next merge',token.nextMergeHeight??token.nextMergeBlock],['Custody',token.deposited?'Deposited':'Wallet']]){const group=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;dd.textContent=label==='Custody'?value:formatNumber(value);group.append(dt,dd);data.append(group);}
 const actions=doc.createElement('div');actions.className='card-actions';const label=doc.createElement('label'),check=doc.createElement('input');check.type='checkbox';check.disabled=!signer;check.setAttribute('aria-label',`Select Squeek #${token.tokenId}`);check.onchange=()=>{check.checked?selected.add(token.tokenId):selected.delete(token.tokenId);selectionChanged();};label.append(check,'Select');actions.append(label);
 if(v9){const button=doc.createElement('button');button.className='btn';button.textContent=token.deposited?'Withdraw':'Deposit';button.disabled=!signer;button.onclick=()=>pick(token.deposited?'withdraw':'deposit',[token.tokenId]);actions.append(button);}
 card.onclick=event=>{if(!event.target.closest('button,input,label,a'))win.location.hash=squeekHash(state.profileKey,token.tokenId);};card.append(frame,title,data,actions);root.append(card);
 const load=async()=>{try{const item=await loadImage(token);if(epoch!==version)return;img.onload=()=>frame.classList.remove('is-skeleton');img.onerror=()=>{frame.classList.remove('is-skeleton');img.alt='Image unavailable';};img.src=item.image;}catch{if(epoch===version){frame.classList.remove('is-skeleton');img.alt='Image unavailable';}}};
 card.loadImage=load;
 }
 if(win.IntersectionObserver){observer=new win.IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);void e.target.loadImage();}},{rootMargin:'200px'});root.querySelectorAll('article').forEach(card=>observer.observe(card));}else root.querySelectorAll('article').forEach(card=>void card.loadImage());
 for(const [id,value] of [['sqk-balance',status.sqkBalance],['sqk-claimable',status.totals?.claimable],['sqk-staked',status.staking?.principal],['sqk-fresh',status.staking?.fresh],['sqk-mature',status.staking?.mature]])$(id).textContent=id==='sqk-claimable'?state.claimQuote?.ok&&state.claimQuote.total?.sqk!=null?`${state.claimQuote.total.sqk} SQK`:'Unknown':formatAmount(value);
 for(const id of ['sqk-staked','sqk-fresh','sqk-mature'])$(id).parentElement.classList.toggle('hidden',!v9);
 const amounts=[status.sqkBalance,status.totals?.claimable,...(v9?[status.staking?.principal]:[])];$('sqk-empty').classList.toggle('hidden',!amounts.every(a=>a?.base==='0'));$('sqk-v9-buttons').classList.toggle('hidden',!v9);$('nft-v9-buttons').classList.toggle('hidden',!v9);selectionChanged();
 }
 for(const id of ['merge-survivor','merge-donor'])$(id).addEventListener('input',renderPair);
 $('holder-connect').onclick=onConnect;
 for(const node of doc.querySelectorAll('[data-action]'))node.onclick=()=>{const action=node.dataset.action;if(action==='merge'){const ids=[...selected];if(ids.length!==2)return;$('merge-survivor').value=ids[0];$('merge-donor').value=ids[1];onMerge();}else pick(action,[...selected]);};
 return {render,selectPair(a,b){selected.clear();for(const id of [a,b]){selected.add(String(id));const input=[...doc.querySelectorAll('#squeek-cards input[type=checkbox]')].find(el=>el.getAttribute('aria-label')===`Select Squeek #${id}`);if(input)input.checked=true;}selectionChanged();},selectAction:pick,destroy(){version++;observer?.disconnect();}};
}
