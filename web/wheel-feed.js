// Display-only descriptions of documented public API payloads. Unknown types or
// missing identifiers have no invented fallback; none of these rows authorise actions.
const uint=value=>typeof value==='string'&&/^\d+$/.test(value)&&value.length<=78;
const number=value=>uint(value)?BigInt(value).toLocaleString('en-US'):null;
function amount(value){if(!uint(value))return null;const n=BigInt(value),whole=(n/10n**18n).toLocaleString('en-US'),fraction=String(n%10n**18n).padStart(18,'0').slice(0,3).replace(/0+$/,'');return n>0n&&n<10n**15n?'<0.001':whole+(fraction?'.'+fraction:'');}
export function relativeTime(value,now=Date.now()){const at=Date.parse(value);if(!Number.isFinite(at)||at>now+5000)return null;const seconds=Math.max(0,Math.floor((now-at)/1000));return seconds<60?'just now':seconds<3600?`${Math.floor(seconds/60)}m`:seconds<86400?`${Math.floor(seconds/3600)}h`:`${Math.floor(seconds/86400)}d`;}
export function wheelFeed(events=[],settlements=[],now=Date.now()){
 const rounds=new Map(),other=[],ids=new Set();
 function round(value){if(!uint(value))return null;const key=BigInt(value).toString();if(!rounds.has(key))rounds.set(key,{round:key,at:null});return rounds.get(key);}
 function time(row,at){if(Number.isFinite(Date.parse(at))&&(!row.at||Date.parse(at)>Date.parse(row.at)))row.at=at;}
 for(const item of settlements){const row=round(item.settledThroughRound);if(!row)continue;row.settled=true;row.blocks=number(item.completedBlockCount)??row.blocks;time(row,item.blockTimestamp);}
 for(const event of events){if(event.id&&ids.has(event.id))continue;if(event.id)ids.add(event.id);const p=event.payload??{},type=event.type??event.kind,at=event.occurredAt;
  if(type==='system.settlement_completed'){const row=round(p.settledThroughRound);if(row){row.settled=true;row.blocks=number(p.completedBlockCount)??row.blocks;time(row,at);}continue;}
  if(type==='system.mining_checkpointed'){const row=round(p.throughRound);if(row){row.issued=amount(p.amountBaseUnits)??row.issued;row.blocks=number(p.completedBlockCount)??row.blocks;time(row,at);}continue;}
  let text,icon='squeek';const id=number(p.tokenId),sqk=amount(p.amountBaseUnits);
  if(type==='nft.merged'&&number(p.donorTokenId)&&number(p.survivorTokenId))text=`Squeek #${number(p.donorTokenId)} merged into #${number(p.survivorTokenId)}`;
  else if(type==='nft.deposited'&&id)text=`Squeek #${id} deposited`;
  else if(type==='nft.withdrawn'&&id)text=`Squeek #${id} withdrawn`;
  else if(type==='nft.launch_claimed'&&id)text=`Squeek #${id} claimed`;
  else if(type==='account.rewards_claimed'&&sqk!=null){text=`${sqk} SQK rewards claimed`;icon='sqk';}
  else if(['account.sqk_staked','account.rewards_staked','account.sqk_unstaked'].includes(type)&&sqk!=null){text=`${sqk} SQK ${type==='account.sqk_unstaked'?'unstaked':'staked'}`;icon='sqk';}
  if(text)other.push({text,icon,at});
 }
 for(const row of rounds.values()){
  const parts=[];if(row.settled){parts.push(`Round ${number(row.round)} settled`);if(row.blocks!=null)parts.push(`${row.blocks} blocks`);}
  // Issuance is a separate checkpoint, not attributed to an individual settlement.
  if(row.issued!=null)parts.push(`${row.issued} SQK issued${row.settled?' (checkpoint)':''}`);
  if(parts.length)other.push({text:parts.join(' · '),icon:row.settled?'round':'sqk',at:row.at});
 }
 return other.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)).map(row=>({...row,text:row.text+(relativeTime(row.at,now)?` · ${relativeTime(row.at,now)}`:'')}));
}
export function formingBlock(data,active){if(!active)return null;const p=data?.projected;if(!uint(p?.blockHeight))return null;const progress=uint(p.blockProgress)&&BigInt(p.blockProgress)<10n**9n?`${BigInt(p.blockProgress)*100n/10n**9n}% · `:'';return `Block ${(BigInt(p.blockHeight)+1n).toLocaleString('en-US')} forming · ${progress}provisional`;}
