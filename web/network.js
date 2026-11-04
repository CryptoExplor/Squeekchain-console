// Read-only Network extras. The existing wheel poller is the only scheduler.
const PHASES={awaiting_inventory:'awaiting inventory',pending:'not open yet',open:'open',waiting_for_hamster:'waiting for the wheel',randomness_pending:'preparing draw',processing:'assigning entries',claimable:'claimable',cancelled:'cancelled'};
export function createNetworkView({doc,source,current,visible,readContext}){
 const $=id=>doc.getElementById(id),details=$('settlements-details');
 let revision=0,genesisFlight,chartFlight,chartAt=0;
 function reset(profile){
  revision++;genesisFlight=chartFlight=null;chartAt=0;
  $('genesis-row').textContent='Genesis: not open yet';$('genesis-wallet').textContent='';$('genesis-wallet').classList.add('hidden');
  $('settlements-chart').textContent='Unknown';details.open=false;details.classList.toggle('hidden',profile.abiSet!=='v9');
 }
 async function genesis(load,api,owner){
  if(!api||!visible()||load.profileKey!=='sepolia-v9')return;
  if(genesisFlight)return genesisFlight;
  const rev=revision,valid=()=>rev===revision&&current(load);
  const flight=(async()=>{
   try{
    const result=await api.genesis();if(!valid())return;const data=result.data;
    source('Genesis','api',data.status==='unavailable'?data.reason:null);
    $('genesis-row').textContent=data.status==='available'?`Genesis: ${PHASES[data.state.phase]} · inventory issued: ${data.inventory.totalIssued}`:'Genesis: not open yet';
    $('genesis-wallet').classList.toggle('hidden',!owner||data.status!=='available');
    if(!owner||data.status!=='available'){$('genesis-wallet').textContent='';return;}
    $('genesis-wallet').textContent='Receipts: Unknown · Claimable entries: Unknown';
    try{
     const wallet=await api.genesisWallet(owner);if(!valid())return;
     source('Genesis wallet','api',wallet.data.status==='unavailable'?wallet.data.reason:null);
     if(wallet.data.status!=='available')return;
     const w=wallet.data,claimable=data.state.phase==='claimable'?w.receipts.filter(r=>!r.claimed&&!r.refunded).flatMap(r=>r.entries).filter(e=>e.allocatedTokenId!==null&&!e.delivered&&!e.refunded).length:'Unknown';
     $('genesis-wallet').textContent=`Receipts: ${w.receipts.length} · Claimable entries: ${claimable}${w.nextCursor?' · first page; more available':''}`;
    }catch(error){if(valid())source('Genesis wallet','api',error.message);}
   }catch(error){if(!valid())return;source('Genesis','api',error.message);$('genesis-row').textContent='Genesis: not open yet';$('genesis-wallet').textContent='';$('genesis-wallet').classList.add('hidden');}
  })();genesisFlight=flight;try{await flight;}finally{if(genesisFlight===flight)genesisFlight=null;}
 }
 async function chart(load,api){
  if(!api||!visible()||!details.open||load.profileKey!=='sepolia-v9'||Date.now()-chartAt<60000)return;
  if(chartFlight)return chartFlight;
  const rev=revision,valid=()=>rev===revision&&current(load);
  const flight=(async()=>{
   try{
    // Neither this module's renderer nor the ranged API is loaded before expansion.
    const [{renderSettlements},result]=await Promise.all([import('./settlements.js'),api.settlements('7d')]);
    if(!valid())return;source('Settlements','api',result.stale?'Cached response; live request unavailable':null);
    renderSettlements($('settlements-chart'),result.data);if(result.stale)$('settlements-chart').querySelector('p').textContent+=` · as of ${Math.max(1,Math.floor((Date.now()-result.at)/60000))} min`;chartAt=Date.now();
   }catch(error){if(valid()){$('settlements-chart').textContent='Unknown';source('Settlements','api',error.message);}}
  })();chartFlight=flight;try{await flight;}finally{if(chartFlight===flight)chartFlight=null;}
 }
 details.addEventListener('toggle',()=>{if(details.open){const {load,api}=readContext();void chart(load,api);}});
 return {reset,genesis,chart,refresh:(load,api,owner)=>Promise.all([genesis(load,api,owner),chart(load,api)])};
}
