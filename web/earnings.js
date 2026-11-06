import {formatEther} from './bundle.js';
// Display only: round to 2 decimals with thousands separators.
const sqk=v=>Number(formatEther(v)).toLocaleString('en-US',{maximumFractionDigits:2});
export function earningsDays(earnings,now=Date.now()){
 const days=[],seen=new Map();for(const item of earnings??[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!/^\d{1,78}$/.test(item.earnedBaseUnits??'')||seen.has(item.date))throw new Error('Earnings unavailable');seen.set(item.date,item.earnedBaseUnits);}
 const end=new Date(now);end.setUTCHours(0,0,0,0);for(let i=6;i>=0;i--){const date=new Date(end.getTime()-i*86400000).toISOString().slice(0,10);days.push({date,amount:seen.get(date)??null});}return days;
}
export function renderEarnings({doc,root,data,now}){
 root.replaceChildren();root.hidden=!data;if(!data)return;
 const title=doc.createElement('h2');title.textContent='Earnings';const days=earningsDays(data.earnings,now),max=days.reduce((n,d)=>d.amount!=null&&BigInt(d.amount)>n?BigInt(d.amount):n,1n),chart=doc.createElement('div');chart.className='earnings-chart';chart.setAttribute('role','img');chart.setAttribute('aria-label','7-day earnings: '+days.map(d=>`${d.date} ${d.amount==null?'—':formatEther(BigInt(d.amount))+' SQK'}`).join('; '));
 const table=doc.createElement('dl');table.className='earnings-labels';for(const day of days){const group=doc.createElement('div'),col=doc.createElement('div'),bar=doc.createElement('span'),dt=doc.createElement('dt'),dd=doc.createElement('dd');col.className='earnings-col';bar.className='earnings-bar';const pct=day.amount==null?0:Number(BigInt(day.amount)*100n/max);bar.style.height=day.amount==null||pct===0?'2px':`${Math.max(pct,4)}%`;if(day.amount==null||BigInt(day.amount)===0n)bar.classList.add('empty');col.append(bar);dt.textContent=day.date.slice(5);dd.textContent=day.amount==null?'—':`${sqk(BigInt(day.amount))} SQK`;group.append(col,dt,dd);table.append(group);}chart.append(table);
 const lifetime=doc.createElement('dl');lifetime.className='sqk-facts';for(const[label,value]of [['Lifetime claimed',data.rewards?.lifetimePaidBaseUnits],['Lifetime compounded',data.rewards?.lifetimeCompoundedBaseUnits]]){const wrap=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;dd.textContent=/^\d+$/.test(value??'')?`${sqk(BigInt(value))} SQK`:'—';wrap.append(dt,dd);lifetime.append(wrap);}root.append(title,chart,lifetime);
}
