import { unstakeQuoteError } from './fee-error.js';
import { ACTION_REASONS, blocked } from './capabilities.js';
/** Equal-profile v9 adapter. Expected identities are dated pins, never API authority. */
import { getAddress, formatEther, encodeFunctionData, multicall3Abi } from 'viem';
import { core9Abi, issuance9Abi, nft9Abi, staking9Abi, token9Abi } from './abi-v9.js';
import { sepolia } from 'viem/chains';
import { getProfile } from './deployments.js';
import { sqkAmount, requireBurn } from './squeekchain.js';
import { discoverOwnedIds, createDiscoveryStore } from './discovery.js';
import { depositedIds } from './deposits.js';
import { createRpcContext } from './rpc.js';
import { RpcAvailabilityError } from './rpc-errors.js';
import { createV9Verifier } from './verify-v9.js';
import { throwIfAborted } from './cancellation.js';
import { parseSqueekMetadata } from './metadata.js';
export { parseSqueekMetadata } from './metadata.js';
const same = (a,b) => String(a).toLowerCase() === String(b).toLowerCase();
const positive = value => { if (!/^\d+$/.test(String(value)) || BigInt(value) <= 0n || BigInt(value) >= 2n ** 256n) throw new Error('Positive uint256 required'); return BigInt(value); };
const idsInput = values => { if (!Array.isArray(values) || !values.length || values.length > 1000) throw new Error('Supply token IDs'); const ids = values.map(positive); if (new Set(ids.map(String)).size !== ids.length) throw new Error('Duplicate token IDs'); return ids.sort((a,b)=>a<b?-1:1); };
export function createSqueek9({ profileKey = 'sepolia-v9', rpcUrl, provider, rpcContext, signal, chainCache, discoveryCache = createDiscoveryStore(), verificationCache } = {}) {
  const profile = getProfile(profileKey);
  if (profile.abiSet !== 'v9' || !profile.addresses) throw new Error('v9 profile required');
  const addr = Object.fromEntries(Object.entries(profile.addresses).map(([k,v])=>[k,getAddress(v.toLowerCase())]));
  const context = rpcContext ?? createRpcContext({ rpcUrl, provider, signal, chainCache });
  const client = context.client, verifier = createV9Verifier(verificationCache, profile);
  let activeSnapshot, verification, queue = Promise.resolve();
  const read = (contract, abi, functionName, args = []) => client.readContract({ address: addr[contract], abi, functionName, args, blockNumber: activeSnapshot.blockNumber });
  function run(operation) {
    const task = queue.then(async () => {
      throwIfAborted(signal); activeSnapshot = await context.snapshot();
      try {
        const prepared = await verifier.prepare(client, activeSnapshot, context.readIdentity); verification = prepared.value;
        throwIfAborted(signal); const result = await operation(); throwIfAborted(signal);
        await context.check(activeSnapshot); throwIfAborted(signal); prepared.commit();
        return result && !Array.isArray(result) ? { ...result, verification, snapshot: { blockNumber: String(activeSnapshot.blockNumber), blockHash: activeSnapshot.blockHash, timestamp: activeSnapshot.timestamp == null ? null : String(activeSnapshot.timestamp), peers:activeSnapshot.peers?.map(peer=>({label:peer.name,state:'agreed'}))??[] } } : result;
      } finally { activeSnapshot = verification = null; }
    }); queue = task.catch(()=>{}); return task;
  }
  async function networkStatus({ force = false } = {}) {

    const [coreState, issuanceState, curve, cpStatus, tokenSupply, tokenCap, nftSupply, maxLevel, mergesOpen, config] = await Promise.all([
      read("core", core9Abi, "state"),
      read("issuance", issuance9Abi, "state"),
      read("issuance", issuance9Abi, "curve"),
      read("issuance", issuance9Abi, "checkpointStatus"),
      read("token", token9Abi, "totalSupply"),
      read("token", token9Abi, "cap"),
      read("nft", nft9Abi, "totalSupply"),
      read("nft", nft9Abi, "MAXIMUM_LEVEL"),
      read("nft", nft9Abi, "mergesOpen"),
      read("core", core9Abi, "configuration"),
    ]);
    const [corePaused, nextRound, roundSettled] = cpStatus;
    const levels=await client.multicall({contracts:Array.from({length:Number(maxLevel)},(_,i)=>i+1).flatMap(level=>[
      {address:addr.nft,abi:nft9Abi,functionName:'cooldownBlocks',args:[level]},
      {address:addr.staking,abi:staking9Abi,functionName:'basePower',args:[addr.nft,level]},
    ]),allowFailure:false,blockNumber:activeSnapshot.blockNumber});

    const value = {
      profile: profile.key,
      chainId: profile.chainId,
      kind: profile.kind,
      core: {
        settledThroughRound: String(coreState.settledThroughRound),
        blockHeight: String(coreState.blockHeight),
        blockProgress: String(coreState.blockProgress),
        workPerThousandBlocks: String(coreState.workPerThousandBlocks),
        paused: coreState.paused,
        genesisTimestamp: String(config.genesisTimestamp),
        roundDuration: String(config.roundDuration),
      },
      mining: {
        issued: sqkAmount(issuanceState.minted),
        gachaFunded: sqkAmount(issuanceState.gachaFunded),
        stakingFunded: sqkAmount(issuanceState.stakingFunded),
        processedThroughRound: String(issuanceState.processedThroughRound),
        fundedBlocks: String(issuanceState.fundedBlocks),
        lagRounds: String(BigInt(coreState.settledThroughRound) - BigInt(issuanceState.processedThroughRound)),
        totalWeight: String(curve.targetPower), // v9 splits by a curve, not a weight index
        supplyCap: sqkAmount(tokenCap),
        minted: sqkAmount(tokenSupply),
        capRemaining: sqkAmount(tokenCap > tokenSupply ? tokenCap - tokenSupply : 0n),
      },
      supply: { total: sqkAmount(tokenSupply), issued: sqkAmount(issuanceState.minted), staked: null },
      checkpoint: {
        corePaused,
        nextRound: String(nextRound),
        roundSettled,
        canCheckpoint: !corePaused && roundSettled,
        reason: corePaused ? ACTION_REASONS.paused : roundSettled ? null : ACTION_REASONS.unsettled,
        contract: "issuance v9 (SqueekMining proxy)",
      },
      policy: {
        maximumLevel: Number(maxLevel),
        mergesOpen,
        targetPower: String(curve.targetPower),
        floorBps: Number(curve.floorBps),
        levels: Array.from({length:Number(maxLevel)},(_,i)=>({level:i+1,cooldownBlocks:String(levels[i*2]),basePower:String(levels[i*2+1])})),
      },
      nft: { totalSupply: String(nftSupply) },
      emission: null, // v9 issues through a schedule; no fixed reward-per-block

    };
    return value;
  }


  const idsOwned = owner => discoverOwnedIds({ client, snapshot: activeSnapshot, nft: addr.nft, abi: nft9Abi, owner, startBlock: profile.startBlock, namespace: profile.identities.release+':chain-only', store: discoveryCache, signal, accountSource:null });
  async function walletStatus(owner) {
    owner = getAddress(owner.toLowerCase());
    const powerRead=read('staking',staking9Abi,'accountPower',[owner]);
    const stakedRead=powerRead.then(([nftPower])=>nftPower===0n?[]:depositedIds({client,snapshot:activeSnapshot,profile,owner,store:discoveryCache,signal}));
    const [walletIds, stakedIds, net, claimable, power, balance, eth, principal] = await Promise.all([
      idsOwned(owner), stakedRead, networkStatus(),
      read('staking',staking9Abi,'claimable',[owner]), powerRead,
      read('token',token9Abi,'balanceOf',[owner]), client.readContract({address:sepolia.contracts.multicall3.address,abi:multicall3Abi,functionName:'getEthBalance',args:[owner],blockNumber:activeSnapshot.blockNumber}), read('staking',staking9Abi,'stakeOf',[owner]),
    ]);
    if(power[0]>0n&&!stakedIds.length)throw new RpcAvailabilityError(new Error('Staked discovery unavailable: positive NFT power with no confirmed deposits'));
    const tokens=[...walletIds.map(id=>({id,deposited:false})),...stakedIds.map(id=>({id,deposited:true}))];
    const contracts=tokens.flatMap(({id})=>['level','nextMergeHeight'].map(functionName=>({address:addr.nft,abi:nft9Abi,functionName,args:[id]})));
    const values=contracts.length?await client.multicall({contracts,allowFailure:false,blockNumber:activeSnapshot.blockNumber}):[];
    const positions=tokens.map(({id,deposited},i)=>({tokenId:String(id),holder:deposited?addr.staking:owner,deposited,custody:deposited?'Staked':'Wallet',level:Number(values[i*2]),nextMergeHeight:String(values[i*2+1]),activeWeight:null,claimable:null}));
    const value = { profile:profile.key, owner, chainId:11155111, ethBalance:{base:String(eth),eth:formatEther(eth)}, sqkBalance:sqkAmount(balance), squeeks:positions,
      totals:{count:positions.length,deposited:stakedIds.length,power:String(power[0]+power[1]),sharePercent:null,claimable:sqkAmount(claimable),estimatedSqkPerDay:null},
      staking:{principal:sqkAmount(principal[0]),fresh:sqkAmount(principal[1]),mature:BigInt(principal[1])<=BigInt(principal[0])?sqkAmount(principal[0]-principal[1]):null,power:String(power[0]),sqkPower:String(power[1])}, net };
    return { ...value, mergePlan: plan(value) };
  }
  function plan(status) {
    const pairs = [], height = BigInt(status.net.core.blockHeight), max = status.net.policy.maximumLevel;
    if (!status.net.policy.mergesOpen) return {pairs,note:ACTION_REASONS.mergesClosed};
    const groups = new Map();
    for (const token of status.squeeks) if (token.level < max && BigInt(token.nextMergeHeight) <= height) {
      const key = `${token.level}:${token.deposited}`; const group = groups.get(key) ?? []; group.push(token); groups.set(key,group);
    }
    for (const group of groups.values()) for(let i=0;i+1<group.length;i+=2) pairs.push({survivor:group[i].tokenId,donor:group[i+1].tokenId,level:group[i].level,nextLevel:group[i].level+1,deposited:group[i].deposited});
    return { pairs, note:'Same-level, same-custody pairs whose Squeek-block cooldowns have cleared. The donor burns permanently.' };
  }
  async function custody(owner, id, deposited) {
    const holder = await read('nft',nft9Abi,'ownerOf',[id]);
    if (deposited) {
      if (!same(holder,addr.staking) || !same(await read('staking',staking9Abi,'depositor',[addr.nft,id]),owner)) throw new Error(`Not the depositor of #${id}`);
    } else if(!same(holder,owner)) throw new Error(`Not the owner of #${id}`);
  }
  async function simulate(owner, contract, abi, functionName, args, details={}) {
    const simulation = await client.simulateContract({address:addr[contract],abi,functionName,args,account:owner,blockNumber:activeSnapshot.blockNumber});
    const tx={to:addr[contract],data:encodeFunctionData({abi,functionName,args}),value:'0',chainId:11155111};
    return {ok:true,action:functionName,tx,...details,simulatedResult:simulation.result == null ? null : String(simulation.result)};
  }
  async function actionPreview(owner, action, input={}) {
    owner=getAddress(owner.toLowerCase());
    const {tokenIds, tokenId, amount, confirm}=input;
    if (action==='checkpoint') {
      const [paused,nextRound,settled]=await read('issuance',issuance9Abi,'checkpointStatus');
      if(paused || !settled) return blocked(paused?'paused':'unsettled');
      return simulate(owner,'issuance',issuance9Abi,'checkpoint',[],{nextRound:String(nextRound)});
    }
    if (['merge','mergeDeposited'].includes(action)) {
      const survivor=positive(input.survivor), donor=positive(input.donor); requireBurn(donor,confirm);
      if(survivor===donor) throw new Error('Choose different token IDs');
      if(!await read('nft',nft9Abi,'mergesOpen')) return blocked('mergesClosed');
      const holders=await Promise.all([survivor,donor].map(id=>read('nft',nft9Abi,'ownerOf',[id])));
      const staked=holders.map(holder=>same(holder,addr.staking));
      if(staked[0]!==staked[1] && same(holders[staked[0]?1:0],owner)) {
        const x=staked[0]?survivor:donor,y=staked[0]?donor:survivor;
        await custody(owner,x,true);
        return {ok:false,reasonCode:'mixedCustody',reason:`#${x} is staked; withdraw it or deposit #${y} first`};
      }
      let deposited=action==='mergeDeposited';
      if(action==='merge') deposited=staked[0];
      await custody(owner,survivor,deposited); await custody(owner,donor,deposited);
      const [level, donorLevel, cooldown, donorCooldown, max, core]=await Promise.all([
        read('nft',nft9Abi,'level',[survivor]),read('nft',nft9Abi,'level',[donor]),read('nft',nft9Abi,'nextMergeHeight',[survivor]),read('nft',nft9Abi,'nextMergeHeight',[donor]),read('nft',nft9Abi,'MAXIMUM_LEVEL'),read('core',core9Abi,'state')]);
      if(level!==donorLevel || level>=max || cooldown>core.blockHeight || donorCooldown>core.blockHeight) return {ok:false,reason:'Levels differ, maximum reached, or cooldown active'};
      return simulate(owner,deposited?'staking':'nft',deposited?staking9Abi:nft9Abi,deposited?'mergeDeposited':'merge',deposited?[addr.nft,survivor,donor]:[survivor,donor],{survivor:String(survivor),donor:String(donor),nextLevel:Number(level)+1,warning:`Permanently burn #${donor}; keep #${survivor}`,deposited});
    }
    if(['deposit','withdraw'].includes(action)) {
      const ids=idsInput(tokenIds); for(const id of ids) await custody(owner,id,action==='withdraw');
      if(action==='deposit' && !await read('nft',nft9Abi,'isApprovedForAll',[owner,addr.staking])) {
        const approvals=[]; for(const id of ids) if(!same(await read('nft',nft9Abi,'getApproved',[id]),addr.staking)) approvals.push(String(id));
        if(approvals.length) return {ok:false,approvalRequired:true,tokenIds:approvals,reason:'NFT approval required as a separate step. Per-token approval allows this staking contract to transfer only that NFT; collection approval allows every NFT, including future ones. Choose explicitly, then retry deposit.'};
      }
      return simulate(owner,'staking',staking9Abi,action,[addr.nft,ids],{tokenIds:ids.map(String),collection:addr.nft});
    }
    if(['approveNft','approveAll'].includes(action)) {
      const id=action==='approveNft'?positive(tokenId):null; if(id) await custody(owner,id,false);
      return simulate(owner,'nft',nft9Abi,id?'approve':'setApprovalForAll',id?[addr.staking,id]:[addr.staking,true],{warning:id?`Allow staking to transfer NFT #${id}`:'Allow staking to transfer ALL current and future NFTs. Broad approval can be revoked in your wallet.',scope:id?'token':'collection',spender:addr.staking,...(id?{tokenId:String(id)}:{})});
    }
    if(action==='approveSqk') return simulate(owner,'token',token9Abi,'approve',[addr.staking,positive(amount)],{warning:'Allow staking to spend exactly this SQK amount',scope:'exact amount',spender:addr.staking,amount:String(positive(amount))});
    if(['claim','claimAndStake'].includes(action)) {
      const quote=await read('staking',staking9Abi,'claimable',[owner]);
      const recipient=action==='claim'?await read('staking',staking9Abi,'claimRecipient',[owner]):owner;
      const preview=await simulate(owner,'staking',staking9Abi,action,action==='claim'?[owner]:[],{amount:sqkAmount(quote),recipient,warning:action==='claimAndStake'?'Claim rewards into staked SQK; exiting may incur a fee':`Claim recipient: ${recipient}`});
      return {...preview,amount:sqkAmount(BigInt(preview.simulatedResult))};
    }
    if(action==='stake') {
      const value=positive(amount), allowance=await read('token',token9Abi,'allowance',[owner,addr.staking]);
      if(allowance<value) return {ok:false,approvalRequired:true,reason:'SQK approval required as a separate exact-amount step'};
      return simulate(owner,'staking',staking9Abi,'stake',[value],{amount:String(value)});
    }
    if(action==='unstake') {
      const value=positive(amount), [fee,net]=await read('staking',staking9Abi,'quoteUnstake',[owner,value]);
      const block=await client.getBlock({blockNumber:activeSnapshot.blockNumber});
      const deadline=input.deadline == null ? BigInt(block.timestamp)+600n : positive(input.deadline);
      if(deadline>=2n**64n)throw new Error('Invalid unstake deadline');
      if(deadline<=BigInt(block.timestamp))return {ok:false,reasonCode:'quoteExpired',reason:'Quote expired',deadline:String(deadline)};
      const quote={amount:String(value),fee:sqkAmount(fee),net:sqkAmount(net),maxFee:String(fee),deadline:String(deadline)};
      if(input.maxFee!=null && fee>BigInt(input.maxFee))return {ok:false,reasonCode:'feeRose',reason:'Fee rose',...quote};
      try {return await simulate(owner,'staking',staking9Abi,'unstake',[value,fee,deadline],{...quote,warning:'Unstake burns the quoted exit fee; net is what you receive'});}
      catch(error) {const quoteError=unstakeQuoteError(error);if(!quoteError)throw error;return {ok:false,...quoteError,...(quoteError.fee?{fee:sqkAmount(BigInt(quoteError.fee))}:{})};}
    }
    throw new Error('Unsupported v9 action');
  }
  async function claimPreview(owner) {
    const result=await actionPreview(owner,'claim');
    if(!result.ok) return result;
    const amount=sqkAmount(BigInt(result.simulatedResult));
    return {...result,total:amount,batches:[{tx:result.tx,tokenIds:[],amount}]};
  }
  async function art(tokenId) { return {tokenId:String(tokenId),...parseSqueekMetadata(await read('nft',nft9Abi,'tokenURI',[positive(tokenId)]))}; }
  return { profile,addresses:addr,client,invalidateChain:context.invalidateChain,rpcDiagnostics:()=>context.rpcDiagnostics?.()??[],
    verify:()=>run(async()=>verification),networkStatus:()=>run(networkStatus),walletStatus:owner=>run(()=>walletStatus(owner)),idsOwned:owner=>run(()=>idsOwned(owner)),
    actionPreview:(owner,action,input={})=>{ if(['merge','mergeDeposited'].includes(action))requireBurn(input.donor,input.confirm);return run(()=>actionPreview(owner,action,input)); },
    mergePreview:(owner,survivor,donor,options={})=>{requireBurn(donor,options.confirm);return run(()=>actionPreview(owner,'merge',{survivor,donor,...options}));},
    mergePlan:owner=>run(async()=>plan(await walletStatus(owner))),claimPreview:owner=>run(()=>claimPreview(owner)),checkpointPreview:owner=>run(()=>actionPreview(owner,'checkpoint')),
    squeekStatus:id=>run(async()=>{const tokenId=positive(id),[holder,level,nextMergeHeight,net]=await Promise.all([read('nft',nft9Abi,'ownerOf',[tokenId]),read('nft',nft9Abi,'level',[tokenId]),read('nft',nft9Abi,'nextMergeHeight',[tokenId]),networkStatus()]);const deposited=same(holder,addr.staking),owner=deposited?await read('staking',staking9Abi,'depositor',[addr.nft,tokenId]):holder;return {owner,net,token:{tokenId:String(tokenId),holder,level:Number(level),nextMergeHeight:String(nextMergeHeight),deposited,basePower:net.policy.levels.find(p=>p.level===Number(level))?.basePower,claimable:null}};}),
    art:id=>run(()=>art(id)),artBatch:(ids,limit=24)=>run(async()=>{
      const selected=ids.slice(0,Math.min(limit,24));if(!selected.length)return [];
      const values=await client.multicall({contracts:selected.map(id=>({address:addr.nft,abi:nft9Abi,functionName:'tokenURI',args:[positive(id)]})),allowFailure:true,blockNumber:activeSnapshot.blockNumber});
      return values.map((value,i)=>{try{if(value.status!=='success')throw new Error();return {tokenId:String(selected[i]),...parseSqueekMetadata(value.result)};}catch{return {tokenId:String(selected[i]),error:'Token URI unavailable or invalid'};}});
    }),
  };
}
