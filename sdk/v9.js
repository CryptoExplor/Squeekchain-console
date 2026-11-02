/**
 * Read/verify adapter for the live (undocumented) Sepolia graph: issuance v9 + staking v2 + new SqueekNFT.
 *
 * Why a separate module: the published docs describe SqueekMining v6, where rewards, claims and merges
 * all lived in one contract. The live testnet split that into SqueekIssuanceProxy (mints SQK on
 * checkpoint), SqueekStaking (deposits, power, claims) and SqueekNFT (levels + merge). Those ABIs are not
 * published, so this adapter is built from the official dApp bundle and verified at runtime against the
 * public API's release identities. Anything that could move a user's assets stays behind
 * PROFILES.sepolia.capabilities until the docs land.
 */
import { createPublicClient, fallback, http, encodeFunctionData, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { core9Abi, issuance9Abi, nft9Abi, staking9Abi, token9Abi } from "./abi-v9.js";
import { getProfile } from "./deployments.js";
import { toSqk, sqkAmount, SqueekchainError } from "./squeekchain.js";

const CHAIN_RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.gateway.tenderly.co",
  "https://1rpc.io/sepolia",
];

const ZERO = "0x0000000000000000000000000000000000000000";
const jsonify = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

/** Decodes a data:application/json;base64,<meta> URI into { name, description, attributes, image }. */
export function parseSqueekMetadata(uri) {
  if (typeof uri !== "string" || !uri.startsWith("data:application/json;base64,")) {
    throw new SqueekchainError("tokenURI is not base64 JSON", { code: "input" });
  }
  const b64 = uri.split(",")[1];
  const text =
    typeof Buffer !== "undefined"
      ? Buffer.from(b64, "base64").toString("utf8")
      : new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const meta = JSON.parse(text);
  return {
    name: meta.name,
    description: meta.description,
    image: meta.image, // data:image/svg+xml;base64,… — display as an isolated <img>, never inline
    attributes: (meta.attributes ?? []).map((a) => ({ trait: a.trait_type, value: a.value })),
    properties: meta.properties ?? null,
  };
}

export function createSqueek9({ profileKey = "sepolia", rpcUrl, cache = null } = {}) {
  const profile = getProfile(profileKey);
  if (!profile.addresses) throw new SqueekchainError(`${profile.label} has no deployment`, { code: "input" });
  const addr = Object.fromEntries(Object.entries(profile.addresses).map(([k, v]) => [k, getAddress(v)]));

  const transport =
    !rpcUrl || rpcUrl === CHAIN_RPCS[0]
      ? fallback(CHAIN_RPCS.map((url) => http(url, { timeout: 30_000, retryCount: 2, retryDelay: 600 })), { rank: false, retryCount: 1 })
      : http(rpcUrl, { timeout: 30_000, retryCount: 3, retryDelay: 800 });
  const client = createPublicClient({ chain: sepolia, transport });

  const read = (contract, abi, functionName, args = []) =>
    client.readContract({ address: addr[contract], abi, functionName, args });

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
      ok: problems.length === 0,
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
  let netCache = null;
  async function networkStatus({ force = false } = {}) {
    if (!force && netCache && Date.now() - netCache.at < 4_000) return netCache.value;

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
        lagRounds: String(Number(coreState.settledThroughRound) - Number(issuanceState.processedThroughRound)),
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
    netCache = { at: Date.now(), value };
    return value;
  }

  async function idsOwned(owner, { force = false } = {}) {
    const key = `squeek9:ids:${owner.toLowerCase()}`;
    if (!force && cache?.get) {
      try {
        const hit = JSON.parse(cache.get(key) ?? "null");
        if (hit && Date.now() / 1000 - hit.at < 900) return hit.ids.map(BigInt);
      } catch {
        /* ignore */
      }
    }
    const balance = Number(await read("nft", nft9Abi, "balanceOf", [getAddress(owner)]));
    if (balance === 0) {
      cache?.set?.(key, JSON.stringify({ at: Math.floor(Date.now() / 1000), ids: [] }));
      return [];
    }
    const latest = await client.getBlockNumber();
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
          // fall back to an ownerOf sweep
          const total = Number(await read("nft", nft9Abi, "totalSupply"));
          const ids = [];
          for (let start = 1; start <= total; start += 200) {
            const slice = [];
            for (let i = start; i < start + 200 && i <= total; i += 1) slice.push(BigInt(i));
            const res = await client.multicall({
              contracts: slice.map((tokenId) => ({ address: addr.nft, abi: nft9Abi, functionName: "ownerOf", args: [tokenId] })),
              allowFailure: true,
            });
            res.forEach((r, i) => {
              if (r.status === "success" && String(r.result).toLowerCase() === owner.toLowerCase()) ids.push(slice[i]);
            });
          }
          const sorted = ids.sort((a, b) => (a < b ? -1 : 1));
          cache?.set?.(key, JSON.stringify({ at: Math.floor(Date.now() / 1000), ids: sorted.map(String) }));
          return sorted;
        }
        chunk /= 2n;
      }
    }
    const ids = [...owned.entries()].filter(([, h]) => String(h).toLowerCase() === owner.toLowerCase()).map(([id]) => id).sort((a, b) => (a < b ? -1 : 1));
    cache?.set?.(key, JSON.stringify({ at: Math.floor(Date.now() / 1000), ids: ids.map(String) }));
    return ids;
  }

  const walletCache = new Map();
  async function walletStatus(owner, { force = false } = {}) {
    const address = getAddress(owner);
    const hit = walletCache.get(address.toLowerCase());
    if (!force && hit && Date.now() - hit.at < 4_000) return hit.value;

    const ids = await idsOwned(address, { force });
    const [net, claimable, power, sqkBalance, ethBalance, maxLevel] = await Promise.all([
      networkStatus(),
      read("staking", staking9Abi, "claimable", [address]),
      read("staking", staking9Abi, "accountPower", [address]),
      read("token", token9Abi, "balanceOf", [address]),
      client.getBalance({ address }),
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
      const res = await client.multicall({ contracts, allowFailure: true });
      slice.forEach((tokenId, j) => {
        const level = res[j * 3];
        if (level.status !== "success") return;
        const nextMerge = res[j * 3 + 1];
        const depositor = res[j * 3 + 2];
        const lvl = Number(level.result);
        if (lvl === 0) return;
        positions.push({
          tokenId: String(tokenId),
          level: lvl,
          nextMergeHeight: nextMerge.status === "success" ? String(nextMerge.result) : null,
          deposited: depositor.status === "success" ? String(depositor.result).toLowerCase() === address.toLowerCase() : false,
          activeWeight: null, // v9 power is account-level, not per token
          claimable: null,
        });
      });
    }

    const value = {
      profile: profile.key,
      owner: address,
      chainId: profile.chainId,
      ethBalance: { base: String(ethBalance), eth: (Number(ethBalance) / 1e18).toFixed(6) },
      sqkBalance: sqkAmount(sqkBalance),
      squeeks: positions,
      totals: {
        count: positions.length,
        deposited: positions.filter((p) => p.deposited).length,
        power: String(power?.[0] ?? 0n),
        sharePercent: null,
        claimable: sqkAmount(claimable),
        estimatedSqkPerDay: null,
      },
      staking: { power: String(power?.[0] ?? 0n), averagePower: String(power?.[1] ?? 0n) },
      maximumLevel: Number(maxLevel),
      net,
    };
    walletCache.set(address.toLowerCase(), { at: Date.now(), value });
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

  // ── unsigned builders (gated by profile.capabilities in the UI) ─────────────
  const tx = (to, abi, fn, args) => ({ to, data: encodeFunctionData({ abi, functionName: fn, args }), value: "0", chainId: profile.chainId });
  const buildMerge = (survivor, donor) => ({
    tx: tx(addr.nft, nft9Abi, "merge", [BigInt(survivor), BigInt(donor)]),
    survivor: String(survivor),
    donor: String(donor),
    warning: "v9 merges run on SqueekNFT.merge(survivor, donor) — the donor is burned permanently.",
  });
  const buildTransfer = (from, to, tokenId) => ({
    tx: tx(addr.nft, nft9Abi, "safeTransferFrom", [getAddress(from), getAddress(to), BigInt(tokenId)]),
    note: "transfer moves the Squeek and any staking position tied to it",
  });
  const buildCheckpoint = () => tx(addr.issuance, issuance9Abi, "checkpoint", []);

  return {
    profile,
    addresses: addr,
    client,
    verify,
    networkStatus,
    walletStatus,
    idsOwned,
    art,
    artBatch,
    buildMerge,
    buildTransfer,
    buildCheckpoint,
    capabilities: profile.capabilities,
  };
}
