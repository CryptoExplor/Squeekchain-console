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
import { createPublicClient, fallback, http, encodeFunctionData, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { coreAbi, miningAbi, nftAbi, tokenAbi } from "./abi.js";

export { sepolia };
export const abis = { core: coreAbi, mining: miningAbi, nft: nftAbi, token: tokenAbi };

export const CHAIN = {
  id: 11155111,
  name: "Sepolia",
  hexId: "0xaa36a7",
  // Public endpoints, tried in order and failing over on 429s/outages.
  rpcUrls: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.gateway.tenderly.co",
    "https://1rpc.io/sepolia",
  ],
};

// Published deployment record (docs.squeekchain.com/developers#deployments).
export const DEPLOYMENT = {
  core: "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f",
  mining: "0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4",
  token: "0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76",
  nft: "0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6",
  implementations: {
    core: "0x0a71c86ab63a77675002a389fdf4d096a07b11e2",
    mining: "0x08890b360c65fd878344bf6e23d1c36358433b4e",
  },
  layoutDigests: {
    core: "0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20",
    mining: "0xace564e9c052f30122779a32fdf3333ebce7cc708eae9c01cb7875b4f6ad37a6",
  },
  proxyAdmins: {
    core: "0x05a9af6c3f6780dd58168f2e145cdd0d64564a5e",
    mining: "0x7369d930f8dfb7a6657578eda5906d3472e4ac9a",
  },
  timelock: "0x6B35AB6E96EF292E4fdD3f15a4E812f3CA291844",
  nftStartBlock: 11902282n,
  versions: { core: 3, mining: 6 },
};

export const COLLECTION = 0; // Squeeks
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const ZERO = "0x0000000000000000000000000000000000000000";

const identityAbi = [
  { type: "function", name: "implementationCodeAddress", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "implementationCodeVersion", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "implementationStorageLayoutDigest", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

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

/**
 * @param {object} opts
 * @param {string} [opts.rpcUrl]           override the default public RPC
 * @param {object} [opts.addresses]        override the deployment addresses
 * @param {{get:Function,set:Function}} [opts.cache]  optional token-ID cache (localStorage, Map, …)
 * @param {boolean} [opts.skipVerification] testing/sandbox escape hatch only
 */
export function createSqueekchain({ rpcUrl = CHAIN.rpcUrls[0], addresses = {}, cache = null, skipVerification = false } = {}) {
  const addr = {
    core: getAddress(addresses.core ?? DEPLOYMENT.core),
    mining: getAddress(addresses.mining ?? DEPLOYMENT.mining),
    token: getAddress(addresses.token ?? DEPLOYMENT.token),
    nft: getAddress(addresses.nft ?? DEPLOYMENT.nft),
  };

  const transport =
    rpcUrl === CHAIN.rpcUrls[0]
      ? fallback(
          CHAIN.rpcUrls.map((url) => http(url, { timeout: 30_000, retryCount: 2, retryDelay: 600 })),
          { rank: false, retryCount: 1 },
        )
      : http(rpcUrl, { timeout: 30_000, retryCount: 3, retryDelay: 800 });

  const client = createPublicClient({ chain: sepolia, transport });
  const read = (contract, abi, functionName, args = []) => client.readContract({ address: addr[contract], abi, functionName, args });

  // ── token discovery ─────────────────────────────────────────────────────────
  const cacheKey = (owner) => `squeekchain:ids:${owner.toLowerCase()}`;
  const readCache = (owner) => {
    try {
      const hit = cache?.get ? cache.get(cacheKey(owner)) : null;
      if (!hit) return null;
      const parsed = typeof hit === "string" ? JSON.parse(hit) : hit;
      if (!parsed?.at || Date.now() / 1000 - parsed.at > 900) return null;
      return parsed.ids.map(BigInt);
    } catch {
      return null;
    }
  };
  const writeCache = (owner, ids) => {
    try {
      cache?.set?.(cacheKey(owner), JSON.stringify({ at: Math.floor(Date.now() / 1000), ids: ids.map(String) }));
    } catch {
      /* best effort */
    }
  };

  async function scanLogs(owner, latest) {
    const owned = new Map();
    let chunk = 45_000n;
    let cursor = DEPLOYMENT.nftStartBlock;
    while (cursor <= latest) {
      const end = cursor + chunk - 1n > latest ? latest : cursor + chunk - 1n;
      try {
        const logs = await client.getContractEvents({
          address: addr.nft,
          abi: nftAbi,
          eventName: "Transfer",
          fromBlock: cursor,
          toBlock: end,
        });
        for (const l of logs) {
          const { tokenId, to } = l.args;
          if (to.toLowerCase() === ZERO) owned.delete(tokenId);
          else owned.set(tokenId, to);
        }
        cursor = end + 1n;
      } catch (err) {
        if (chunk <= 1_000n) throw err;
        chunk /= 2n;
      }
    }
    return [...owned.entries()].filter(([, h]) => h.toLowerCase() === owner.toLowerCase()).map(([id]) => id);
  }

  async function scanOwners(owner, batchSize = 250) {
    const total = Number(await read("nft", nftAbi, "totalIssued"));
    const found = [];
    for (let start = 1; start <= total; start += batchSize) {
      const ids = [];
      for (let id = start; id < start + batchSize && id <= total; id += 1) ids.push(BigInt(id));
      const res = await client.multicall({
        contracts: ids.map((tokenId) => ({ address: addr.nft, abi: nftAbi, functionName: "ownerOf", args: [tokenId] })),
        allowFailure: true,
      });
      res.forEach((r, i) => {
        if (r.status === "success" && String(r.result).toLowerCase() === owner.toLowerCase()) found.push(ids[i]);
      });
    }
    return found;
  }

  const sortIds = (ids) => [...new Set(ids.map(String))].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // ── verification ────────────────────────────────────────────────────────────
  async function verify({ pinIdentities = true } = {}) {
    const latest = await client.getBlockNumber();
    const problems = [];
    const detail = {};

    for (const name of ["mining", "core"]) {
      const proxy = addr[name];
      const [implWord, adminWord] = await Promise.all([
        client.getStorageAt({ address: proxy, slot: IMPLEMENTATION_SLOT }),
        client.getStorageAt({ address: proxy, slot: ADMIN_SLOT }),
      ]);
      const implementation = getAddress(`0x${(implWord ?? "0x").slice(-40)}`);
      const admin = getAddress(`0x${(adminWord ?? "0x").slice(-40)}`);
      const [codeVersion, layout] = await Promise.all([
        client.readContract({ address: proxy, abi: identityAbi, functionName: "implementationCodeVersion" }),
        client.readContract({ address: proxy, abi: identityAbi, functionName: "implementationStorageLayoutDigest" }),
      ]);
      detail[name] = { proxy, implementation, admin, version: Number(codeVersion), layout };

      if (Number(codeVersion) !== DEPLOYMENT.versions[name]) {
        problems.push(`${name}: implementation version ${codeVersion} != ${DEPLOYMENT.versions[name]}`);
      }
      if (pinIdentities) {
        if (implementation.toLowerCase() !== DEPLOYMENT.implementations[name].toLowerCase()) {
          problems.push(`${name}: implementation ${implementation} != pinned ${DEPLOYMENT.implementations[name]}`);
        }
        if (String(layout).toLowerCase() !== DEPLOYMENT.layoutDigests[name].toLowerCase()) {
          problems.push(`${name}: layout digest != pinned`);
        }
        if (admin.toLowerCase() !== DEPLOYMENT.proxyAdmins[name].toLowerCase()) {
          problems.push(`${name}: proxy admin ${admin} != pinned`);
        }
      }
    }

    const [miningCore, tokenMining, policy] = await Promise.all([
      read("mining", miningAbi, "core"),
      read("token", tokenAbi, "mining"),
      read("mining", miningAbi, "collectionPolicy", [COLLECTION]),
    ]);
    if (miningCore.toLowerCase() !== addr.core.toLowerCase()) problems.push("mining.core() != core");
    if (tokenMining.toLowerCase() !== addr.mining.toLowerCase()) problems.push("token.mining() != mining");
    if (policy.nft.toLowerCase() !== addr.nft.toLowerCase()) problems.push("collectionPolicy(0).nft != nft");

    return {
      ok: problems.length === 0,
      problems,
      blockNumber: String(latest),
      chainId: CHAIN.id,
      detail: jsonify(detail),
      wiring: { miningCore, tokenMining, nft: policy.nft },
    };
  }

  async function assertVerified() {
    if (skipVerification) return null;
    const v = await verify();
    if (!v.ok) {
      throw new SqueekchainError(`deployment verification failed: ${v.problems.join("; ")}`, { code: "verification" });
    }
    return v;
  }

  // ── reads ───────────────────────────────────────────────────────────────────
  let netCache = null;
  async function networkStatus({ force = false } = {}) {
    if (!force && netCache && Date.now() - netCache.at < 4_000) return netCache.value;
    const value = await readNetworkStatus();
    netCache = { at: Date.now(), value };
    return value;
  }

  async function readNetworkStatus() {
    const [miningState, coreState, accounting, cpStatus, policy, rewardPerBlock, supplyCap, config] = await Promise.all([
      read("mining", miningAbi, "state"),
      read("core", coreAbi, "state"),
      read("mining", miningAbi, "accounting"),
      read("mining", miningAbi, "checkpointStatus"),
      read("mining", miningAbi, "collectionPolicy", [COLLECTION]),
      read("mining", miningAbi, "REWARD_PER_BLOCK"),
      read("mining", miningAbi, "SUPPLY_CAP"),
      read("core", coreAbi, "configuration"),
    ]);
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
        lagRounds: String(Number(coreState.settledThroughRound) - Number(miningState.processedThroughRound)),
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
        reason: corePaused ? "SqueekCore is paused" : roundSettled ? null : "no newly certified round yet",
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
      const res = await client.multicall({ contracts, allowFailure: true });
      slice.forEach((tokenId, j) => {
        const pos = res[j * 2];
        const holderRes = res[j * 2 + 1];
        if (pos.status !== "success" || Number(pos.result.level) === 0) return;
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
    });
    const perToken = new Map();
    let total = 0n;
    res.forEach((r, i) => {
      const amount = r.status === "success" ? r.result : 0n;
      perToken.set(tokenIds[i], amount);
      total += amount;
    });
    return { total, perToken };
  }

  async function discoverTokenIds(owner, { force = false } = {}) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner ?? "")) {
      throw new SqueekchainError("a valid 0x address is required", { code: "input" });
    }
    const balance = await read("nft", nftAbi, "balanceOf", [getAddress(owner)]);
    if (balance === 0n) {
      writeCache(owner, []);
      return [];
    }
    if (!force) {
      const cached = readCache(owner);
      if (cached) return cached;
    }
    const latest = await client.getBlockNumber();
    let ids;
    try {
      ids = await scanLogs(owner, latest);
      if (ids.length !== Number(balance)) throw new Error("log scan incomplete");
    } catch {
      ids = await scanOwners(owner);
    }
    ids = sortIds(ids);
    writeCache(owner, ids);
    return ids;
  }

  /** Everything a holder (or a curious onlooker) needs about one address (memoised for 4s). */
  const walletCache = new Map();
  async function walletStatus(owner, { force = false } = {}) {
    const address = getAddress(owner);
    const hit = walletCache.get(address.toLowerCase());
    if (!force && hit && Date.now() - hit.at < 4_000) return hit.value;
    const value = await readWalletStatus(address, { force });
    walletCache.set(address.toLowerCase(), { at: Date.now(), value });
    return value;
  }

  async function readWalletStatus(address, { force } = {}) {
    const [ids, ethBalance, sqkBalance, net] = await Promise.all([
      discoverTokenIds(address, { force }),
      client.getBalance({ address }),
      read("token", tokenAbi, "balanceOf", [address]),
      networkStatus(),
    ]);
    const positions = await positionsFor(ids);
    const mine = positions.filter((p) => p.holder?.toLowerCase() === address.toLowerCase());
    const { total, perToken } = await claimableFor(mine.map((p) => BigInt(p.tokenId)));
    const power = mine.reduce((sum, p) => sum + BigInt(p.activeWeight), 0n);
    const totalWeight = BigInt(net.mining.totalWeight);
    const shareBps = totalWeight > 0n ? Number((power * 10_000n) / totalWeight) / 100 : 0;

    return {
      owner: address,
      chainId: CHAIN.id,
      ethBalance: { base: String(ethBalance), eth: (Number(ethBalance) / 1e18).toFixed(6) },
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
    const net = await networkStatus();
    if (!net.checkpoint.canCheckpoint) {
      return { ok: false, reason: net.checkpoint.reason, checkpoint: net.checkpoint };
    }
    const built = buildCheckpoint();
    try {
      const gas = await client.estimateGas({ account: from || undefined, to: addr.mining, data: built.data, value: 0n });
      return { ok: true, tx: built, gas: String(gas), checkpoint: net.checkpoint };
    } catch (err) {
      throw wrap(err, "checkpoint simulation failed");
    }
  }

  async function claimPreview(owner, tokenIds, { status: prefetched } = {}) {
    const address = getAddress(owner);
    const status = prefetched ?? (await walletStatus(address, { force: true }));
    const owned = status.squeeks.map((s) => BigInt(s.tokenId));
    const wanted = tokenIds?.length ? sortIds(tokenIds.map(BigInt)) : owned;
    const ids = wanted.filter((id) => owned.includes(id));
    if (ids.length === 0) return { ok: false, reason: "no live Squeeks owned by this address", batches: [] };

    const batches = [];
    for (let i = 0; i < ids.length; i += 32) {
      const slice = ids.slice(i, i + 32);
      const built = buildClaim(slice);
      const amount = slice.reduce((sum, id) => {
        const row = status.squeeks.find((s) => s.tokenId === String(id));
        return sum + BigInt(row?.claimable.base ?? 0);
      }, 0n);
      let gas = null;
      let error = null;
      try {
        gas = String(await client.estimateGas({ account: address, to: built.tx.to, data: built.tx.data, value: 0n }));
      } catch (err) {
        error = decodeRevert(err)?.name ?? (err.shortMessage || err.message);
      }
      batches.push({ ...built, amount: sqkAmount(amount), gas, error });
    }
    return {
      ok: batches.every((b) => !b.error),
      batches,
      total: sqkAmount(batches.reduce((sum, b) => sum + BigInt(b.amount.base), 0n)),
    };
  }

  /** Greedy same-level pairing, mirroring the onchain preconditions exactly. */
  async function mergePlan(owner, { status: prefetched } = {}) {
    const address = getAddress(owner);
    const [status, net] = await Promise.all([prefetched ?? walletStatus(address, { force: true }), networkStatus()]);
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

  async function mergePreview(owner, survivorId, donorId) {
    const address = getAddress(owner);
    const [positions] = await Promise.all([positionsFor([BigInt(survivorId), BigInt(donorId)])]);
    if (positions.length !== 2) throw new SqueekchainError("both tokens need a live position", { code: "input" });
    if (positions.some((p) => p.holder?.toLowerCase() !== address.toLowerCase())) {
      throw new SqueekchainError("caller does not own both tokens", { code: "input" });
    }
    if (positions[0].level !== positions[1].level) throw new SqueekchainError("tokens are at different levels", { code: "input" });
    const built = buildMerge(survivorId, donorId);
    const gas = String(await client.estimateGas({ account: address, to: built.tx.to, data: built.tx.data, value: 0n }));
    return { ok: true, ...built, tx: built.tx, gas, warning: "the donor NFT is burned permanently and cannot be restored" };
  }

  return {
    addresses: addr,
    rpcUrl,
    client,
    verify,
    assertVerified,
    networkStatus,
    walletStatus,
    discoverTokenIds,
    positionsFor,
    checkpointPreview,
    claimPreview,
    mergePlan,
    mergePreview,
    buildCheckpoint,
    buildClaim,
    buildMerge,
  };
}
