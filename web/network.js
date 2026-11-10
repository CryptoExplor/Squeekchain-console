// Read-only Genesis row. Only the existing wheel poller schedules refreshes.
import {getProfile} from './bundle.js';
const PHASES={awaiting_inventory:'awaiting inventory',pending:'not open',open:'open',waiting_for_hamster:'waiting for the wheel',randomness_pending:'preparing draw',processing:'assigning entries',claimable:'claimable',cancelled:'cancelled'};
export function createNetworkView({doc,source,current,visible,readContext,profileFor=getProfile}){
 const $=id=>doc.getElementById(id);
 let revision=0,genesisFlight;
 function reset(profile){
  revision++;genesisFlight=null;$('genesis-row').classList.toggle('hidden',!Boolean(profile.addresses?.launch));
  $('genesis-row').textContent='Genesis sale: loading…';$('genesis-wallet').textContent='';$('genesis-wallet').classList.add('hidden');
 }
 async function genesis(load,api,owner){
  const profile=profileFor(load.profileKey);if(!api||!visible()||!profile.apiBase||!profile.addresses?.launch)return;
  if(genesisFlight)return genesisFlight;
  const rev=revision,valid=()=>rev===revision&&current(load);
  const flight=(async()=>{
   try{
    const result=await api.genesis();if(!valid())return;const data=result.data;
    source('Genesis','api',data.status==='unavailable'?data.reason:null);
    $('genesis-row').textContent=data.status==='available'?`Genesis sale: ${PHASES[data.state.phase]} · ${data.inventory.totalIssued} issued`:'Genesis sale: unavailable · phase unknown';
    $('genesis-wallet').classList.toggle('hidden',!owner||data.status!=='available');
    if(!owner||data.status!=='available'){$('genesis-wallet').textContent='';return;}
    $('genesis-wallet').textContent='';
    try{
     const wallet=await api.genesisWallet(owner);if(!valid())return;
     source('Genesis wallet','api',wallet.data.status==='unavailable'?wallet.data.reason:null);
     if(wallet.data.status!=='available')return;
     const w=wallet.data,claimable=data.state.phase==='claimable'?w.receipts.filter(r=>!r.claimed&&!r.refunded).flatMap(r=>r.entries).filter(e=>e.allocatedTokenId!==null&&!e.delivered&&!e.refunded).length:null;
     $('genesis-wallet').textContent=`Receipts: ${w.receipts.length}${claimable!==null?` · Claimable entries: ${claimable}`:''}${w.nextCursor?' · first page; more available':''}`;
    }catch(error){if(valid())source('Genesis wallet','api',error.message);}
   }catch(error){if(!valid())return;source('Genesis','api',error.message);$('genesis-row').textContent='Genesis sale: unavailable · phase unknown';$('genesis-wallet').textContent='';$('genesis-wallet').classList.add('hidden');}
  })();genesisFlight=flight;try{await flight;}finally{if(genesisFlight===flight)genesisFlight=null;}
 }
 return {reset,genesis,refresh:genesis};
}
