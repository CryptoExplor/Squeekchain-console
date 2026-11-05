import { getProfile } from './bundle.js';
// Presentation only. Device readings never become transaction inputs.
import {telemetryView} from './telemetry.js';
export function createNetworkStrip(doc,{now=()=>Date.now(),wheelEnabled=key=>Boolean(getProfile(key).apiBase)}={}) {
  const $=id=>doc.getElementById(id);
  const known=value=>value!=null&&/^\d+$/.test(String(value));
  let profile,last;
  function offline() {
    if(last) {
      $('wheel-state').textContent=last.state;
      $('wheel-rpm').textContent=last.rpm;
      $('wheel-reading').hidden=false;
      $('wheel-asof').textContent=` · as of ${Math.max(1,Math.floor((now()-last.at)/60000))} min`;
      $('wheel-asof').hidden=false;
      $('wheel-note').textContent=$('wheel-asof').textContent.slice(3);
    } else {
      $('wheel-state').textContent='Wheel offline';
      $('wheel-rpm').textContent='';
      $('wheel-reading').hidden=true;
      $('wheel-asof').hidden=true;
      $('wheel-note').textContent='No available device reading.';
    }
    $('wheel-line').classList.remove('muted');
  }
  function loading() {
    if(last)return;
    $('wheel-state').textContent='—';
    $('wheel-reading').hidden=true;
    $('wheel-asof').hidden=true;
    $('wheel-line').classList.add('muted');
  }
  return {
    reset(key) {
      if(profile!==key) {
        profile=key;last=null;
        $('wheel-rpm').textContent='';
        $('strip-block').hidden=true;
        loading();
      }
      $('wheel-line').hidden=!wheelEnabled(key);
      $('strip-status').hidden=!wheelEnabled(key);
    },
    loading,
    network(net) {
      const height=net?.core?.blockHeight,progress=net?.core?.blockProgress;
      const hasProgress=known(progress)&&BigInt(progress)<=1000000000n;
      $('strip-block').hidden=!known(height);
      $('strip-height').textContent=known(height)?BigInt(height).toLocaleString('en-US'):'';
      $('strip-next').hidden=!hasProgress;
      $('strip-percent').textContent=hasProgress?`${(Number(progress)/10000000).toFixed(1)}%`:'';
    },
    reading(data,{stale=false}={}) {
      const view=telemetryView(data,now());
      if(view.state==='Unknown'){if(last)offline();else loading();return false;}
      last={state:view.state,rpm:view.rpm,at:Date.parse(data.measurement.receivedAt)};
      for(const[id,value]of [['wheel-state',view.state],['wheel-rpm',view.rpm],['wheel-speed',view.speed],['wheel-distance',view.distance],['wheel-note',view.note]])$(id).textContent=value;
      $('wheel-reading').hidden=false;
      $('wheel-asof').hidden=true;
      $('wheel-line').classList.remove('muted');
      if(stale||view.state==='Stale')offline();
      return true;
    },
    invalidate(){if(last)offline();else loading();},
    offline,
  };
}
