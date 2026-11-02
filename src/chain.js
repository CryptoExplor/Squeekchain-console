// Clients, ABIs, logging and small formatting helpers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ROOT_DIR, settings } from "./config.js";

const ABI_DIR = path.join(ROOT_DIR, "abi");
const loadAbi = (name) =>
  JSON.parse(fs.readFileSync(path.join(ABI_DIR, `${name}.json`), "utf8"));

export const abi = {
  mining: loadAbi("SqueekMining"),
  core: loadAbi("SqueekCore"),
  token: loadAbi("SqueekToken"),
  nft: loadAbi("SqueekNFT"),
};

export const transport = http(settings.rpcUrl, {
  timeout: 45_000,
  retryCount: 3,
  retryDelay: 1_000,
});

export const publicClient = createPublicClient({
  chain: sepolia,
  transport,
  batch: { multicall: true },
});

export async function assertChain() {
  const id = await publicClient.getChainId();
  if (Number(id) !== settings.chainId) {
    throw new Error(`RPC is chain ${id}, expected ${settings.chainId}`);
  }
  return id;
}

let cachedWallet;
export function getWallet() {
  if (cachedWallet) return cachedWallet;
  if (!settings.privateKey) {
    throw new Error("PRIVATE_KEY is not set (required to send transactions)");
  }
  let key = settings.privateKey.trim();
  if (!key.startsWith("0x")) key = `0x${key}`;
  const account = privateKeyToAccount(key);
  cachedWallet = {
    account,
    client: createWalletClient({ account, chain: sepolia, transport }),
  };
  return cachedWallet;
}

// ── logging ───────────────────────────────────────────────────────────────────
const LOG_PATH = path.isAbsolute(settings.logFile)
  ? settings.logFile
  : path.join(ROOT_DIR, settings.logFile);
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

const stamp = () => new Date().toISOString();
export function log(message, level = "info") {
  const line = `[${stamp()}] ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(`${line}\n`);
  try {
    fs.appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    /* logging must never break the miner */
  }
}
export const logError = (m) => log(m, "error");
export const logWarn = (m) => log(m, "warn");

// ── formatting ────────────────────────────────────────────────────────────────
const SQK_DECIMALS = 18;
export const toSqk = (baseUnits) => Number(baseUnits) / 1e18;
export function fmtSqk(baseUnits, digits = 4) {
  return toSqk(baseUnits).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
export function fmtInt(value, digits = 0) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
export const fmtGwei = (wei) => `${(Number(wei) / 1e9).toFixed(3)} gwei`;
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Decode a viem error into the most useful single line.
export function errorText(err) {
  if (!err) return "unknown error";
  if (err.shortMessage && err.metaMessages?.length) {
    return `${err.shortMessage} [${err.metaMessages.join(" ")}]`;
  }
  return err.shortMessage || err.message || String(err);
}
