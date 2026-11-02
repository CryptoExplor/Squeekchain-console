/**
 * UNVERIFIED read-only adapter for the observed (undocumented) Sepolia graph: issuance v9 + staking v2 + new SqueekNFT.
 *
 * Why a separate module: the published docs describe SqueekMining v6, where rewards, claims and merges
 * all lived in one contract. The live testnet split that into SqueekIssuanceProxy (mints SQK on
 * checkpoint), SqueekStaking (deposits, power, claims) and SqueekNFT (levels + merge). Those ABIs are not
 * published, so this adapter is built from historical observations in the official dApp bundle and the
 * public API. Observed wiring checks are not verification. All transactions are absent until official records and ABIs publish.
 */
import { getAddress, formatEther } from "viem";
import { core9Abi, issuance9Abi, nft9Abi, staking9Abi, token9Abi } from "./abi-v9.js";
import { getProfile } from "./deployments.js";
import { sqkAmount, SqueekchainError } from "./squeekchain.js";
import { createRpcContext } from "./rpc.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const jsonify = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

export { parseSqueekMetadata } from "./metadata.js";
import { parseSqueekMetadata } from "./metadata.js";

export function createSqueek9({ profileKey = "sepolia", rpcUrl, cache = null, provider, rpcContext } = {}) {
  const profile = getProfile(profileKey);
  if (!profile.addresses) throw new SqueekchainError(`${profile.label} has no deployment`, { code: "input" });
  if (profile.abiSet !== "v9") throw new Error("v9 adapter requires the read-only observed profile");
  const addr = Object.fromEntries(Object.entries(profile.addresses).map(([k, v]) => [k, getAddress(v)]));

  const context = rpcContext ?? createRpcContext({ rpcUrl, provider });
  const client = context.client;
  let activeSnapshot, queue = Promise.resolve();
  const read = (contract, abi, functionName, args = []) => client.readContract({ address: addr[contract], abi, functionName, args, blockNumber: activeSnapshot.blockNumber });
  function run(operation) {
    const task = queue.then(async () => {
      activeSnapshot = await context.snapshot();
      try {
        const observation = await verify();
        if (observation.problems.length) throw new Error(`Observed graph mismatch: ${observation.problems.join("; ")}`);
        const result = await operation();
        await context.check(activeSnapshot);
        return result && !Array.isArray(result) ? { ...result, verification: observation, snapshot: { blockNumber: String(activeSnapshot.blockNumber), blockHash: activeSnapshot.blockHash } } : result;
      } finally { activeSnapshot = null; }
    });
    queue = task.catch(() => {});
    return task;
  }

  // ── verification ────────────────────────────────────────────────────────────
  async function verify() {
    const problems = [];
    const [issuedVersion, stakingVersion] = await Promise.all([
      read("issuance", issuance9Abi, "implementationCodeVersion"),
      read("staking", staking9Abi, "implementationCodeVersion"),
    ]);
    if (Number(issuedVersion) !== profile.identities.implementationVersions.issuance) {
      problems.push(`issuance version ${issuedVersion} != ${profile.identities.implementationVersions.issuance}`);
    }
    if (Number(stakingVersion) !== profile.identities.implementationVersions.staking) {
      problems.push(`staking version ${stakingVersion} != ${profile.identities.implementationVersions.staking}`);
    }

    const [issuanceCore, tokenMining, stakingCore, stakingToken, nftLaunch] = await Promise.all([
      read("issuance", issuance9Abi, "core"),
      read("token", token9Abi, "mining"),
      read("staking", staking9Abi, "core"),
      read("staking", staking9Abi, "token"),
      read("nft", nft9Abi, "launch"),
    ]);
    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    if (!same(issuanceCore, addr.core)) problems.push("issuance.core() != core");
    if (!same(tokenMining, addr.issuance)) problems.push("token.mining() != issuance");
    if (!same(stakingCore, addr.core)) problems.push("staking.core() != core");
    if (!same(stakingToken, addr.token)) problems.push("staking.token() != token");
    if (!same(nftLaunch, addr.launch)) problems.push("nft.launch() != launch");

    return {
      ok: false,
      status: "read-only (unverified)",
      problems,
      trusted: false, // addresses came from the official dApp bundle + public API, not a published record
      release: profile.identities.release,
      detail: jsonify({
        versions: { issuance: Number(issuedVersion), staking: Number(stakingVersion) },
        wiring: { issuanceCore, tokenMining, stakingCore, stakingToken, nftLaunch },
        addresses: addr,
      }),
    };
  }

  // ── reads ───────────────────────────────────────────────────────────────────
  async function networkStatus({ force = false } = {}) {

    const [coreState, issuanceState, curve, cpStatus, tokenSupply, tokenCap, nftSupply, maxLevel, mergesOpen] = await Promise.all([
      read("core", core9Abi, "state"),
      read("issuance", issuance9Abi, "state"),
      read("issuance", issuance9Abi, "curve"),
      read("issuance", issuance9Abi, "checkpointStatus"),
      read("token", token9Abi, "totalSupply"),
      read("token", token9Abi, "cap"),
      read("nft", nft9Abi, "totalSupply"),
      read("nft", nft9Abi, "MAXIMUM_LEVEL"),
      read("nft", nft9Abi, "mergesOpen"),
    ]);
    const [corePaused, nextRound, roundSettled] = cpStatus;

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
      checkpoint: {
        corePaused,
        nextRound: String(nextRound),
        roundSettled,
        canCheckpoint: !corePaused && roundSettled,
        reason: corePaused ? "SqueekCore is paused" : roundSettled ? null : "no newly certified round yet",
        contract: "issuance v9 (SqueekMining proxy)",
      },
      policy: {
        maximumLevel: Number(maxLevel),
        mergesOpen,
        targetPower: String(curve.targetPower),
        floorBps: Number(curve.floorBps),
        levels: [], // v9 cooldowns are height thresholds, not per-level durations
      },
      nft: { totalSupply: String(nftSupply) },
      emission: null, // v9 issues through a schedule; no fixed reward-per-block
      experimental: true,
    };
    return value;
  }

  async function idsOwned(owner, { force = false } = {}) {
    const key = `squeek9:ids:${owner.toLowerCase()}`;
    if (!force && cache?.get) {
      try {
        const hit = JSON.parse(cache.get(key) ?? "null");
        if (hit && hit.blockHash === activeSnapshot.blockHash) return hit.ids.map(BigInt);
      } catch {
        /* ignore */
      }
    }
    const balance = Number(await read("nft", nft9Abi, "balanceOf", [getAddress(owner)]));
    if (balance === 0) {
      cache?.set?.(key, JSON.stringify({ blockHash: activeSnapshot.blockHash, ids: [] }));
      return [];
    }
    const latest = activeSnapshot.blockNumber;
    const owned = new Map();
    let chunk = 45_000n;
    let cursor = profile.startBlock;
    while (cursor <= latest) {
      const end = cursor + chunk - 1n > latest ? latest : cursor + chunk - 1n;
      try {
        const logs = await client.getContractEvents({ address: addr.nft, abi: nft9Abi, eventName: "Transfer", fromBlock: cursor, toBlock: end });
        for (const l of logs) {
          if (String(l.args.to).toLowerCase() === ZERO) owned.delete(l.args.tokenId);
          else owned.set(l.args.tokenId, l.args.to);
        }
        cursor = end + 1n;
      } catch (err) {
        if (chunk <= 1_000n) {
          throw new Error(`Token discovery unavailable: ${err.message}`);
        }
        chunk /= 2n;
      }
    }
    const ids = [...owned.entries()].filter(([, h]) => String(h).toLowerCase() === owner.toLowerCase()).map(([id]) => id).sort((a, b) => (a < b ? -1 : 1));
    if (ids.length !== balance) throw new Error("Incomplete token discovery; holdings unavailable");
    cache?.set?.(key, JSON.stringify({ blockHash: activeSnapshot.blockHash, ids: ids.map(String) }));
    return ids;
  }

  async function walletStatus(owner, { force = false } = {}) {
    const address = getAddress(owner);
    const ids = await idsOwned(address, { force });
    const [net, claimable, power, sqkBalance, ethBalance, maxLevel] = await Promise.all([
      networkStatus(),
      read("staking", staking9Abi, "claimable", [address]),
      read("staking", staking9Abi, "accountPower", [address]),
      read("token", token9Abi, "balanceOf", [address]),
      client.getBalance({ address, blockNumber: activeSnapshot.blockNumber }),
      read("nft", nft9Abi, "MAXIMUM_LEVEL"),
    ]);

    const positions = [];
    const CHUNK = 100;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const contracts = [];
      for (const tokenId of slice) {
        contracts.push({ address: addr.nft, abi: nft9Abi, functionName: "level", args: [tokenId] });
        contracts.push({ address: addr.nft, abi: nft9Abi, functionName: "nextMergeHeight", args: [tokenId] });
        contracts.push({ address: addr.staking, abi: staking9Abi, functionName: "depositor", args: [address, tokenId] });
      }
      const res = await client.multicall({ contracts, allowFailure: true, blockNumber: activeSnapshot.blockNumber });
      slice.forEach((tokenId, j) => {
        const level = res[j * 3];
        if (level.status !== "success") throw new Error(`Level unavailable for ${tokenId}`);
        const nextMerge = res[j * 3 + 1];
        const depositor = res[j * 3 + 2];
        const lvl = Number(level.result);
        if (lvl === 0) return;
        positions.push({
          tokenId: String(tokenId),
          level: lvl,
          nextMergeHeight: nextMerge.status === "success" ? String(nextMerge.result) : null,
          deposited: depositor.status === "success" ? String(depositor.result).toLowerCase() === address.toLowerCase() : null,
          activeWeight: null, // v9 power is account-level, not per token
          claimable: null,
        });
      });
    }

    const value = {
      profile: profile.key,
      owner: address,
      chainId: profile.chainId,
      ethBalance: { base: String(ethBalance), eth: formatEther(ethBalance) },
      sqkBalance: sqkAmount(sqkBalance),
      squeeks: positions,
      totals: {
        count: positions.length,
        deposited: positions.filter((p) => p.deposited).length,
        power: String(power[0]),
        sharePercent: null,
        claimable: sqkAmount(claimable),
        estimatedSqkPerDay: null,
      },
      staking: { power: String(power[0]), averagePower: String(power[1]) },
      maximumLevel: Number(maxLevel),
      net,
    };
    return value;
  }

  async function art(tokenId) {
    const uri = await read("nft", nft9Abi, "tokenURI", [BigInt(tokenId)]);
    return { tokenId: String(tokenId), ...parseSqueekMetadata(uri) };
  }

  async function artBatch(tokenIds, limit = 12) {
    const out = [];
    for (const tokenId of tokenIds.slice(0, limit)) {
      out.push(await art(tokenId).catch((err) => ({ tokenId: String(tokenId), error: err.message })));
    }
    return out;
  }

  // No builders, simulations, transfer, signing or submission for undocumented v9.
  return {
    profile, addresses: addr, client, capabilities: profile.capabilities,
    verify: () => run(verify),
    networkStatus: () => run(networkStatus),
    walletStatus: owner => run(() => walletStatus(owner)),
    idsOwned: owner => run(() => idsOwned(owner)),
    art: id => run(() => art(id)),
    artBatch: (ids, limit) => run(() => artBatch(ids, limit)),
  };
}
