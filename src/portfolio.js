// Discovering the wallet's Squeeks and reading their mining positions.
import fs from "node:fs";
import path from "node:path";
import { getAddress } from "viem";
import { abi, publicClient, log, logWarn } from "./chain.js";
import { COLLECTION, ROOT_DIR, addresses, settings } from "./config.js";

const MINING = getAddress(addresses.mining);
const CORE = getAddress(addresses.core);
const NFT = getAddress(addresses.nft);
const CACHE_DIR = path.join(ROOT_DIR, "cache");

const cachePath = (owner) => path.join(CACHE_DIR, `owned-${owner.toLowerCase()}.json`);
const readCache = (owner) => {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath(owner), "utf8"));
    if (Date.now() / 1000 - raw.at > settings.discoveryTtl) return null;
    return raw.ids.map(BigInt);
  } catch {
    return null;
  }
};
const writeCache = (owner, ids) => {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      cachePath(owner),
      JSON.stringify({ at: Math.floor(Date.now() / 1000), owner, ids: ids.map(String) }, null, 2),
    );
  } catch {
    /* cache is best-effort */
  }
};

const sortIds = (ids) =>
  [...new Set(ids.map(String))]
    .map(BigInt)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Rebuilds ownership from ERC-721 Transfer logs, halving the range until the RPC accepts it. */
async function scanTransferLogs(owner, fromBlock, latest) {
  const zero = "0x0000000000000000000000000000000000000000";
  const owned = new Map();
  let chunk = BigInt(settings.getLogsChunk);
  let cursor = fromBlock;

  while (cursor <= latest) {
    const end = cursor + chunk - 1n > latest ? latest : cursor + chunk - 1n;
    try {
      const logs = await publicClient.getContractEvents({
        address: NFT,
        abi: abi.nft,
        eventName: "Transfer",
        fromBlock: cursor,
        toBlock: end,
      });
      for (const entry of logs) {
        const { tokenId, from, to } = entry.args;
        if (to.toLowerCase() === zero) owned.delete(tokenId);
        else owned.set(tokenId, to);
      }
      cursor = end + 1n;
    } catch (err) {
      if (chunk <= 1_000n) throw err;
      chunk /= 2n;
    }
  }

  return [...owned.entries()]
    .filter(([, holder]) => holder.toLowerCase() === owner.toLowerCase())
    .map(([tokenId]) => tokenId);
}

/**
 * Fallback when historical logs are unavailable (most free RPCs prune them):
 * walk every minted token ID and ask ownerOf via Multicall3.
 */
async function scanOwners(owner, { batchSize = 300 } = {}) {
  const totalIssued = await publicClient.readContract({
    address: NFT,
    abi: abi.nft,
    functionName: "totalIssued",
  });
  const total = Number(totalIssued);
  log(`fallback: checking ownerOf for ${total} minted tokens via multicall`);
  const found = [];
  for (let start = 1; start <= total; start += batchSize) {
    const batch = [];
    for (let id = start; id < start + batchSize && id <= total; id += 1) batch.push(BigInt(id));
    const results = await publicClient.multicall({
      contracts: batch.map((tokenId) => ({
        address: NFT,
        abi: abi.nft,
        functionName: "ownerOf",
        args: [tokenId],
      })),
      allowFailure: true,
    });
    results.forEach((r, i) => {
      if (r.status === "success" && String(r.result).toLowerCase() === owner.toLowerCase()) {
        found.push(batch[i]);
      }
    });
  }
  return found;
}

/**
 * Token IDs owned by `owner`. Resolution order:
 *   1. TOKEN_IDS from the environment/CLI, 2. on-disk cache, 3. Transfer logs, 4. ownerOf scan.
 */
export async function discoverTokenIds(owner, { force = false } = {}) {
  if (settings.tokenIds.length > 0) return sortIds(settings.tokenIds);

  const balance = await publicClient.readContract({
    address: NFT,
    abi: abi.nft,
    functionName: "balanceOf",
    args: [owner],
  });
  if (balance === 0n) {
    writeCache(owner, []);
    return [];
  }

  if (!force) {
    const cached = readCache(owner);
    if (cached) {
      log(`using cached token ids (${cached.length}) for ${owner}; refreshing every ${settings.discoveryTtl}s`);
      return cached;
    }
  }

  const latest = await publicClient.getBlockNumber();
  let ids;
  try {
    log(`scanning SqueekNFT Transfer logs ${settings.nftStartBlock}…${latest} for ${owner}`);
    ids = await scanTransferLogs(owner, settings.nftStartBlock, latest);
    if (ids.length !== Number(balance)) {
      logWarn(`log scan found ${ids.length} ids but balanceOf is ${balance} — cross-checking with ownerOf`);
      throw new Error("log scan incomplete");
    }
  } catch {
    ids = await scanOwners(owner);
  }

  ids = sortIds(ids);
  writeCache(owner, ids);
  log(`found ${ids.length} Squeek(s) for ${owner}`);
  return ids;
}

/**
 * Positions for `tokenIds`, with live ownership checks. Burned/unminted IDs (level 0) are dropped.
 * Uses Multicall3 so large holdings resolve in a handful of round trips.
 */
export async function readPositions(tokenIds, { chunkSize = 100 } = {}) {
  const results = [];
  for (let i = 0; i < tokenIds.length; i += chunkSize) {
    const slice = tokenIds.slice(i, i + chunkSize);
    const contracts = [];
    for (const tokenId of slice) {
      contracts.push({ address: MINING, abi: abi.mining, functionName: "position", args: [COLLECTION, tokenId] });
      contracts.push({ address: NFT, abi: abi.nft, functionName: "ownerOf", args: [tokenId] });
    }
    const res = await publicClient.multicall({ contracts, allowFailure: true });
    for (let j = 0; j < slice.length; j += 1) {
      const position = res[j * 2];
      const holderResult = res[j * 2 + 1];
      if (position.status !== "success") continue;
      const p = position.result;
      if (p.level === 0) continue; // burned or unminted
      results.push({
        tokenId: slice[j],
        holder: holderResult.status === "success" ? holderResult.result : null,
        level: Number(p.level),
        activeWeight: BigInt(p.activeWeight),
        pendingWeight: BigInt(p.pendingWeight),
        pendingRound: BigInt(p.pendingRound),
        nextMergeBlock: BigInt(p.nextMergeBlock),
        accruedScaled: BigInt(p.accruedScaled),
        lastIndex: BigInt(p.lastIndex),
      });
    }
  }
  return results.sort((a, b) => (a.tokenId < b.tokenId ? -1 : 1));
}

/** Splits IDs into claim batches (contract maximum is 32). */
export function batchIds(tokenIds, size = 32) {
  const batches = [];
  for (let i = 0; i < tokenIds.length; i += size) batches.push(tokenIds.slice(i, i + size));
  return batches;
}

export async function readClaimable(tokenIds) {
  const batches = batchIds(tokenIds);
  let total = 0n;
  const detail = [];
  for (const batch of batches) {
    const amount = await publicClient.readContract({
      address: MINING,
      abi: abi.mining,
      functionName: "claimable",
      args: [COLLECTION, batch],
    });
    total += amount;
    detail.push({ ids: batch, amount });
  }
  return { total, batches: detail };
}

/** Network-wide state snapshot used by `status` and the mining loop. */
export async function readProtocolState() {
  const [miningState, coreState, accounting, [corePaused, nextRound, roundSettled], policy, rewardPerBlock] =
    await Promise.all([
      publicClient.readContract({ address: MINING, abi: abi.mining, functionName: "state" }),
      publicClient.readContract({ address: CORE, abi: abi.core, functionName: "state" }),
      publicClient.readContract({ address: MINING, abi: abi.mining, functionName: "accounting" }),
      publicClient.readContract({ address: MINING, abi: abi.mining, functionName: "checkpointStatus" }),
      publicClient.readContract({
        address: MINING,
        abi: abi.mining,
        functionName: "collectionPolicy",
        args: [COLLECTION],
      }),
      publicClient.readContract({ address: MINING, abi: abi.mining, functionName: "REWARD_PER_BLOCK" }),
    ]);

  return {
    miningState,
    coreState,
    accounting,
    checkpoint: { corePaused, nextRound, roundSettled },
    policy,
    rewardPerBlock,
  };
}
