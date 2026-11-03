import { getAddress } from 'viem';
import { throwIfAborted } from './cancellation.js';
import { isLogRangeError } from './rpc-errors.js';
import { staking9Abi, nft9Abi } from './abi-v9.js';
// Indexed owner events, incremental/reorg-aware like wallet discovery. No API custody trust.
export async function depositedIds({ client, snapshot, profile, owner, store, signal }) {
  owner = getAddress(owner.toLowerCase());
  const { staking, nft } = profile.addresses, at = snapshot.blockNumber;
  const key = `${profile.identities.release}:deposits:${staking}:${owner}`.toLowerCase();
  let ids = new Set(), cursor = profile.startBlock;
  let saved; try {saved=await store?.get(key);} catch { /* Optional cache */ }
  if (saved?.version === 1 && /^\d+$/.test(saved.block) && Array.isArray(saved.ids) && saved.ids.every(id => /^\d+$/.test(id))) {
    const block = BigInt(saved.block);
    if (block >= cursor && block <= at && (block===at?snapshot.blockHash:(await client.getBlock({ blockNumber: block })).hash).toLowerCase() === saved.hash?.toLowerCase()) {
      cursor = block + 1n; ids = new Set(saved.ids);
    }
  }
  let size = 45000n;
  while (cursor <= at) {
    throwIfAborted(signal);
    const end = cursor + size - 1n > at ? at : cursor + size - 1n;
    let logs;
    try {
      logs = (await Promise.all(['Deposited', 'Withdrawn', 'DepositedMerge'].map(eventName => client.getContractEvents({ address: staking, abi: staking9Abi, eventName, args: { account: owner, collection: nft }, strict: true, fromBlock: cursor, toBlock: end })))).flat();
    } catch (error) { if (size > 1000n && isLogRangeError(error)) { size /= 2n; continue; } throw error; }
    logs.sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex);
    for (const log of logs) {
      if (log.removed || log.blockNumber == null || log.logIndex == null || log.blockNumber < cursor || log.blockNumber > end || log.args.account?.toLowerCase() !== owner.toLowerCase()) throw new Error('Unavailable: non-canonical deposit history');
      if (log.args.collection.toLowerCase() !== nft.toLowerCase()) continue;
      if (log.eventName === 'Deposited') ids.add(String(log.args.tokenId));
      else ids.delete(String(log.eventName === 'DepositedMerge' ? log.args.donor : log.args.tokenId));
    }
    cursor = end + 1n;
  }
  const result = [];
  const candidates=[...ids];
  const confirmations = candidates.length ? await client.multicall({contracts:candidates.flatMap(id=>[
      { address: staking, abi: staking9Abi, functionName: 'depositor', args: [nft, BigInt(id)] },
      { address: nft, abi: nft9Abi, functionName: 'ownerOf', args: [BigInt(id)] },
    ]), allowFailure:false,blockNumber:at}) : [];
  for (const [i,id] of candidates.entries()) {
    const [depositor,holder]=confirmations.slice(i*2,i*2+2);
    if (depositor.toLowerCase() === owner.toLowerCase()) {
      if (holder.toLowerCase() !== staking.toLowerCase()) throw new Error('Unavailable: deposited custody mismatch');
      result.push(BigInt(id));
    }
  }
  throwIfAborted(signal);
  try { await store?.set(key, { version: 1, block: String(at), hash: snapshot.blockHash, ids: result.map(String) }); } catch { /* Optional cache */ }
  return result.sort((a, b) => a < b ? -1 : 1);
}
