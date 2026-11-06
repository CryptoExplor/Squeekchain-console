// Shared browsing only. Every selection is a hint, never transaction authority.
import {formatNumber,formatPower} from './components.js';
import {squeekHash} from './holder-routes.js';
import {getProfile} from './bundle.js';
const uint=v=>typeof v!=='boolean'&&/^\d+$/.test(String(v??''));
export function browseState(token,net){
 const max=net?.policy?.maximumLevel;if(token.stray)return {key:'unknown',label:'—'};if(!Number.isInteger(token.level)||token.level<1||!Number.isInteger(max))return {key:'unknown',label:'—'};
 if(token.level>=max)return {key:'max',label:'Max level'};
 if(net?.policy?.mergesOpen!==true||token.pendingRound!=null&&String(token.pendingRound)!=='0')return {key:'unknown',label:'—'};
 const next=token.nextMergeHeight??token.nextMergeBlock,height=net?.core?.blockHeight;
 if(!uint(next)||!uint(height))return {key:'unknown',label:'—'};
 const left=BigInt(next)-BigInt(height);return left>0n?{key:'cooldown',label:`Cooldown · ${left} blocks left`}:{key:'ready',label:'Ready'};
}
export function pairCandidates(rows,net){
 const groups=new Map();let unknown=net?.policy?.mergesOpen!==true;
 for(const t of rows){const s=browseState(t,net);if(s.key==='unknown')unknown=true;if(s.key!=='ready')continue;const key=`${t.owner??''}:${Boolean(t.deposited)}:${t.level}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(String(t.tokenId));}
 const ids=new Set();let count=0;for(const group of groups.values())if(group.length>=2){count+=Math.floor(group.length/2);group.forEach(id=>ids.add(id));}
 return {count:unknown?null:count,ids};
}
export function browseQuery(hash){
 const p=new URLSearchParams(String(hash).split('?')[1]??'');return {level:/^[1-9]\d?$/.test(p.get('level')??'')?p.get('level'):'',state:['ready','cooldown','max'].includes(p.get('state'))?p.get('state'):'',where:['wallet','vault'].includes(p.get('where'))?p.get('where'):'',sort:['level','power','id'].includes(p.get('sort'))?p.get('sort'):'id',order:p.get('order')==='desc'?'desc':'asc',q:(p.get('q')??'').slice(0,78),page:Math.min(100000,Math.max(1,Number(p.get('page'))||1)),view:['grid','table'].includes(p.get('view'))?p.get('view'):null,pairs:p.get('pairs')==='1'};
}
export function filterSqueeks(rows,query,net){
 const pairs=pairCandidates(rows,net).ids,power=t=>t.basePower??t.activeWeight??net?.policy?.levels?.find(l=>l.level===t.level)?.basePower;
 const found=rows.filter(t=>!t.burned&&(!query.level||String(t.level)===query.level)&&(!query.state||browseState(t,net).key===query.state)&&(!query.where||(query.where==='vault')===Boolean(t.deposited||t.custody==='vault'))&&(!query.q||String(t.tokenId).includes(query.q.replace(/^#/,'')))&&(!query.pairs||pairs.has(String(t.tokenId))));
 return found.sort((a,b)=>{const av=query.sort==='level'?a.level:query.sort==='power'?power(a):a.tokenId,bv=query.sort==='level'?b.level:query.sort==='power'?power(b):b.tokenId;if(!uint(av)||!uint(bv))return uint(av)?-1:uint(bv)?1:BigInt(a.tokenId)<BigInt(b.tokenId)?-1:1;const n=BigInt(av)<BigInt(bv)?-1:BigInt(av)>BigInt(bv)?1:0;return n*(query.order==='desc'?-1:1)||(BigInt(a.tokenId)<BigInt(b.tokenId)?-1:1);});
}
export function createBrowseGrid({doc,win,root,context,loadImage,imagesEnabled=()=>true,indexComplete=()=>true,selected=new Set(),canSelect=()=>false,onSelection=()=>{},onAction,onPairs,active=()=>true}){
 const make=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const bar=make('form',null,'browse-filters'),controls={},label=(name,text,options)=>{const l=make('label',text),s=make('select');s.name=name;s.setAttribute('aria-label',text);for(const [value,title]of options){const o=make('option',title);o.value=value;s.append(o);}l.append(s);bar.append(l);controls[name]=s;return s;};
 label('level','Level',[['','Any level']]);label('state','State',[['','Any state'],['ready','Ready'],['cooldown','Cooldown'],['max','Max level']]);label('where','Where',[['','Anywhere'],['wallet','Wallet'],['vault','Vault']]);label('sort','Sort',[['id','Token ID'],['level','Level'],['power','Power']]);label('order','Order',[['asc','Low to high'],['desc','High to low']]);
 const searchLabel=make('label','ID search'),search=make('input');search.name='q';search.inputMode='numeric';search.setAttribute('aria-label','ID search');searchLabel.append(search);bar.append(searchLabel);controls.q=search;
 const toggle=make('button','Table','btn'),pairs=make('button',null,'btn pairs-chip');toggle.type=pairs.type='button';pairs.hidden=true;bar.append(toggle,pairs);root.before(bar);
 const empty=make('div',null,'browse-empty'),clear=make('button','Clear filters','btn');clear.type='button';empty.append(make('p','No Squeeks match'),clear);root.after(empty);const table=make('table',null,'browse-table'),wrap=make('div',null,'table-wrap');wrap.append(table);empty.after(wrap);const pager=make('nav',null,'browse-pager');pager.setAttribute('aria-label','Squeek pages');wrap.after(pager);
 let rows=[],net,scope='',order=[],version=0,typing,closed=false,observer,view='grid',filterKey;const cards=new Map();
 const current=()=>context(),storage=()=>{try{return win.localStorage.getItem('wheelhouse:browse-view')??'grid';}catch{return 'grid';}};
 function route(patch={},reset=false){if(closed)return;const p=new URLSearchParams(win.location.hash.split('?')[1]??'');if(reset)for(const k of ['level','state','where','sort','order','q','page','pairs'])p.delete(k);for(const[k,v]of Object.entries(patch)){if(v===''||v==null||v===false)p.delete(k);else p.set(k,String(v));}if(!('page'in patch))p.delete('page');const next=win.location.hash.split('?')[0]+(p.size?'?'+p:'');win.location.hash=next;render(false);}
 function freshImage(card,t){
  card.imageVersion=(card.imageVersion??0)+1;const rev=card.imageVersion,frame=card.querySelector('.squeek-image');frame.replaceChildren();frame.classList.add('is-skeleton');frame.classList.remove('image-failed');const img=make('img');img.width=img.height=144;img.loading='lazy';img.decoding='async';img.alt=`Squeek #${t.tokenId}`;frame.append(img);
  const start=async(stage=0)=>{if(closed||rev!==card.imageVersion||!card.isConnected)return;try{const item=await loadImage(t,stage);if(closed||rev!==card.imageVersion||!card.isConnected)return;img.onload=()=>frame.classList.remove('is-skeleton');img.onerror=()=>{img.removeAttribute('src');if(stage<2)void start(stage+1);else fail();};img.src=item.image;}catch(error){if(error.name!=='RpcTrustError'&&error.kind!=='schema'&&error.kind!=='level'&&error.name!=='AbortError'&&stage<2&&rev===card.imageVersion)void start(stage+1);else fail();}};
  const fail=()=>{if(rev!==card.imageVersion)return;frame.classList.remove('is-skeleton');frame.classList.add('image-failed');img.remove();frame.setAttribute('aria-label',`Image unavailable for Squeek #${t.tokenId}`);};
  card.loadImage=()=>start();if(observer)observer.observe(card);else void start();
 }
 function patchCard(t){
  const id=String(t.tokenId);let card=cards.get(id),created=!card;
  if(!card){card=make('article',null,'squeek-card');card.dataset.testid='squeek-card';card.dataset.token=id;const frame=make('a',null,'squeek-image'),heading=make('h3'),link=make('a',`#${id}`),badge=make('span',null,'level-badge'),status=make('p',null,'card-state'),actions=make('div',null,'card-actions');link.setAttribute('aria-label',`Squeek #${id}`);frame.setAttribute('aria-label',`View Squeek #${id} image`);heading.append(link,badge);card.append(frame,heading,status,actions);cards.set(id,card);}
  const c=current(),path=squeekHash(c.profile,id);card.querySelector('.squeek-image').href=path;card.querySelector('h3 a').href=path;
  const badge=card.querySelector('.level-badge');badge.textContent=Number.isInteger(t.level)?`L${t.level}`:'Level —';badge.className=`level-badge level-${Number.isInteger(t.level)?Math.min(10,t.level):'unknown'}`;card.querySelector('.card-state').textContent=browseState(t,net).label+' · '+(t.deposited?'Deposited':'Wallet');card.title=`Power: ${formatPower(t.basePower??t.activeWeight??net?.policy?.levels?.find(l=>l.level===t.level)?.basePower)}`;
  const actions=card.querySelector('.card-actions');let input=actions.querySelector('input');if(canSelect()){if(!input){const l=make('label','Select');input=make('input');input.type='checkbox';input.setAttribute('aria-label',`Select Squeek #${id}`);input.onchange=()=>{input.checked?selected.add(id):selected.delete(id);onSelection();};l.prepend(input);actions.append(l);}input.disabled=false;input.checked=selected.has(id);}else if(input)input.closest('label').remove();
  let button=actions.querySelector('button');if(canSelect()&&Boolean(getProfile(c.profile).capabilities.deposit)&&onAction){if(!button){button=make('button',null,'btn');actions.append(button);}button.textContent=t.deposited?'Withdraw':'Deposit';button.onclick=()=>onAction(t.deposited?'withdraw':'deposit',id);}else button?.remove();
  const artKey=`${c.profile}:${id}:${t.level}`;if(card.artKey!==artKey){card.artKey=artKey;card.needsImage=t;}
  return {card,created};
 }
 function render(refresh=true){if(closed)return;const c=current();if(!active())return;const query=browseQuery(win.location.hash);view=query.view??storage();const all=filterSqueeks(rows,query,net),freshOrder=all.map(t=>String(t.tokenId));const nextFilter=JSON.stringify(query);if(refresh&&filterKey===nextFilter&&bar.getBoundingClientRect().top<0&&scope===`${c.profile}:${c.owner??''}`){const valid=new Set(freshOrder);order=[...order.filter(id=>valid.has(id)),...freshOrder.filter(id=>!order.includes(id))];}else order=freshOrder;
  filterKey=nextFilter;scope=`${c.profile}:${c.owner??''}`;const byId=new Map(all.map(t=>[String(t.tokenId),t])),sorted=order.map(id=>byId.get(id)).filter(Boolean),last=Math.max(1,Math.ceil(sorted.length/40)),page=Math.min(last,Math.floor(query.page));const slice=sorted.slice((page-1)*40,page*40);
  const max=net?.policy?.maximumLevel??10;if(controls.level.options.length!==max+1){controls.level.replaceChildren();for(let i=0;i<=max;i++){const o=make('option',i?`L${i}`:'Any level');o.value=i?String(i):'';controls.level.append(o);}}
  for(const[name,n]of Object.entries(controls))n.value=query[name]??'';toggle.textContent=view==='grid'?'Table':'Grid';toggle.setAttribute('aria-label',`Show ${view==='grid'?'table':'grid'}`);const candidates=pairCandidates(rows,net),complete=indexComplete()&&candidates.count!=null;
  // A still-loading index (or a scan across all wallets) makes this count jump
  // and mean little, so it is labelled and hidden until the index is complete.
  pairs.textContent=complete?`Ready pairs · all wallets: ${candidates.count}`:'';
  pairs.setAttribute('aria-pressed',String(query.pairs));pairs.hidden=!complete;
  empty.hidden=sorted.length>0;root.hidden=view!=='grid'||!sorted.length;wrap.hidden=view!=='table'||!sorted.length;
  const keep=new Set(slice.map(t=>String(t.tokenId)));for(const child of [...root.children])if(!keep.has(child.dataset.token))child.remove();
  for(const [i,t] of slice.entries()){const {card}=patchCard(t);const detached=!card.isConnected;if(root.children[i]!==card)root.insertBefore(card,root.children[i]??null);if(detached&&!card.needsImage&&!card.querySelector('img')?.getAttribute('src')){if(observer)observer.observe(card);else void card.loadImage?.();}if(card.needsImage&&imagesEnabled()){const image=card.needsImage;delete card.needsImage;freshImage(card,image);}}
  const head=make('thead'),hr=make('tr');for(const text of ['Squeek','Level','State','Where','Power','Next merge'])hr.append(make('th',text));head.append(hr);const body=make('tbody');for(const t of slice){const tr=make('tr'),td=make('td'),link=make('a',`#${t.tokenId}`);link.href=squeekHash(c.profile,t.tokenId);td.append(link);tr.append(td);for(const value of [t.level==null?'—':`L${t.level}`,browseState(t,net).label,t.deposited?'Vault':'Wallet',formatPower(t.basePower??t.activeWeight??net?.policy?.levels?.find(l=>l.level===t.level)?.basePower),/^\d+$/.test(String(t.nextMergeHeight??t.nextMergeBlock??''))?`Block ${formatNumber(t.nextMergeHeight??t.nextMergeBlock)}`:'—'])tr.append(make('td',String(value)));body.append(tr);}table.replaceChildren(head,body);
  pager.replaceChildren();const add=(n,text,disabled)=>{const b=make('button',text,'btn');b.type='button';b.disabled=disabled;b.onclick=()=>{route({page:n});if(win.innerWidth<=600)bar.scrollIntoView?.({block:'start'});};pager.append(b);};add(page-1,'Previous',page===1);pager.append(make('span',`Page ${page} of ${last}`));add(page+1,'Next',page===last);
 }
 if(win.IntersectionObserver)observer=new win.IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);void e.target.loadImage?.();}},{rootMargin:'0px'});
 bar.onsubmit=e=>{e.preventDefault();clearTimeout(typing);route({q:search.value});};bar.onchange=e=>{if(e.target.name&&e.target.name!=='q')route({[e.target.name]:e.target.value});};search.oninput=()=>{const seq=++version;clearTimeout(typing);typing=win.setTimeout(()=>{if(seq===version)route({q:search.value});},250);};toggle.onclick=()=>{view=view==='grid'?'table':'grid';try{win.localStorage.setItem('wheelhouse:browse-view',view);}catch{}route({view,page:browseQuery(win.location.hash).page});};clear.onclick=()=>route({},true);pairs.onclick=()=>{route({pairs:browseQuery(win.location.hash).pairs?'':'1'});onPairs?.();};
 const restore=()=>{version++;clearTimeout(typing);render(false);};win.addEventListener('hashchange',restore);win.addEventListener('popstate',restore);
 return {render(data,network){rows=data??[];net=network;for(const t of rows){const card=cards.get(String(t.tokenId));if(card?.querySelector('.image-failed'))card.needsImage=t;}bar.hidden=data==null;empty.hidden=data==null;pager.hidden=data==null;wrap.hidden=data==null;root.hidden=data==null;if(data==null){pairs.hidden=true;pairs.textContent='';root.replaceChildren();observer?.disconnect();return;}render(true);},refresh:()=>render(true),select(id,checked){selected[checked?'add':'delete'](String(id));render(false);},destroy(){closed=true;version++;clearTimeout(typing);observer?.disconnect();win.removeEventListener('hashchange',restore);win.removeEventListener('popstate',restore);for(const card of cards.values())card.imageVersion++;bar.remove();empty.remove();wrap.remove();pager.remove();}};
}
