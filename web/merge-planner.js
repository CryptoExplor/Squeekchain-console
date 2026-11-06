import {formatPower} from './components.js';
// Advisory only. Callers supply a fresh verified wallet snapshot, never API inventory.
const uint=value=>value!=null&&/^\d+$/.test(String(value));
const maximum=(...values)=>values.reduce((a,b)=>a>b?a:b,0n);
export function planToLevel(status,id,target,{blocksPerSecond=null}={}){
 const policy=status?.net?.policy,height=status?.net?.core?.blockHeight;
 if(!policy||!uint(height)||!Number.isInteger(target)||target<1||target>policy.maximumLevel)throw new Error('Path is unavailable');
 const seen=new Set(),tokens=(status.squeeks??[]).map(token=>{const tokenId=String(token.tokenId);if(!/^[1-9]\d*$/.test(tokenId)||seen.has(tokenId)||!Number.isInteger(token.level)||token.level<1)throw new Error('Path is unavailable');seen.add(tokenId);return {...token,tokenId,ready:token.nextMergeHeight??token.nextMergeBlock};});
 const root=tokens.find(t=>t.tokenId===String(id));if(!root||target<root.level)throw new Error('Choose a higher level');
 // Same-custody merges avoid prerequisite deposits/withdrawals and their signatures.
 const pool=tokens.filter(t=>t!==root),steps=[];let missing=0,missingLevel=null;
 const known=token=>uint(token.ready)&&(!token.pendingRound||String(token.pendingRound)==='0');
 function merge(a,b){if(Boolean(a.deposited)!==Boolean(b.deposited))steps.push({kind:'custody',action:a.deposited?'deposit':'withdraw',tokenId:b.tokenId,state:'Ready',index:steps.length});const at=known(a)&&known(b)?maximum(BigInt(height),BigInt(a.ready),BigInt(b.ready)):null;
  const wait=at==null?null:at-BigInt(height),level=a.level+1,cooldown=policy.levels.find(p=>p.level===level)?.cooldownBlocks;
  const step={survivor:a.tokenId,donor:b.tokenId,level:a.level,nextLevel:level,deposited:Boolean(a.deposited),state:at==null?'Unknown':wait>0n?'Cooldown':'Ready',waitBlocks:wait==null?null:String(wait),etaSeconds:wait!=null&&Number.isFinite(blocksPerSecond)&&blocksPerSecond>0?Math.ceil(Number(wait)/blocksPerSecond):null,dependsOn:steps.filter(s=>[a.tokenId,b.tokenId].includes(s.survivor)).map(s=>s.index),index:steps.length};
  steps.push(step);return {...a,level,ready:at!=null&&uint(cooldown)?String(at+BigInt(cooldown)):null,pendingRound:null,future:true};
 }
 function donor(level,prefer=root.deposited){const candidates=pool.filter(t=>t.level===level).sort((a,b)=>{const custody=Number(Boolean(a.deposited)!==Boolean(prefer))-Number(Boolean(b.deposited)!==Boolean(prefer));if(custody)return custody;const aa=known(a)?BigInt(a.ready):2n**256n,bb=known(b)?BigInt(b.ready):2n**256n;return aa<bb?-1:aa>bb?1:BigInt(a.tokenId)<BigInt(b.tokenId)?-1:1;});if(candidates.length){pool.splice(pool.indexOf(candidates[0]),1);return candidates[0];}
  if(level<=1||!pool.some(t=>t.level<level)){missingLevel=level;return null;}
  const checkpoint=pool.map(t=>({...t})),length=steps.length;
  const a=donor(level-1,prefer),b=a?donor(level-1,a.deposited):null;if(a&&b)return merge(a,b);
  pool.splice(0,pool.length,...checkpoint);steps.length=length;return null;
 }
 let survivor={...root};while(survivor.level<target){const other=donor(survivor.level);if(!other){missing++;steps.push({state:'Missing',level:missingLevel??survivor.level,count:1,index:steps.length});break;}survivor=merge(survivor,other);}
 const finalPower=policy.levels.find(p=>p.level===target);return {id:String(id),target,complete:!missing,donors:steps.filter(s=>s.donor).length,steps,finalLevel:missing?null:target,finalPower:missing?null:finalPower?.basePower??finalPower?.weight??null,mergesOpen:policy.mergesOpen!==false};
}
export function plannerLine(step){if(step.kind==='custody')return `${step.action==='deposit'?'Deposit':'Withdraw'} #${step.tokenId} · ${step.state}`;if(step.state==='Missing')return `Missing · needs ${step.count} more level-${step.level} Squeek${step.count===1?'':'s'}`;const wait=step.state==='Cooldown'?` · ${step.waitBlocks} Squeek blocks · ${step.etaSeconds==null?'—':`~${Math.ceil(step.etaSeconds/60)} min`}`:'';return `Keep #${step.survivor} · burn #${step.donor} → level ${step.nextLevel} · ${step.state==='Unknown'?'—':step.state}${wait}`;}
export function mountPlanner({doc,root,status,selected,initialTarget,canAct,onNext,pace}){
 root.replaceChildren();const heading=doc.createElement('h2');heading.textContent='Path to level';const controls=doc.createElement('div');controls.className='row';
 const token=doc.createElement('select');token.setAttribute('aria-label','Squeek to level');for(const t of status.squeeks){const option=doc.createElement('option');option.value=t.tokenId;option.textContent=`#${t.tokenId} · level ${t.level}`;token.append(option);}if(selected)token.value=selected;
 const target=doc.createElement('select');target.setAttribute('aria-label','Target level');const list=doc.createElement('ol'),summary=doc.createElement('p'),next=doc.createElement('button');next.className='btn';next.textContent='Do next step';next.dataset.testid='planner-next';list.dataset.testid='planner-steps';summary.dataset.testid='planner-summary';
 let plan;function render(){try{plan=planToLevel(status,token.value,Number(target.value),{blocksPerSecond:pace()});summary.textContent=`${plan.donors} donor${plan.donors===1?'':'s'} burned · final level ${plan.finalLevel??'—'} · power ${plan.finalPower==null?'not available':formatPower(plan.finalPower)}`;list.replaceChildren(...plan.steps.map(step=>{const li=doc.createElement('li');li.textContent=plannerLine(step);return li;}));next.disabled=!canAct()||!plan.mergesOpen||plan.steps[0]?.state!=='Ready';}catch{summary.textContent='—';list.replaceChildren();next.disabled=true;}}
 function levels(){const owned=status.squeeks.find(t=>t.tokenId===token.value);target.replaceChildren();for(let level=(owned?.level??0)+1;level<=status.net.policy.maximumLevel;level++){const option=doc.createElement('option');option.value=String(level);option.textContent=`Level ${level}`;target.append(option);}render();}
 token.onchange=levels;target.onchange=render;next.onclick=()=>onNext(plan.steps[0]);controls.append(token,target,next);root.append(heading,controls,summary,list);levels();if(initialTarget&&[...target.options].some(o=>o.value===String(initialTarget))){target.value=String(initialTarget);render();}return {render,selection:()=>({id:token.value,target:Number(target.value)})};
}
