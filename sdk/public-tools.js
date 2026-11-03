import { DEFAULT_PROFILE } from './deployments.js';
import { createSqueekchain } from './squeekchain.js';
import { createSqueek9 } from './v9.js';
import { createDiscoveryStore } from './discovery.js';
import { runReadTool, toolProfile } from './tool-runtime.js';
const PUBLIC_READS=new Set(['squeek_network_status','squeek_verify','squeek_wallet_status','squeek_merge_plan','squeek_art']);
function publicAdapter(profile) {
  // Deliberately fresh, public-only context: no wallet/provider, custom RPC, saved
  // profile, session verifier/chain cache, or persisted discovery from the UI.
  const discoveryCache=createDiscoveryStore(null);
  return profile.abiSet==='v9'?createSqueek9({profileKey:profile.key,discoveryCache}):createSqueekchain({addresses:profile.addresses,discoveryCache});
}
export async function runPublicReadTool(name,args={}, {createAdapter=publicAdapter}={}) {
  if(!PUBLIC_READS.has(name))return {error:'Cross-origin tools allow public reads only; previews, prepares and wallet requests are forbidden'};
  if(!args||typeof args!=='object'||Array.isArray(args)||typeof args.owner!=='string'||!/^0x[0-9a-f]{40}$/i.test(args.owner))return {error:'Cross-origin public reads require an explicit 0x owner address'};
  let profile;
  try{profile=toolProfile(args.profile??DEFAULT_PROFILE);}catch{return {error:'Public-read profile is invalid or not deployed'};}
  try {
    // Never forward provider/RPC/from/session parameters, even if supplied.
    return await runReadTool(createAdapter(profile),name,{owner:args.owner,tokenId:args.tokenId});
  }catch{return {error:'Public read unavailable'};} // No session diagnostics or provider errors.
}
