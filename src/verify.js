// Deployment + contract-graph verification (mirrors docs: /developers/quickstart#verify-the-deployment).
import { getAddress, keccak256, parseAbi } from "viem";
import { abi, publicClient, log, logWarn } from "./chain.js";
import { DEFAULTS, addresses, settings } from "./config.js";

const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const slotAddress = (word) => getAddress(`0x${(word ?? "0x").slice(-40)}`);

const identityAbi = parseAbi([
  "function implementationCodeAddress() view returns (address)",
  "function implementationCodeVersion() view returns (uint64)",
  "function implementationStorageLayoutDigest() view returns (bytes32)",
  "function owner() view returns (address)",
]);

async function verifyProxy({ name, proxy, version, expectedImplementation, expectedLayout, expectedAdmin, blockNumber }) {
  const problems = [];
  const [implWord, adminWord] = await Promise.all([
    publicClient.getStorageAt({ address: proxy, slot: IMPLEMENTATION_SLOT, blockNumber }),
    publicClient.getStorageAt({ address: proxy, slot: ADMIN_SLOT, blockNumber }),
  ]);
  const implementation = slotAddress(implWord);
  const admin = slotAddress(adminWord);

  const [reported, codeVersion, layout] = await Promise.all([
    publicClient.readContract({ address: proxy, abi: identityAbi, functionName: "implementationCodeAddress", blockNumber }),
    publicClient.readContract({ address: proxy, abi: identityAbi, functionName: "implementationCodeVersion", blockNumber }),
    publicClient.readContract({ address: proxy, abi: identityAbi, functionName: "implementationStorageLayoutDigest", blockNumber }),
  ]);
  const adminOwner = await publicClient
    .readContract({ address: admin, abi: identityAbi, functionName: "owner", blockNumber })
    .catch(() => null);
  const code = await publicClient.getCode({ address: implementation, blockNumber });

  if (!code || code === "0x") problems.push("implementation has no code");
  if (Number(codeVersion) !== version) problems.push(`implementationCodeVersion ${codeVersion} != ${version}`);
  if (!same(reported, implementation)) problems.push("reported implementation != EIP-1967 slot");

  if (!settings.allowUnverified) {
    if (!same(implementation, expectedImplementation)) problems.push(`implementation ${implementation} != pinned ${expectedImplementation}`);
    if (!same(layout, expectedLayout)) problems.push(`layout digest ${layout} != pinned ${expectedLayout}`);
    if (!same(admin, expectedAdmin)) problems.push(`proxy admin ${admin} != pinned ${expectedAdmin}`);
    if (adminOwner && !same(adminOwner, DEFAULTS.timelock)) problems.push(`proxy admin owner ${adminOwner} != timelock`);
  }

  return {
    name,
    proxy,
    implementation,
    codeHash: code ? keccak256(code) : "0x",
    version: Number(codeVersion),
    admin,
    adminOwner,
    problems,
  };
}

const retryable = (err) => /not found|missing trie|pruned|header not found|unknown block/i.test(String(err?.message ?? err));

/** Verifies both proxies and the wiring between all four contracts. Throws on any mismatch. */
export async function verifyGraph(options = {}) {
  const { blockNumber, quiet = false } = options;
  const latest = await publicClient.getBlockNumber();
  const at = blockNumber ?? (latest > 12n ? latest - 6n : latest);
  try {
    return await verifyGraphAt({ at, quiet });
  } catch (err) {
    // Free RPCs sometimes prune state a few blocks back; retry at the head block.
    if (blockNumber === undefined && retryable(err)) {
      logWarn("pinned-block verification unavailable on this RPC — retrying at the head block");
      return verifyGraphAt({ at: undefined, quiet });
    }
    throw err;
  }
}

async function verifyGraphAt({ at, quiet }) {

  const [mining, core] = await Promise.all([
    verifyProxy({
      name: "SqueekMining",
      proxy: getAddress(addresses.mining),
      version: 6,
      expectedImplementation: DEFAULTS.miningImplementation,
      expectedLayout: DEFAULTS.miningLayoutDigest,
      expectedAdmin: DEFAULTS.miningProxyAdmin,
      blockNumber: at,
    }),
    verifyProxy({
      name: "SqueekCore",
      proxy: getAddress(addresses.core),
      version: 3,
      expectedImplementation: DEFAULTS.coreImplementation,
      expectedLayout: DEFAULTS.coreLayoutDigest,
      expectedAdmin: DEFAULTS.coreProxyAdmin,
      blockNumber: at,
    }),
  ]);

  const linksAbi = parseAbi([
    "function core() view returns (address)",
    "function mining() view returns (address)",
    "function collectionPolicy(uint8 collection) view returns ((address nft, uint16 maxSupply, uint8 maximumLevel, (uint64 weight, uint64 cooldownBlocks)[] levels))",
  ]);
  const token = getAddress(addresses.token);
  const nft = getAddress(addresses.nft);
  const [miningCore, tokenMining, policy] = await Promise.all([
    publicClient.readContract({ address: getAddress(addresses.mining), abi: linksAbi, functionName: "core", blockNumber: at }),
    publicClient.readContract({ address: token, abi: linksAbi, functionName: "mining", blockNumber: at }),
    publicClient.readContract({ address: getAddress(addresses.mining), abi: linksAbi, functionName: "collectionPolicy", args: [0], blockNumber: at }),
  ]);

  const problems = [...mining.problems.map((p) => `SqueekMining: ${p}`), ...core.problems.map((p) => `SqueekCore: ${p}`)];
  if (!same(miningCore, addresses.core)) problems.push(`mining.core() ${miningCore} != ${addresses.core}`);
  if (!same(tokenMining, addresses.mining)) problems.push(`token.mining() ${tokenMining} != ${addresses.mining}`);
  if (!same(policy.nft, nft)) problems.push(`collectionPolicy(0).nft ${policy.nft} != ${nft}`);

  const [rewardPerBlock, supplyCap, maxClaims] = await Promise.all([
    publicClient.readContract({ address: getAddress(addresses.mining), abi: abi.mining, functionName: "REWARD_PER_BLOCK", blockNumber: at }),
    publicClient.readContract({ address: getAddress(addresses.mining), abi: abi.mining, functionName: "SUPPLY_CAP", blockNumber: at }),
    publicClient.readContract({ address: getAddress(addresses.mining), abi: abi.mining, functionName: "MAX_CLAIMS", blockNumber: at }),
  ]);

  if (!quiet) {
    log(`verified at block ${at}`);
    log(`SqueekMining ${mining.proxy} → impl ${mining.implementation} (v${mining.version})`);
    log(`SqueekCore   ${core.proxy} → impl ${core.implementation} (v${core.version})`);
    log(`reward/block ${Number(rewardPerBlock) / 1e18} SQK · supply cap ${Number(supplyCap) / 1e18} SQK · max claims ${maxClaims}`);
    log(`levels: ${policy.levels.map((l, i) => `L${i + 1}=${l.weight}/${l.cooldownBlocks}b`).join(" ")}`);
    if (settings.allowUnverified) log("ALLOW_UNVERIFIED=true — identity pinning skipped", "warn");
  }

  if (problems.length) {
    for (const p of problems) log(p, "error");
    throw new Error(`deployment verification failed (${problems.length} problem(s))`);
  }
  return { blockNumber: at, mining, core, token, nft, policy, rewardPerBlock, supplyCap, maxClaims };
}
