import {formatNumber,formatSqk,formatPower} from './components.js';
export function renderSqueekPage({doc,root,id,token,owner,art,net,canAct,onAction,onPlan}){
 root.replaceChildren();const back=doc.createElement('a');back.href='#squeeks';back.dataset.holderBack='';back.textContent='Squeeks';const title=doc.createElement('h2');title.textContent=`Squeek #${id}`;const view=doc.createElement('span');view.className='chip';view.textContent=canAct()?(token.deposited?'Deposited':'Wallet'):`Viewing #${id}`;
 const image=doc.createElement('img');image.className='squeek-portrait';image.width=640;image.height=640;image.alt=art?.name??`Squeek #${id}`;if(art?.image&&/^(data:image\/|blob:)/.test(art.image))image.src=art.image;
 const info=doc.createElement('div'),facts=doc.createElement('dl');facts.className='squeek-detail-facts';
 for(const[label,value]of [['Owner',owner],['Level',token.level],['Power',(token.basePower??token.activeWeight)==null?null:formatPower(token.basePower??token.activeWeight)],['Custody',token.burned?'Burned':token.stray?'—':token.deposited?'Deposited':'Wallet'],['Merge state',mergeLabel(token,net)],['Next merge height',token.nextMergeHeight??token.nextMergeBlock],['Unclaimed rewards',token.claimable==null?'—':formatSqk(token.claimable)]]){const dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;dd.textContent=value==null?'—':String(value);facts.append(dt,dd);}
 const traits=doc.createElement('dl');traits.className='squeek-detail-facts';for(const trait of art?.attributes??[]){const dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=String(trait.trait??trait.traitType??'');dd.textContent=String(trait.value??'—');traits.append(dt,dd);}
 const actions=doc.createElement('div');actions.className='row';const plan=doc.createElement('button');plan.className='btn';plan.textContent='Path to level';plan.disabled=!canAct();plan.hidden=plan.disabled||!Number.isInteger(token.level)||!net?.policy||token.level>=net.policy.maximumLevel;plan.onclick=()=>onPlan(id);actions.append(plan);
 if(token.supportsDeposit){const action=token.deposited?'withdraw':'deposit',button=doc.createElement('button');button.className='btn';button.textContent=token.deposited?'Withdraw':'Deposit';button.disabled=!canAct();button.onclick=()=>onAction(action,id);actions.append(button);}if(token.claimable!=null){const claim=doc.createElement('button');claim.className='btn';claim.textContent='Claim';claim.disabled=!canAct();claim.onclick=()=>onAction('claim',id);actions.append(claim);}
 info.append(facts,traits,actions);const grid=doc.createElement('div');grid.className='squeek-detail-grid';grid.append(image,info);root.append(back,title,view,grid);return back;
}

export function mergeLabel(token,net){
 if(token.mergeState!=null)return ({ready:'Ready',cooldown:'Cooldown',terminal:'Maximum level',merges_closed:'Closed'})[token.mergeState]??'—';
 if(token.level>=net?.policy?.maximumLevel)return 'Maximum level';if(net?.policy?.mergesOpen===false)return 'Closed';
 if(token.pendingRound!=null&&String(token.pendingRound)!=='0')return '—';
 const next=token.nextMergeHeight??token.nextMergeBlock,height=net?.core?.blockHeight;
 if(!/^\d+$/.test(String(next??''))||!/^\d+$/.test(String(height??'')))return token.mergeReady===true?'Ready':'—';
 return BigInt(next)>BigInt(height)?'Cooldown':'Ready';
}
