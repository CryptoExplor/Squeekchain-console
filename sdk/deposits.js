import { getAddress, encodeEventTopics, decodeEventLog, pad, toHex } from 'viem';
import { throwIfAborted } from './cancellation.js';
import { RpcAvailabilityError, isLogRangeError } from './rpc-errors.js';
import { stakingAbi, nftAbi } from './abi-core-20261103.js';
// Indexed owner events, incremental/reorg-aware like wallet discovery. No API custody trust.
export async function depositedIds({ client, snapshot, profile, owner, store, signal }) {
  owner = getAddress(owner.toLowerCase());
  // Published profile ABIs first; the dated v9 set is the legacy fallback.
  const stakingAbi = profile.abis?.staking ?? stakingAbi, nftAbi = profile.abis?.nft ?? nftAbi;
  const { staking, nft } = profile.addresses, at = snapshot.blockNumber;
  const key = `${profile.identities.release}:deposits:${staking}:${owner}`.toLowerCase();
  let ids = new Set(), cursor = profile.startBlock;
  let saved; try {saved=await store?.get(key);} catch { /* Optional cache */ }
  if (saved?.version === 1 && /^\d+$/.test(saved.block) && Array.isArray(saved.ids) && saved.ids.length<=100000 && /^0x[\da-f]{64}$/i.test(saved.hash??'') && saved.ids.every(id => /^\d+$/.test(id)&&BigInt(id)>0n)) {
    const block = BigInt(saved.block);
    if (block >= cursor && block <= at && (block===at?snapshot.blockHash:(await client.getBlock({ blockNumber: block })).hash).toLowerCase() === saved.hash?.toLowerCase()) {
      cursor = block + 1n; ids = new Set(saved.ids);
    }
  }
  async function confirm(candidates) {
    const unique=[...new Set(candidates.map(String))];
    if(unique.length>100000||unique.some(id=>!/^\d+$/.test(id)||BigInt(id)<=0n||BigInt(id)>=2n**256n))throw new Error('Invalid deposit candidates');
    const values=unique.length?await client.multicall({contracts:unique.flatMap(id=>[
      {address:staking,abi:stakingAbi,functionName:'depositor',args:[nft,BigInt(id)]},
      {address:nft,abi:nftAbi,functionName:'ownerOf',args:[BigInt(id)]},
    ]),allowFailure:false,blockNumber:at}):[];
    const result=[];
    for(const [i,id] of unique.entries()) {
      const [depositor,holder]=values.slice(i*2,i*2+2);
      if(depositor.toLowerCase()===owner.toLowerCase()) {
        if(holder.toLowerCase()!==staking.toLowerCase())throw new RpcAvailabilityError(new Error('Deposited custody mismatch'));
        result.push(BigInt(id));
      }
    }
    return result.sort((a,b)=>a<b?-1:a>b?1:0);
  }
  // A confirmed API subset proves custody, not completeness. No onchain NFT
  // count exists here, so only canonical indexed history establishes the full
  // deposit set. Never return a hint subset or seed a log cursor from it.
  let size = 45000n;
  while (cursor <= at) {
    throwIfAborted(signal);
    const end = cursor + size - 1n > at ? at : cursor + size - 1n;
    let logs;
    try {
      const topics=['Deposited','Withdrawn','DepositedMerge'].map(eventName=>encodeEventTopics({abi:stakingAbi,eventName})[0]);
      const raw=await client.request({method:'eth_getLogs',params:[{address:staking,fromBlock:toHex(cursor),toBlock:toHex(end),topics:[topics,pad(owner),pad(nft)]}]});
      logs=raw.map(log=>({...log,blockNumber:log.blockNumber==null?null:BigInt(log.blockNumber),logIndex:log.logIndex==null?null:Number(BigInt(log.logIndex)),...decodeEventLog({abi:stakingAbi,topics:log.topics,data:log.data,strict:true})}));
    } catch (error) { if (end>cursor && isLogRangeError(error)) { size=(end-cursor+1n)/2n; continue; } throw error; }
    logs.sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex);
    for (const log of logs) {
      if (log.address?.toLowerCase()!==staking.toLowerCase() || log.removed || log.blockNumber == null || log.logIndex == null || log.blockNumber < cursor || log.blockNumber > end || log.args.account?.toLowerCase() !== owner.toLowerCase()) throw new RpcAvailabilityError(new Error('Non-canonical deposit history'));
      if (log.args.collection.toLowerCase() !== nft.toLowerCase()) continue;
      if (log.eventName === 'Deposited') ids.add(String(log.args.tokenId));
      else ids.delete(String(log.eventName === 'DepositedMerge' ? log.args.donor : log.args.tokenId));
    }
    cursor = end + 1n;
  }
  const result=await confirm([...ids]);
  throwIfAborted(signal);
  try { await store?.set(key, { version: 1, block: String(at), hash: snapshot.blockHash, ids: result.map(String) }); } catch { /* Optional cache */ }
  return result.sort((a, b) => a < b ? -1 : 1);
}
