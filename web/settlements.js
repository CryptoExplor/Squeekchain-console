// Lazy, dependency-free SVG. Missing and future buckets never become zero bars.
export function settlementBuckets(data,now=Date.now()){
 const start=Date.parse(data.window.startAt),byStart=new Map(data.buckets.map(b=>[Date.parse(b.startAt),b]));
 return Array.from({length:28},(_,i)=>{const at=start+i*21600000,b=byStart.get(at);return {at,value:at<=now?b?.completedBlockCount??null:null};});
}
export function renderSettlements(root,data){
 const doc=root.ownerDocument,buckets=settlementBuckets(data),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 560 86');svg.setAttribute('role','img');svg.setAttribute('aria-label',`Settlements, last 7 days. ${buckets.filter(b=>b.value===null).length} of 28 periods Unknown. Each bar has its exact count.`);
 const max=Math.max(1,...buckets.map(b=>Number(b.value??0)));
 for(const [i,bucket] of buckets.entries()){
  const rect=doc.createElementNS(svg.namespaceURI,'rect'),unknown=bucket.value===null,zero=bucket.value==='0',height=unknown?62:Math.max(1,Number(bucket.value)/max*62);
  rect.setAttribute('x',String(i*20+2));rect.setAttribute('y',String(68-height));rect.setAttribute('width','16');rect.setAttribute('height',String(height));rect.setAttribute('class',unknown?'chart-gap':zero?'chart-zero':'chart-bar');
  const title=doc.createElementNS(svg.namespaceURI,'title');title.textContent=`${new Date(bucket.at).toISOString()}: ${unknown?'Unknown':`${bucket.value} completed Squeek blocks`}`;rect.append(title);svg.append(rect);
 }
 const note=doc.createElement('p');note.className='muted small';note.textContent='Completed Squeek blocks per 6 hours · dashed = Unknown.';
 root.replaceChildren(svg,note);
}
