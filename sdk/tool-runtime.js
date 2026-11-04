import { rpcToolError } from './rpc-errors.js';
import { profileInput } from './profile-input.js';
import { PROFILES, DEFAULT_PROFILE, getProfile } from './deployments.js';
export function toolProfile(key=DEFAULT_PROFILE) {
  const profile=getProfile(profileInput(key,{fallback:null}));
  if(!profile.addresses)throw new Error('Mainnet is not deployed');return profile;
}
const owner = args => { const value=args.owner??args.from;if(!/^0x[0-9a-f]{40}$/i.test(value??''))throw new Error('A 0x owner/from address is required');return value; };
export const STAKING_ACTIONS = { deposit:'deposit',withdraw:'withdraw',merge_deposited:'mergeDeposited',approve_nft:'approveNft',approve_all:'approveAll',approve_sqk:'approveSqk',claim_and_stake:'claimAndStake',stake:'stake',unstake:'unstake' };
// Shared by the browser and local stdio transport. There is intentionally no send/sign handler.
export async function runReadTool(adapter,name,args={}) {
  if(name==='squeek_network_status')return adapter.networkStatus();
  if(name==='squeek_verify')return adapter.verify();
  if(name==='squeek_art')return adapter.art(args.tokenId);
  if(name==='squeek_wallet_status')return adapter.walletStatus(owner(args));
  if(name==='squeek_merge_plan')return adapter.mergePlan(owner(args));
  if(['squeek_checkpoint_preview','squeek_prepare_checkpoint'].includes(name))return adapter.checkpointPreview(owner(args));
  if(['squeek_claim_preview','squeek_prepare_claim'].includes(name))return adapter.claimPreview(owner(args),args.tokenIds);
  if(['squeek_merge_preview','squeek_prepare_merge'].includes(name))return adapter.mergePreview(owner(args),args.survivor,args.donor,{confirm:args.confirm});
  const action = Object.entries(STAKING_ACTIONS).find(([key])=>name===`squeek_${key}_preview`||name===`squeek_prepare_${key}`)?.[1];
  if(!action)throw new Error('Unknown read/prepare tool');
  if(!adapter.actionPreview)return {ok:false,reason:'This deployment does not expose the requested staking contract action'};
  return adapter.actionPreview(owner(args),action,args);
}

// Keep diagnostics attached to the adapter that actually served this call.
export async function readToolResult(adapter,name,args={}) {
  try {return await runReadTool(adapter,name,args);}
  catch(error){return rpcToolError(error,adapter.rpcDiagnostics?.()??[]);}
}
