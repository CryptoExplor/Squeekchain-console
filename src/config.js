// Config loading. Everything comes from .env (optional) + process.env.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const str = (key, fallback = "") => {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : String(v).trim();
};
const num = (key, fallback) => {
  const v = str(key);
  if (v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env ${key} must be a number, got "${v}"`);
  return n;
};
const bool = (key, fallback) =>
  str(key) === "" ? fallback : ["1", "true", "yes", "on"].includes(str(key).toLowerCase());

export const ROOT_DIR = ROOT;

// Published Sepolia deployment (docs: /developers#deployments).
export const DEFAULTS = {
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  core: "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f",
  mining: "0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4",
  token: "0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76",
  nft: "0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6",
  // Pinned identities used by `verify` (may be stale after a governance upgrade;
  // set ALLOW_UNVERIFIED=true to skip the runtime-hash pinning).
  miningImplementation: "0x08890b360c65fd878344bf6e23d1c36358433b4e",
  miningLayoutDigest: "0xace564e9c052f30122779a32fdf3333ebce7cc708eae9c01cb7875b4f6ad37a6",
  miningProxyAdmin: "0x7369d930f8dfb7a6657578eda5906d3472e4ac9a",
  coreImplementation: "0x0a71c86ab63a77675002a389fdf4d096a07b11e2",
  coreLayoutDigest: "0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20",
  coreProxyAdmin: "0x05a9af6c3f6780dd58168f2e145cdd0d64564a5e",
  timelock: "0x6B35AB6E96EF292E4fdD3f15a4E812f3CA291844",
  nftStartBlock: 11902282n, // SqueekCore launch block; SqueekMining at 11902290
};

export const addresses = {
  core: str("CORE_ADDRESS", DEFAULTS.core),
  mining: str("MINING_ADDRESS", DEFAULTS.mining),
  token: str("SQK_ADDRESS", DEFAULTS.token),
  nft: str("NFT_ADDRESS", DEFAULTS.nft),
};

export const settings = {
  chainId: num("CHAIN_ID", DEFAULTS.chainId),
  rpcUrl: str("RPC_URL", DEFAULTS.rpcUrl),

  privateKey: str("PRIVATE_KEY"),
  live: bool("LIVE", false),
  maxFeeGwei: num("MAX_FEE_GWEI", 40),

  tokenIds: str("TOKEN_IDS")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((v) => {
      if (!/^\d+$/.test(v)) throw new Error(`TOKEN_IDS entry "${v}" is not a token id`);
      return BigInt(v);
    }),
  minClaimSqk: num("MIN_CLAIM_SQK", 1),
  autoMerge: bool("AUTO_MERGE", true),
  maxMergesPerTick: num("MAX_MERGES_PER_TICK", 8),
  maxCheckpointsPerTick: num("MAX_CHECKPOINTS_PER_TICK", 8),
  pollSeconds: num("POLL_SECONDS", 60),
  logFile: str("LOG_FILE", "logs/miner.log"),

  allowUnverified: bool("ALLOW_UNVERIFIED", false),
  getLogsChunk: num("GETLOGS_CHUNK", 45_000),
  // How long a discovered token-ID list stays cached (seconds).
  discoveryTtl: num("DISCOVERY_TTL", 900),
  nftStartBlock: BigInt(str("NFT_START_BLOCK", String(DEFAULTS.nftStartBlock))),
};

// Collection selector for Squeeks; every `collection` parameter uses 0.
export const COLLECTION = 0;
