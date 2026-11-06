import {getProfile,createDiscoveryStore} from './bundle.js';
import {formatNumber} from './components.js';
import {createBrowseGrid} from './browse-grid.js';
import {createExploreIndex,exploreSummary,rankWallets} from './explore-index.js';
import {createExploreReader} from './explore-chain.js';
import {watchHash} from './holder-routes.js';
export function createExploreView({doc,win,root,capture,current,readerOptions,loadImage,source,onTrustError}){
 const make=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;},store=createDiscoveryStore(win.indexedDB);
 const status=make('p','Checking…'),scan=make('button','Rescan','btn'),stats=make('div',null,'explore-stats'),chartArea=make('section',null,'explore-chart'),heading=make('h3','Merges per hour · last 48 hours'),chart=make('div',null,'hour-bars'),show=make('button','Show table','btn'),hourTable=make('table'),browse=make('section'),cards=make('div',null,'squeek-grid'),leaders=make('section'),sort=make('select'),leaderTable=make('table'),leaderWrap=make('div',null,'table-wrap'),leaderPager=make('nav',null,'browse-pager'),switcher=make('nav',null,'row');
 leaderTable.dataset.testid='explore-leaderboard';scan.type=show.type='button';show.setAttribute('aria-expanded','false');hourTable.hidden=true;hourTable.id='explore-hours-table';show.setAttribute('aria-controls',hourTable.id);chart.setAttribute('role','img');chart.setAttribute('aria-label','Merges per hour, last 48 hours');const emptyNote=make('p','No merges in the last 48 hours','explore-empty');const chartHead=make('div',null,'chart-head');chartHead.append(heading,show);chartArea.append(chartHead,chart,emptyNote,hourTable);browse.append(cards);leaderWrap.append(leaderTable);leaders.append(leaderWrap,leaderPager);const sortWrap=make('label',null,'explore-sort');sortWrap.append(make('span','Sort by'),sort);const toolbar=make('div',null,'explore-toolbar');toolbar.append(switcher,sortWrap);sort.setAttribute('aria-label','Leaderboard sort');
 for(const[value,text]of [['totalPower','Total power'],['stakedPower','Staked power'],['count','Squeeks held'],['highestLevel','Highest level'],['pairs','Pairs ready']]){const o=make('option',text);o.value=value;sort.append(o);}
 for(const [value,text]of [['browse','Browse Squeeks'],['leaders','Leaderboard']]){const b=make('button',text,'btn');b.type='button';b.dataset.section=value;b.onclick=()=>navigate({section:value});switcher.append(b);}
 root.append(status,scan,stats,chartArea,toolbar,browse,leaders);
 let closed=false,scope,service,state,sequence=0,leaderOrder=[],scanController,busy=false,failed=false;
 const visible=()=>!closed&&!doc.hidden&&!doc.getElementById('panel-explore').classList.contains('hidden'),query=()=>new URLSearchParams(win.location.hash.split('?')[1]??''),isLeader=()=>query().get('section')==='leaders';
 const grid=createBrowseGrid({doc,win,root:cards,context:()=>({profile:capture().profileKey}),loadImage,imagesEnabled:()=>Boolean(state?.network),indexComplete:()=>Boolean(state?.complete),active:()=>visible()&&!isLeader()});
 let background=false,supply=null;
 const metricNodes=['Live Squeeks','Holders','Staked power','Merges · last 24 hours'].map(label=>{const n=make('div',null,'stat'),strong=make('strong','—'),sub=make('small','—');n.append(make('span',label,'label'),strong,sub);stats.append(n);return {strong,sub};});
 function navigate(patch){const p=query();for(const[k,v]of Object.entries(patch))p.set(k,String(v));win.location.hash=win.location.hash.split('?')[0]+'?'+p;render(false);}
 function clear(){for(const n of metricNodes){n.strong.textContent='—';n.sub.textContent='';}if(/^\d+$/.test(String(supply??''))){metricNodes[0].strong.textContent=formatNumber(supply);metricNodes[0].sub.textContent='Loading holders and merges…';}grid.render(null);leaders.hidden=true;chartArea.hidden=true;switcher.hidden=toolbar.hidden=true;}
 function render(refresh=true){if(!visible())return;stats.hidden=failed;const summary=exploreSummary(state,{partial:!failed});if(!summary){clear();return;}chartArea.hidden=switcher.hidden=toolbar.hidden=false;sortWrap.hidden=!isLeader();browse.hidden=isLeader();leaders.hidden=!isLeader();for(const button of switcher.children)button.setAttribute('aria-pressed',String(button.dataset.section===(isLeader()?'leaders':'browse')));
  const values=[[formatNumber(summary.live),`${formatNumber(summary.burned)} burned in merges`],[formatNumber(summary.holders),`Top wallet: ${summary.topShare.toFixed(1)}%`],[formatNumber(summary.stakedPower),`${formatNumber(summary.vaultCount)} Squeeks in vault`],[formatNumber(summary.merges24),`${formatNumber(summary.merges1)} in the last hour`]];values.forEach(([a,b],i)=>{metricNodes[i].strong.textContent=a;metricNodes[i].sub.textContent=(state.complete?'':'Partial · ')+b;});
  const empty=summary.hours.every(h=>h.count===0);chart.hidden=empty;emptyNote.hidden=!empty;
  const peak=Math.max(1,...summary.hours.map(h=>h.count));for(const[i,h]of summary.hours.entries()){let bar=chart.children[i];if(!bar){bar=make('span');chart.append(bar);}bar.style.height=(h.count/peak*100)+'%';bar.title=new Date(h.start*1000).toISOString()+': '+h.count;}
  const caption=make('caption','Merges per hour · UTC'),head=make('tr');head.append(make('th','Hour (UTC)'),make('th','Merges'));const body=make('tbody');for(const h of summary.hours){const tr=make('tr');tr.append(make('td',new Date(h.start*1000).toISOString().slice(0,16).replace('T',' ')),make('td',String(h.count)));body.append(tr);}hourTable.replaceChildren(caption,head,body);
  grid.render(summary.tokens,state.network);
  const ranks=rankWallets(summary.wallets,query().get('rankSort')),ids=ranks.map(w=>w.address);if(refresh&&leaders.getBoundingClientRect().top<0){const available=new Set(ids);leaderOrder=[...leaderOrder.filter(id=>available.has(id)),...ids.filter(id=>!leaderOrder.includes(id))];}else leaderOrder=ids;const byId=new Map(ranks.map(w=>[w.address,w])),ordered=leaderOrder.map(id=>byId.get(id)),last=Math.max(1,Math.ceil(ordered.length/30)),page=Math.min(last,Math.max(1,Math.floor(Number(query().get('rankPage'))||1)));sort.value=['totalPower','stakedPower','count','highestLevel','pairs'].includes(query().get('rankSort'))?query().get('rankSort'):'totalPower';
  let leaderCaption=leaderTable.querySelector('caption');if(!leaderCaption){leaderCaption=make('caption');leaderTable.prepend(leaderCaption);}leaderCaption.textContent=state.complete?'Wallet leaderboard':'Partial leaderboard · supply check pending';
  let thead=leaderTable.querySelector('thead');if(!thead){thead=make('thead');const tr=make('tr');for(const h of ['Rank','Wallet','Total power','Staked power','Squeeks held','Highest level','Pairs ready'])tr.append(make('th',h));thead.append(tr);leaderTable.append(thead,make('tbody'));}const tbody=leaderTable.querySelector('tbody'),previous=new Map([...tbody.children].map(tr=>[tr.dataset.address,tr]));let pos=0;for(const w of ordered.slice((page-1)*30,page*30)){let tr=previous.get(w.address);if(!tr){tr=make('tr');tr.dataset.address=w.address;for(let i=0;i<7;i++)tr.append(make('td'));const link=make('a');link.textContent=w.address.slice(0,6)+'…'+w.address.slice(-4);link.title=w.address;link.href=watchHash(capture().profileKey,w.address);tr.children[1].append(link);}tr.children[0].textContent=String((page-1)*30+pos+1);[w.totalPower,w.stakedPower,w.count,w.highestLevel,w.pairs].forEach((v,i)=>tr.children[i+2].textContent=formatNumber(v));if(tbody.children[pos]!==tr)tbody.insertBefore(tr,tbody.children[pos]??null);previous.delete(w.address);pos++;}for(const tr of previous.values())tr.remove();
  leaderPager.replaceChildren();for(const[next,text,disabled]of [[page-1,'Previous',page===1],[page+1,'Next',page===last]]){const b=make('button',text,'btn');b.disabled=disabled;b.onclick=()=>{navigate({rankPage:next});if(win.innerWidth<=600)leaders.scrollIntoView?.({block:'start'});};if(text==='Next')leaderPager.append(make('span',`Page ${page} of ${last}`));leaderPager.append(b);}
 }
 function progress(load,key,p){
  if(closed||!current(load)||scope!==key)return;
  root.dataset.phase=p.phase;root.dataset.resumed=String(p.resumed??false);
  if(p.tokenTotal!=null){root.dataset.hydrated=String(p.tokens);root.dataset.hydrationTotal=String(p.tokenTotal);}
  if(p.state){state=p.state;if(p.tokens>0){root.dataset.indexStatus='partial';render(false);}}
  status.textContent=p.phase==='final'?'Almost there · checking the latest totals…':p.phase==='hydrate'?`Partial · Loading Squeeks: ${p.tokens} of ${p.tokenTotal}`:p.phase==='history'?`Loading merge times: ${p.headers} of ${p.headerTotal}`:`Reading the chain: ${p.done} of ${p.total}`;
 }
 let autoRetries=0;
 async function sync({restart=false}={}){
  if(!visible()&&!background)return;const load=capture(),key=`${load.generation}:${load.profileKey}`;
  if(scope===key&&(busy||failed&&!restart))return;
  if(scope!==key){
   scanController?.abort();scanController=new AbortController();sequence++;scope=key;state=null;failed=false;leaderOrder=[];
   const profile=getProfile(load.profileKey),signal=AbortSignal.any([load.signal,scanController.signal]);
   service=createExploreIndex({profile,store,reader:createExploreReader({...readerOptions(load),signal}),signal,progress:p=>progress(load,key,p)});
   clear();stats.hidden=false;root.dataset.indexStatus='loading';status.textContent='Reading the chain…';
  }
  const seq=++sequence;busy=true;scan.hidden=true;
  try{
   const result=await service.sync({restart});if(closed||!current(load)||scope!==key||seq!==sequence)return;
   state=result;failed=!result.complete;if(result.complete)autoRetries=0;root.dataset.indexStatus=result.complete?'complete':'incomplete';root.dataset.phase='done';
   root.dataset.indexed=String(Object.values(result.tokens).filter(t=>t.minted&&!t.burned).length);root.dataset.supply=result.totalSupply;root.dataset.scanBlock=result.snapshot.blockNumber;
   scan.hidden=result.complete;scan.textContent=result.complete?'Rescan':'Retry';
   status.textContent=result.complete?`As of ${new Date(Number(result.snapshot.timestamp)*1000).toISOString().replace('T',' ').slice(0,19)} UTC · ${Math.max(0,Math.floor((Date.now()/1000-Number(result.snapshot.timestamp))/60))} min ago`:"Couldn't finish, retry";
   source('Explore','rpc',result.complete?null:`Final supply mismatch: ${root.dataset.indexed} indexed / ${result.totalSupply} totalSupply`);render();
  }catch(error){
   if(closed||!current(load)||scope!==key||seq!==sequence)return;
   scanController.abort(error);clear();state=null;failed=true;stats.hidden=true;root.dataset.indexStatus='unavailable';root.dataset.phase='failed';
   if(error?.name!=='AbortError'&&autoRetries<2){autoRetries++;status.textContent='Network busy · retrying…';scope=null;busy=false;setTimeout(()=>{if(!closed&&scope===null)sync();},2500*autoRetries);return;}
   status.textContent="Couldn't finish, retry";scan.textContent='Retry';scan.hidden=false;source('Explore','rpc',error.message);if(error.name==='RpcTrustError')onTrustError(error);
  }finally{if(scope===key&&seq===sequence)busy=false;}
 }
 scan.onclick=()=>{const restart=state?.validationFailed===true;scope=null;void sync({restart});};show.onclick=()=>{hourTable.hidden=!hourTable.hidden;show.textContent=hourTable.hidden?'Show table':'Hide table';show.setAttribute('aria-expanded',String(!hourTable.hidden));};sort.onchange=()=>navigate({rankSort:sort.value,rankPage:1});
 const pause=()=>{if(busy){scanController?.abort();sequence++;scope=null;busy=false;root.dataset.indexStatus='paused';status.textContent='Paused · progress saved';scan.textContent='Retry';scan.hidden=false;}},visibility=()=>{if(doc.hidden)pause();else if(visible())void sync();};doc.addEventListener('visibilitychange',visibility);
 const route=()=>{if(!visible()&&!background)pause();render(false);};win.addEventListener('hashchange',route);win.addEventListener('popstate',route);
 // Detail links originating here remain read-only, even if the connected wallet owns the NFT.
 browse.addEventListener('click',e=>{const a=e.target.closest('a');if(!a?.hash?.includes('/squeek/'))return;e.preventDefault();const before=win.location.href;win.history.pushState({exploreReadOnly:true},'',a.hash);win.dispatchEvent(new win.HashChangeEvent('hashchange',{oldURL:before,newURL:win.location.href}));});
 clear();return {supply(value){supply=value;if(!state)clear();},prefetch(){background=true;return sync();},show:()=>{if(state?.complete&&scope===`${capture().generation}:${capture().profileKey}`){render(false);return Promise.resolve();}return sync();},tick:()=>sync(),async history(id){
     if(!state?.complete||scope!==`${capture().generation}:${capture().profileKey}`)return {unknown:true,rows:[]};
     const events=await service.history(state,id);
     const text=({Transfer:'Transferred',Deposited:'Deposited',Withdrawn:'Withdrew',Recovered:'Withdrew',Merged:'Merged',DepositedMerge:'Merged',PositionsMerged:'Merged'});
     return {unknown:false,rows:events.map(e=>{const known=e.timestamp!=null&&Number.isFinite(Number(e.timestamp));return {key:e.transactionHash+':'+e.logIndex,hash:e.transactionHash,text:text[e.eventName]+` #${e.args.tokenId??e.args.survivor}`,time:known?new Date(Number(e.timestamp)*1000).toISOString():null,age:known?new Date(Number(e.timestamp)*1000).toISOString().slice(0,16).replace('T',' ')+' UTC':'Time unavailable'};}).reverse()};
   },destroy(){closed=true;scanController?.abort();doc.removeEventListener('visibilitychange',visibility);sequence++;grid.destroy();win.removeEventListener('hashchange',route);win.removeEventListener('popstate',route);root.replaceChildren();}};
}
