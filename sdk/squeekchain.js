import { ACTION_REASONS, blocked } from './capabilities.js';
import { throwIfAborted } from "./cancellation.js";
/**
 * squeekchain SDK — one isomorphic core for the CLI, the browser dApp and the MCP server.
 *
 * Design rules (from docs.squeekchain.com safety rules):
 *  - never hold keys: everything here either reads or *builds an unsigned transaction*
 *  - verify the deployment graph before acting
 *  - simulate before proposing a signature
 *  - read ownership live, right before preparing an owner action
 *  - treat a merge as irreversible
 *
 * Every method returns JSON-serializable data (bigints become decimal strings),
 * so the same call works in a browser, over MCP, or in a Node script.
 */
import { encodeFunctionData, getAddress, formatEther } from "viem";
import { sepolia } from "viem/chains";
import { coreAbi, miningAbi, nftAbi, tokenAbi } from "./abi.js";

export { sepolia };
export const abis = { core: coreAbi, mining: miningAbi, nft: nftAbi, token: tokenAbi };

export const CHAIN = {
  id: 11155111,
  name: "Sepolia",
  hexId: "0xaa36a7",
  // Public endpoints, tried in order and failing over on 429s/outages.
  rpcUrls: PUBLIC_RPCS,
};

export { DEPLOYMENT } from "./record.js";
import { DEPLOYMENT } from "./record.js";
import { createRpcContext, PUBLIC_RPCS } from "./rpc.js";
import { discoverOwnedIds } from "./discovery.js";
import { createSessionVerifier } from "./verify.js";
import { parseSqueekMetadata } from "./metadata.js";
export const COLLECTION = 0;
const ZERO = "0x0000000000000000000000000000000000000000";

// ── formatting helpers (shared by web + MCP output) ───────────────────────────
const DECIMALS = 18n;
export function toSqk(baseUnits) {
  const v = BigInt(baseUnits);
  const whole = v / 10n ** DECIMALS;
  const frac = (v % 10n ** DECIMALS).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
export function sqkAmount(baseUnits) {
  return { base: String(baseUnits), sqk: toSqk(baseUnits) };
}
const jsonify = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : typeof v === "string" ? v : v)),
  );

export class SqueekchainError extends Error {
  constructor(message, { code, revert, cause } = {}) {
    super(message);
    this.name = "SqueekchainError";
    this.code = code; // "revert" | "verification" | "network" | "input"
    this.revert = revert; // { name, args }
    this.cause = cause;
  }
}

function decodeRevert(err) {
  const data = err?.cause?.data ?? err?.data ?? err?.cause?.cause?.data;
  return data?.errorName ? { name: data.errorName, args: (data.args ?? []).map(String) } : null;
}

function wrap(err, fallback) {
  const revert = decodeRevert(err);
  if (revert) {
    return new SqueekchainError(`reverted: ${revert.name}(${revert.args.join(", ")})`, { code: "revert", revert, cause: err });
  }
  return new SqueekchainError(err?.shortMessage || err?.message || fallback, { code: "network", cause: err });
}

/** Public methods are serialized, verified and pinned to one cross-checked snapshot. */
export function createSqueekchain({ rpcUrl, addresses = {}, cache = null, provider, rpcContext, signal, verificationCache, chainCache, discoveryCache, ...options } = {}) {
  if (options.skipVerification) throw new Error("Verification cannot be disabled");
  const addr = Object.fromEntries(["core", "mining", "token", "nft"].map(name => {
    if (addresses[name] && addresses[name].toLowerCase() !== DEPLOYMENT[name].toLowerCase()) throw new Error("Only the published deployment record is supported");
    return [name, getAddress(DEPLOYMENT[name])];
  }));
  const context = rpcContext ?? createRpcContext({ rpcUrl, provider, signal, chainCache });
  const client = context.client;
  const verifier = createSessionVerifier(verificationCache);
  let activeSnapshot = null, verification = null, queue = Promise.resolve();
  const read = (contract, abi, functionName, args = []) => client.readContract({ address: addr[contract], abi, functionName, args, blockNumber: activeSnapshot.blockNumber });
  function run(operation) {
    const task = queue.then(async () => {
      throwIfAborted(signal);
      activeSnapshot = await context.snapshot();
      try {
        const prepared = await verifier.prepare(client, activeSnapshot);
        verification = prepared.value;
        throwIfAborted(signal);
        const result = await operation();
        throwIfAborted(signal);
        await context.check(activeSnapshot);
        throwIfAborted(signal);
        prepared.commit();
        return result && !Array.isArray(result) ? { ...result, verification, snapshot: { blockNumber: String(activeSnapshot.blockNumber), blockHash: activeSnapshot.blockHash, peers:activeSnapshot.peers?.map(peer=>({label:peer.name,state:'agreed'}))??[] } } : result;
      } catch (error) { throw wrap(error, "Snapshot unavailable"); }
      finally { activeSnapshot = null; verification = null; }
    });
    queue = task.catch(() => {});
    return task;
  }

  // Owner-filtered incremental logs, with untrusted official-account ID hints on log outages.
  // Every final set (cache/logs/API) is confirmed onchain at this snapshot.
  const discoverTokenIds = owner => discoverOwnedIds({ client, snapshot: activeSnapshot,
    nft: addr.nft, abi: nftAbi, owner, startBlock: DEPLOYMENT.nftStartBlock,
    namespace: DEPLOYMENT.release, store: discoveryCache, signal });

  const sortIds = (ids) => [...new Set(ids.map(String))].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // Internal reads reuse the operation's verified snapshot; no cross-snapshot caches.
  async function networkStatus() { return readNetworkStatus(); }

  async function readNetworkStatus() {
    const [miningState, coreState, accounting, cpStatus, policy, rewardPerBlock, supplyCap, config] = await client.multicall({
      allowFailure: false, blockNumber: activeSnapshot.blockNumber,
      contracts: [
        ['mining', miningAbi, 'state'], ['core', coreAbi, 'state'], ['mining', miningAbi, 'accounting'],
        ['mining', miningAbi, 'checkpointStatus'], ['mining', miningAbi, 'collectionPolicy', [COLLECTION]],
        ['mining', miningAbi, 'REWARD_PER_BLOCK'], ['mining', miningAbi, 'SUPPLY_CAP'], ['core', coreAbi, 'configuration'],
      ].map(([name, abi, functionName, args = []]) => ({ address: addr[name], abi, functionName, args })),
    });
    const [corePaused, nextRound, roundSettled] = cpStatus;
    const blockUnitsPerBlock = Number(config.blockUnitsPerBlock) || 1e9;
    const blocksTotal = Number(coreState.cumulativeBlockUnits) / blockUnitsPerBlock;
    const elapsed = Math.max(1, Math.floor(Date.now() / 1000) - Number(config.genesisTimestamp));
    const blocksPerDay = (blocksTotal / elapsed) * 86_400;
    const emission = (blocksPerDay * Number(rewardPerBlock)) / 1e18;

    return {
      chainId: CHAIN.id,
      core: {
        settledThroughRound: String(coreState.settledThroughRound),
        blockHeight: String(coreState.blockHeight),
        blockProgress: String(coreState.blockProgress),
        paused: coreState.paused,
        genesisTimestamp: String(config.genesisTimestamp),
      },
      mining: {
        processedThroughRound: String(miningState.processedThroughRound),
        lagRounds: String(BigInt(coreState.settledThroughRound) - BigInt(miningState.processedThroughRound)),
        totalWeight: String(miningState.totalWeight),
        rewardIndex: String(miningState.rewardIndex),
        minted: sqkAmount(miningState.minted),
        paid: sqkAmount(miningState.paid),
        custody: sqkAmount(accounting.miningBalance),
        supplyCap: sqkAmount(supplyCap),
        capRemaining: sqkAmount(supplyCap > miningState.minted ? supplyCap - miningState.minted : 0n),
        activationsQueued: String(miningState.weightActivationCount),
        activationsApplied: String(miningState.weightActivationCursor),
      },
      checkpoint: {
        corePaused,
        nextRound: String(nextRound),
        roundSettled,
        canCheckpoint: !corePaused && roundSettled,
        reason: corePaused ? ACTION_REASONS.paused : roundSettled ? null : ACTION_REASONS.unsettled,
      },
      policy: {
        rewardPerBlock: sqkAmount(rewardPerBlock),
        maximumLevel: Number(policy.maximumLevel),
        maxSupply: Number(policy.maxSupply),
        levels: policy.levels.map((l, i) => ({ level: i + 1, weight: String(l.weight), cooldownBlocks: String(l.cooldownBlocks) })),
      },
      emission: {
        blocksPerDay: Math.round(blocksPerDay),
        sqkPerDay: Math.round(emission),
      },
    };
  }

  async function positionsFor(tokenIds) {
    const out = [];
    const chunk = 100;
    for (let i = 0; i < tokenIds.length; i += chunk) {
      const slice = tokenIds.slice(i, i + chunk);
      const contracts = [];
      for (const tokenId of slice) {
        contracts.push({ address: addr.mining, abi: miningAbi, functionName: "position", args: [COLLECTION, tokenId] });
        contracts.push({ address: addr.nft, abi: nftAbi, functionName: "ownerOf", args: [tokenId] });
      }
      const res = await client.multicall({ contracts, allowFailure: true, blockNumber: activeSnapshot.blockNumber });
      slice.forEach((tokenId, j) => {
        const pos = res[j * 2];
        const holderRes = res[j * 2 + 1];
        if (pos.status !== "success" || holderRes.status !== "success") throw new Error(`Position unavailable for token ${tokenId}`);
        if (Number(pos.result.level) === 0) return;
        const p = pos.result;
        out.push({
          tokenId: String(tokenId),
          holder: holderRes.status === "success" ? holderRes.result : null,
          level: Number(p.level),
          activeWeight: String(p.activeWeight),
          pendingWeight: String(p.pendingWeight),
          pendingRound: String(p.pendingRound),
          nextMergeBlock: String(p.nextMergeBlock),
        });
      });
    }
    return out.sort((a, b) => (BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : 1));
  }

  async function claimableFor(tokenIds) {
    if (tokenIds.length === 0) return { total: 0n, perToken: new Map() };
    const res = await client.multicall({
      contracts: tokenIds.map((tokenId) => ({
        address: addr.mining,
        abi: miningAbi,
        functionName: "claimable",
        args: [COLLECTION, [tokenId]],
      })),
      allowFailure: true,
      blockNumber: activeSnapshot.blockNumber,
    });
    const perToken = new Map();
    let total = 0n;
    res.forEach((r, i) => {
      if (r.status !== "success") throw new Error(`Claimable unavailable for token ${tokenIds[i]}`);
      const amount = r.result;
      perToken.set(tokenIds[i], amount);
      total += amount;
    });
    return { total, perToken };
  }

  async function walletStatus(owner, options = {}) { return readWalletStatus(getAddress(owner), options); }

  async function readWalletStatus(address, { force } = {}) {
    const [ids, ethBalance, sqkBalance, net] = await Promise.all([
      discoverTokenIds(address, { force }),
      client.getBalance({ address, blockNumber: activeSnapshot.blockNumber }),
      read("token", tokenAbi, "balanceOf", [address]),
      networkStatus(),
    ]);
    const positions = await positionsFor(ids);
    const mine = positions.filter((p) => p.holder?.toLowerCase() === address.toLowerCase());
    const { total, perToken } = await claimableFor(mine.map((p) => BigInt(p.tokenId)));
    const power = mine.reduce((sum, p) => sum + BigInt(p.activeWeight), 0n);
    const totalWeight = BigInt(net.mining.totalWeight);
    const shareBps = totalWeight > 0n ? Number((power * 10_000n) / totalWeight) / 100 : 0;

    const value = {
      owner: address,
      chainId: CHAIN.id,
      ethBalance: { base: String(ethBalance), eth: formatEther(ethBalance) },
      sqkBalance: sqkAmount(sqkBalance),
      squeeks: mine.map((p) => ({
        ...p,
        claimable: sqkAmount(perToken.get(BigInt(p.tokenId)) ?? 0n),
        mergeReady:
          p.level < net.policy.maximumLevel &&
          BigInt(p.pendingRound) === 0n &&
          BigInt(p.nextMergeBlock) <= BigInt(net.core.blockHeight),
      })),
      totals: {
        count: mine.length,
        power: String(power),
        sharePercent: shareBps,
        claimable: sqkAmount(total),
        estimatedSqkPerDay: Math.round((net.emission.sqkPerDay * shareBps) / 100),
      },
    };
    return { ...value, net, mergePlan: planFromStatus(value, net) };
  }

  // ── transaction builders (unsigned) ─────────────────────────────────────────
  const tx = (to, abi, functionName, args) => ({ to, data: encodeFunctionData({ abi, functionName, args }), value: "0", chainId: CHAIN.id });

  const buildCheckpoint = () => tx(addr.mining, miningAbi, "checkpoint", []);
  const buildClaim = (tokenIds) => {
    const ids = sortIds(tokenIds.map(BigInt));
    if (ids.length === 0 || ids.length > 32) throw new SqueekchainError("claim needs 1–32 IDs", { code: "input" });
    return { tx: tx(addr.mining, miningAbi, "claim", [COLLECTION, ids]), tokenIds: ids.map(String) };
  };
  const buildMerge = (survivorId, donorId) => ({
    tx: tx(addr.mining, miningAbi, "merge", [COLLECTION, BigInt(survivorId), BigInt(donorId)]),
    survivor: String(survivorId),
    donor: String(donorId),
  });

  // ── previews: simulate first, always ────────────────────────────────────────
  async function checkpointPreview(from) {
    const [corePaused, nextRound, roundSettled] = await read("mining", miningAbi, "checkpointStatus");
    const checkpoint = { corePaused, nextRound: String(nextRound), roundSettled };
    if (corePaused || !roundSettled) return blocked(corePaused?'paused':'unsettled',{checkpoint});
    if (!from) return { ok: false, checkpoint, reason: "Supply a caller address to simulate checkpoint" };
    await client.simulateContract({ address: addr.mining, abi: miningAbi, functionName: "checkpoint", account: getAddress(from), blockNumber: activeSnapshot.blockNumber });
    const tx = buildCheckpoint();
    const gas = await client.estimateGas({ ...tx, value: 0n, account: getAddress(from), blockNumber: activeSnapshot.blockNumber });
    return { ok: true, checkpoint, tx, gas: String(gas) };
  }

  async function claimPreview(owner, tokenIds) {
    const address = getAddress(owner);
    const ids = tokenIds === undefined ? await discoverTokenIds(address, { force: true }) : sortIds(tokenIds.map(BigInt));
    if (ids.some(id => id <= 0n)) throw new Error("Token IDs must be positive");
    if (!ids.length) return { ok: false, reason: "No token IDs selected or owned", batches: [] };
    for (const id of ids) {
      const holder = await read("nft", nftAbi, "ownerOf", [id]);
      if (holder.toLowerCase() !== address.toLowerCase()) throw new Error(`Caller does not own token ${id}; no IDs were dropped`);
    }
    const batches = [];
    for (let i = 0; i < ids.length; i += 32) {
      const slice = ids.slice(i, i + 32);
      const estimate = await read("mining", miningAbi, "claimable", [COLLECTION, slice]);
      const { result } = await client.simulateContract({ address: addr.mining, abi: miningAbi, functionName: "claim", args: [COLLECTION, slice], account: address, blockNumber: activeSnapshot.blockNumber });
      const built = buildClaim(slice);
      const gas = await client.estimateGas({ ...built.tx, value: 0n, account: address, blockNumber: activeSnapshot.blockNumber });
      batches.push({ ...built, amount: sqkAmount(result), estimate: sqkAmount(estimate), gas: String(gas), error: null });
    }
    return { ok: true, batches, total: sqkAmount(batches.reduce((sum, batch) => sum + BigInt(batch.amount.base), 0n)) };
  }

  /** Greedy same-level pairing, mirroring the onchain preconditions exactly. */
  async function mergePlan(owner) {
    const address = getAddress(owner);
    const status = await walletStatus(address);
    return planFromStatus(status, status.net);
  }
  function planFromStatus(status, net) {
    const address = status.owner;
    const height = BigInt(net.core.blockHeight);
    const eligible = status.squeeks.filter(
      (s) => s.level < net.policy.maximumLevel && BigInt(s.pendingRound) === 0n && BigInt(s.nextMergeBlock) <= height,
    );
    const byLevel = new Map();
    for (const s of eligible) {
      if (!byLevel.has(s.level)) byLevel.set(s.level, []);
      byLevel.get(s.level).push(s);
    }
    const pairs = [];
    for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
      const group = byLevel.get(level).sort((a, b) => (BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : 1));
      while (group.length >= 2) {
        const survivor = group.shift();
        const donor = group.shift();
        pairs.push({
          survivor: survivor.tokenId,
          donor: donor.tokenId,
          level,
          nextLevel: level + 1,
          powerBefore: BigInt(survivor.activeWeight) + BigInt(donor.activeWeight),
          powerAfter: BigInt(net.policy.levels[level]?.weight ?? 0),
        });
      }
    }
    const blockedCount = status.squeeks.length - eligible.length;
    return {
      owner: address,
      height: String(height),
      pairs: pairs.map((p) => ({
        ...p,
        powerBefore: String(p.powerBefore),
        powerAfter: String(p.powerAfter),
        powerGainPercent:
          p.powerBefore > 0n ? Math.round((Number(p.powerAfter - p.powerBefore) / Number(p.powerBefore)) * 10_000) / 100 : null,
      })),
      blocked: blockedCount,
      note: pairs.length
        ? "each merge permanently burns the donor NFT; the survivor keeps both positions' credit"
        : "no mergeable pair right now (needs two same-level Squeeks off cooldown with no pending power)",
    };
  }

  async function mergePreview(owner, survivorId, donorId, { confirm } = {}) {
    requireBurn(donorId, confirm);
    const address = getAddress(owner);
    const ids = [BigInt(survivorId), BigInt(donorId)];
    if (ids[0] === ids[1] || ids.some(id => id <= 0n)) throw new Error("Choose two distinct positive token IDs");
    const [positions, policy, core] = await Promise.all([positionsFor(ids), read("mining", miningAbi, "collectionPolicy", [0]), read("core", coreAbi, "state")]);
    if (positions.length !== 2 || positions.some(p => p.holder.toLowerCase() !== address.toLowerCase())) throw new Error("Caller must own both live tokens");
    if (positions[0].level !== positions[1].level) throw new Error("Tokens have different levels");
    if (positions.some(p => p.level >= Number(policy.maximumLevel))) throw new Error("Maximum level reached");
    if (positions.some(p => BigInt(p.pendingRound) !== 0n)) throw new Error("Pending activation");
    if (positions.some(p => BigInt(p.nextMergeBlock) > BigInt(core.blockHeight))) throw new Error("Merge cooldown active (completed Squeek blocks)");
    await client.simulateContract({ address: addr.mining, abi: miningAbi, functionName: "merge", args: [0, ...ids], account: address, blockNumber: activeSnapshot.blockNumber });
    const built = buildMerge(survivorId, donorId);
    const gas = await client.estimateGas({ ...built.tx, value: 0n, account: address, blockNumber: activeSnapshot.blockNumber });
    return { ok: true, ...built, nextLevel: positions[0].level + 1, gas: String(gas), warning: `Squeek #${donorId} is burned forever; #${survivorId} survives` };
  }

  async function art(tokenId) {
    const uri = await read("nft", nftAbi, "tokenURI", [BigInt(tokenId)]);
    return { tokenId: String(tokenId), ...parseSqueekMetadata(uri), artworkIntegrity: "Unknown: immutable renderer/page runtime hashes are not published in the deployment record" };
  }

  return {
    addresses: addr, rpcUrl, client, invalidateChain: context.invalidateChain,
    verify: () => run(async () => verification),
    assertVerified: () => run(async () => verification),
    rpcDiagnostics: () => context.rpcDiagnostics?.() ?? [],
    networkStatus: () => run(networkStatus),
    walletStatus: owner => run(() => walletStatus(owner)),
    discoverTokenIds: owner => run(() => discoverTokenIds(owner)),
    positionsFor: ids => run(() => positionsFor(ids.map(BigInt))),
    checkpointPreview: from => run(() => checkpointPreview(from)),
    claimPreview: (owner, ids) => run(() => claimPreview(owner, ids)),
    mergePlan: owner => run(() => mergePlan(owner)),
    mergePreview: (owner, survivor, donor, options = {}) => {
      requireBurn(donor, options.confirm);
      return run(() => mergePreview(owner, survivor, donor, options));
    },
    art: id => run(() => art(id)),
    artBatch: ids => run(async () => {
      const tokenIds = ids.slice(0, 24).map(BigInt);
      const results = await client.multicall({ contracts: tokenIds.map(id => ({ address: addr.nft, abi: nftAbi, functionName: 'tokenURI', args: [id] })), allowFailure: true, blockNumber: activeSnapshot.blockNumber });
      return results.map((result, i) => {
        try {
          if (result.status !== 'success') throw new Error('tokenURI unavailable');
          return { tokenId: String(tokenIds[i]), ...parseSqueekMetadata(result.result), artworkIntegrity: 'Unknown: immutable renderer/page runtime hashes are not published' };
        } catch (error) { return { tokenId: String(tokenIds[i]), error: error.message }; }
      });
    }),
  };
}

export function requireBurn(donor, confirm) {
  if (!/^\d+$/.test(String(donor)) || BigInt(donor) <= 0n || confirm !== `BURN-${BigInt(donor)}`) throw new Error(`Explicit confirmation required: BURN-${donor}`);
}
