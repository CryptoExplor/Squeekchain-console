// Display-only cards. Selection is a hint; the app reconstructs action inputs on-chain.
import {createBrowseGrid} from './browse-grid.js';
import {getProfile} from './bundle.js';
import {formatNumber,formatAmount} from './components.js';
export function createHoldings({doc,win,state,loadImage,onAction,onMerge,onConnect,onSelection=()=>{},onPairs=()=>{}}){
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
 function selectionChanged(){const rows=current?.squeeks??[],ids=[...selected],tokens=ids.map(id=>rows.find(t=>t.tokenId===id)),signer=canSign(),v9=Boolean(getProfile(state.profileKey).capabilities.stake);
  $('selection-count').textContent=`${ids.length} selected`;$('v9-ids').value=ids.join(', ');$('v9-token').value=ids[0]??'';
  $('merge-survivor').value=ids[0]??'';$('merge-donor').value=ids[1]??'';
  $('v9-survivor').value=ids[0]??'';$('v9-donor').value=ids[1]??'';
  const gates={merge:pairValid(tokens)&&tokens.every(t=>!t.deposited),deposit:v9&&tokens.length>0&&tokens.every(t=>!t.deposited),withdraw:v9&&tokens.length>0&&tokens.every(t=>t.deposited),mergeDeposited:v9&&pairValid(tokens)&&tokens.every(t=>t.deposited),approveNft:v9&&tokens.length===1&&!tokens[0].deposited,approveAll:v9&&rows.some(t=>!t.deposited)};
  for(const button of doc.querySelectorAll('[data-action]'))button.disabled=!signer||(button.dataset.action in gates&&!gates[button.dataset.action]);
  renderPair();onSelection();
 }
 const grid=createBrowseGrid({doc,win,root:$('squeek-cards'),context:()=>({profile:state.profileKey,owner:current?.owner}),active:()=>!$('panel-squeeks').classList.contains('hidden')&&!$('holder-overview').hidden,loadImage,selected,canSelect:canSign,onSelection:selectionChanged,onAction:(action,id)=>pick(action,[id]),onPairs});
 function render(status){const previous=current;current=status;const changed=previous?.owner?.toLowerCase()!==status?.owner?.toLowerCase();if(changed||[...selected].some(id=>{const before=previous?.squeeks?.find(t=>String(t.tokenId)===id),after=status?.squeeks?.find(t=>String(t.tokenId)===id);return before&&after&&(before.level!==after.level||Boolean(before.deposited)!==Boolean(after.deposited));}))selected.clear();for(const id of [...selected])if(!status?.squeeks?.some(t=>String(t.tokenId)===id))selected.delete(id);$('nft-empty').classList.toggle('hidden',!status||status.squeeks?.length>0);$('squeek-controls').classList.toggle('hidden',!status||!(status.squeeks?.length>0));for(const button of doc.querySelectorAll('[data-action]'))button.disabled=true;grid.render(status?.squeeks??null,status?.net);selectionChanged();if(!status)return;
 const v9=Boolean(getProfile(state.profileKey).capabilities.stake);
 for(const [id,value] of [['sqk-balance',status.sqkBalance],['sqk-claimable',status.totals?.claimable],['sqk-staked',status.staking?.principal],['sqk-fresh',status.staking?.fresh],['sqk-mature',status.staking?.mature]])$(id).textContent=id==='sqk-claimable'?state.claimQuote?.ok&&state.claimQuote.total?.sqk!=null?`${state.claimQuote.total.sqk} SQK`:'—':formatAmount(value);
 for(const id of ['sqk-staked','sqk-fresh','sqk-mature'])$(id).parentElement.classList.toggle('hidden',!v9);
 const amounts=[status.sqkBalance,status.totals?.claimable,...(v9?[status.staking?.principal]:[])];$('sqk-empty').classList.toggle('hidden',!amounts.every(a=>a?.base==='0'));$('sqk-v9-buttons').classList.toggle('hidden',!v9);$('nft-v9-buttons').classList.toggle('hidden',!v9);selectionChanged();
 }
 for(const id of ['merge-survivor','merge-donor'])$(id).addEventListener('input',renderPair);
 $('holder-connect').onclick=onConnect;
 for(const node of doc.querySelectorAll('[data-action]'))node.onclick=()=>{const action=node.dataset.action;if(action==='merge'){const ids=[...selected];if(ids.length!==2)return;$('merge-survivor').value=ids[0];$('merge-donor').value=ids[1];onMerge();}else pick(action,[...selected]);};
 return {render,refresh:()=>grid.refresh(),selectPair(a,b){selected.clear();for(const id of [a,b]){selected.add(String(id));const input=[...doc.querySelectorAll('#squeek-cards input[type=checkbox]')].find(el=>el.getAttribute('aria-label')===`Select Squeek #${id}`);if(input)input.checked=true;}selectionChanged();},selectAction:pick,destroy(){version++;observer?.disconnect();grid.destroy();}};
}
