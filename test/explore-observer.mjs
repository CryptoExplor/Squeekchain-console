// Read-only DOM/storage instrumentation shared by the live proof and offline
// regression. It never supplies app data, intercepts requests or changes state.
export function observeExplore(){
 const m=window.__qaExplore={initialDatabases:null,firstHydrated:null,firstPartialAt:null,hundredAt:null,finalAt:null,renderedAt:null,partialRows:0,trace:[]};
 void indexedDB.databases().then(values=>m.initialDatabases=values.map(v=>v.name));
 const observe=()=>{
  const root=document.getElementById('explore-content');if(!root?.dataset.phase)return;
  const d=root.dataset,at=performance.now(),hydrated=Number(d.hydrated),total=Number(d.hydrationTotal),stats=[...root.querySelectorAll('.explore-stats strong')].map(n=>n.textContent),table=root.querySelector('[data-testid=explore-leaderboard]'),rows=table?.querySelectorAll('tbody tr').length??0;
  m.status=d.indexStatus;m.phase=d.phase;m.resumed=d.resumed==='true';
  if(d.phase==='hydrate'&&Number.isFinite(hydrated))m.firstHydrated??=hydrated;
  if(d.indexStatus==='partial'&&hydrated>0&&stats.every(s=>s&&s!=='—')){m.firstPartialAt??=at;m.partialRows=Math.max(m.partialRows,rows);}
  if(total>0&&hydrated>=total)m.hundredAt??=at;
  if(d.phase==='final')m.finalAt??=at;
  if(d.indexStatus==='complete'&&stats.length===4&&stats.every(s=>s&&s!=='—')&&table?.querySelector('tbody tr')?.getClientRects().length){m.renderedAt??=at;m.stats=stats;m.leaderRows=rows;}
  if(m.trace.at(-1)?.phase!==d.phase||m.trace.at(-1)?.hydrated!==hydrated){if(m.trace.length<180)m.trace.push({at,phase:d.phase,status:d.indexStatus,hydrated:Number.isFinite(hydrated)?hydrated:null,total:Number.isFinite(total)?total:null});}
 };
 // Also watch hidden/class: the leaderboard can become visible by its tab panel un-hiding, with no data-* change.
 new MutationObserver(observe).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-phase','data-index-status','data-hydrated','data-hydration-total','data-resumed','hidden','class']});
}
