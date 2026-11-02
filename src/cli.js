#!/usr/bin/env node
// Squeekchain mining CLI: verify · status · checkpoint · claim · merge · mine
import { formatEther, getAddress } from "viem";
import {
  abi,
  publicClient,
  getWallet,
  log,
  logWarn,
  errorText,
  fmtSqk,
  fmtInt,
  shortAddr,
  sleep,
} from "./chain.js";
import { COLLECTION, DEFAULTS, addresses, settings } from "./config.js";
import { verifyGraph } from "./verify.js";
import { discoverTokenIds, readPositions, readClaimable, readProtocolState } from "./portfolio.js";
import { runCheckpoint, runClaim, runMerge } from "./actions.js";

const argv = process.argv.slice(2);
const command = argv[0] || "help";
const hasFlag = (name) => argv.includes(`--${name}`);
if (hasFlag("live")) settings.live = true;
if (hasFlag("no-merge")) settings.autoMerge = false;

const argValue = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

// --address inspects/preflights another owner without its private key (forces dry run).
const readOnlyOwner = argValue("address") ?? null;
if (readOnlyOwner) {
  settings.live = false;
  settings.tokenIds = [];
}

const applyOverrides = () => {
  const ids = argValue("ids");
  if (ids) settings.tokenIds = ids.split(",").map((v) => BigInt(v.trim()));
  const minClaim = argValue("min-claim");
  if (minClaim) settings.minClaimSqk = Number(minClaim);
};

const banner = () =>
  log(
    `network sepolia(${settings.chainId}) · mining ${shortAddr(addresses.mining)} · ` +
      `mode ${settings.live ? "LIVE (transactions will be sent)" : "DRY RUN (simulate only)"}`,
  );

const requireWallet = () => {
  const { account } = getWallet();
  return account.address;
};

// Owner for owner-only commands: --address (read-only) wins, else the signing wallet.
const resolveOwner = () => {
  if (readOnlyOwner) return readOnlyOwner;
  if (!settings.privateKey) {
    throw new Error(
      "PRIVATE_KEY is not set. Add it to .env, or inspect another owner read-only with --address 0x…",
    );
  }
  return requireWallet();
};

// ── status ────────────────────────────────────────────────────────────────────
async function status() {
  applyOverrides();
  banner();
  try {
    await verifyGraph({ quiet: true });
    log("deployment graph verified ✓");
  } catch (err) {
    logWarn(`deployment verification failed: ${errorText(err)}`);
    if (!settings.allowUnverified) logWarn("continuing (read-only) — fix or set ALLOW_UNVERIFIED=true");
  }

  const owner = readOnlyOwner ?? (settings.privateKey ? requireWallet() : null);
  const proto = await readProtocolState();
  const { miningState, coreState, accounting, checkpoint, policy, rewardPerBlock } = proto;

  // Realised block rate since genesis → reward projection.
  const config = await publicClient.readContract({ address: getAddress(addresses.core), abi: abi.core, functionName: "configuration" });
  const blockUnitsPerBlock = Number(config.blockUnitsPerBlock) || 1e9;
  const blocksTotal = Number(coreState.cumulativeBlockUnits) / blockUnitsPerBlock;
  const elapsed = Math.max(1, Math.floor(Date.now() / 1000) - Number(config.genesisTimestamp));
  const blocksPerDay = (blocksTotal / elapsed) * 86_400;
  const emissionPerDay = blocksPerDay * (Number(rewardPerBlock) / 1e18);

  console.log("");
  log(
    `core: settled round ${coreState.settledThroughRound} · blocks ${fmtInt(coreState.blockHeight)} ` +
      `(+${fmtInt(Number(coreState.blockProgress) / blockUnitsPerBlock, 3)}) · paused=${coreState.paused}`,
  );
  log(
    `mining: processed round ${miningState.processedThroughRound} · lag ${Number(coreState.settledThroughRound) - Number(miningState.processedThroughRound)} round(s) · ` +
      `totalWeight ${fmtInt(miningState.totalWeight)}`,
  );
  const supplyCap = await publicClient.readContract({ address: getAddress(addresses.mining), abi: abi.mining, functionName: "SUPPLY_CAP" });
  const remainingCap = supplyCap > miningState.minted ? supplyCap - miningState.minted : 0n;
  log(
    `emission: minted ${fmtSqk(miningState.minted, 2)} SQK · cap left ${fmtSqk(remainingCap, 0)} · ` +
      `paid ${fmtSqk(miningState.paid, 2)} · custody ${fmtSqk(accounting.miningBalance, 2)} SQK`,
  );
  log(
    `checkpoint: corePaused=${checkpoint.corePaused} nextRound=${checkpoint.nextRound} roundSettled=${checkpoint.roundSettled} · ` +
      `queue ${miningState.weightActivationCursor}/${miningState.weightActivationCount} activations applied`,
  );
  log(`rate: ≈${fmtInt(blocksPerDay, 1)} Squeek blocks/day → ≈${fmtInt(emissionPerDay, 0)} SQK/day to all power`);

  if (!owner) {
    log("no PRIVATE_KEY set — wallet section skipped", "warn");
    return;
  }

  const ids = await discoverTokenIds(owner);
  const positions = await readPositions(ids);
  const mine = positions.filter((p) => p.holder && p.holder.toLowerCase() === owner.toLowerCase());
  const [{ total: claimable }, ethBalance, sqkBalance] = await Promise.all([
    readClaimable(mine.map((p) => p.tokenId)),
    publicClient.getBalance({ address: owner }),
    publicClient.readContract({ address: getAddress(addresses.token), abi: abi.token, functionName: "balanceOf", args: [owner] }),
  ]);

  const myPower = mine.reduce((sum, p) => sum + BigInt(p.activeWeight), 0n);
  const share = miningState.totalWeight > 0n ? Number((myPower * 1_000_000n) / miningState.totalWeight) / 10_000 : 0;
  const myPerDay = (emissionPerDay * share) / 100;

  console.log("");
  log(`wallet ${owner} · ${Number(formatEther(ethBalance)).toFixed(4)} ETH · ${fmtSqk(sqkBalance, 4)} SQK`);
  log(`squeeks ${mine.length} · power ${fmtInt(myPower)} (${share.toFixed(4)}% of network) · ≈${fmtInt(myPerDay, 2)} SQK/day`);
  log(`claimable now ${fmtSqk(claimable, 6)} SQK`);

  if (mine.length) {
    console.log("");
    const head = ["token", "level", "active", "pending", "merge@", "claimable"];
    const rows = [];
    const claimByToken = await perTokenClaimable(mine.map((p) => p.tokenId));
    for (const p of mine) {
      const pending = p.pendingRound === 0n ? "—" : `L? ${fmtInt(p.pendingWeight)} @r${p.pendingRound}`;
      const mergeAt = p.level >= policy.maximumLevel ? "max" : fmtInt(p.nextMergeBlock);
      rows.push([
        String(p.tokenId),
        `L${p.level}`,
        fmtInt(p.activeWeight),
        pending,
        mergeAt,
        fmtSqk(claimByToken.get(p.tokenId) ?? 0n, 6),
      ]);
    }
    const MAX_ROWS = 30;
    if (rows.length > MAX_ROWS) {
      printTable(head, rows.slice(0, MAX_ROWS));
      log(`…and ${rows.length - MAX_ROWS} more Squeeks (showing first ${MAX_ROWS})`);
    } else {
      printTable(head, rows);
    }
  }

  const ready = positions.filter(
    (p) =>
      p.holder?.toLowerCase() === owner.toLowerCase() &&
      p.level < policy.maximumLevel &&
      p.pendingRound === 0n &&
      p.nextMergeBlock <= coreState.blockHeight,
  ).length;
  if (ready >= 2) log(`${ready} squeeks are merge-ready on cooldown-free levels`);
}

async function perTokenClaimable(tokenIds, chunkSize = 100) {
  const map = new Map();
  for (let i = 0; i < tokenIds.length; i += chunkSize) {
    const slice = tokenIds.slice(i, i + chunkSize);
    const res = await publicClient.multicall({
      contracts: slice.map((tokenId) => ({
        address: getAddress(addresses.mining),
        abi: abi.mining,
        functionName: "claimable",
        args: [COLLECTION, [tokenId]],
      })),
      allowFailure: true,
    });
    res.forEach((r, idx) => map.set(slice[idx], r.status === "success" ? r.result : 0n));
  }
  return map;
}

function printTable(head, rows) {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(`  ${line(head)}`);
  console.log(`  ${widths.map((w) => "─".repeat(w)).join("  ")}`);
  for (const row of rows) console.log(`  ${line(row)}`);
  console.log("");
}

// ── commands ──────────────────────────────────────────────────────────────────
async function withVerified(fn) {
  await verifyGraph({ quiet: true });
  return fn();
}

async function checkpoint() {
  banner();
  await withVerified(async () => {
    const result = await runCheckpoint({ maxIterations: settings.maxCheckpointsPerTick });
    log(`checkpoint done: ${result.calls} call(s), ${fmtSqk(result.totalMinted)} SQK minted`);
  });
}

async function claim() {
  applyOverrides();
  banner();
  const owner = resolveOwner();
  await withVerified(async () => {
    const result = await runClaim({
      minSqk: settings.minClaimSqk,
      tokenIds: settings.tokenIds.length ? settings.tokenIds : undefined,
      owner: readOnlyOwner ?? undefined,
    });
    log(
      `claim done for ${shortAddr(owner)}: ${fmtSqk(result.claimed || result.previewed)} SQK ` +
        `(${settings.live ? "sent" : "simulated"}) in ${result.batches} tx(s)`,
    );
  });
}

async function merge() {
  applyOverrides();
  banner();
  resolveOwner();
  await withVerified(async () => {
    const result = await runMerge({ maxMerges: settings.maxMergesPerTick, owner: readOnlyOwner ?? undefined });
    log(`merge done: ${result.merges} pair(s)`);
  });
}

async function mine() {
  applyOverrides();
  banner();
  const owner = requireWallet();
  await withVerified(() => {
    log(`mining as ${owner} · poll ${settings.pollSeconds}s · autoMerge=${settings.autoMerge}`);
  });

  let running = true;
  const stop = (signal) => {
    log(`${signal} received — finishing current tick then exiting`);
    running = false;
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  let tick = 0;
  while (running) {
    tick += 1;
    try {
      await verifyGraph({ quiet: true }); // re-check the graph every tick (governance can upgrade)
      const eth = await publicClient.getBalance({ address: owner });
      if (eth < 10n ** 15n) logWarn(`low gas balance: ${formatEther(eth)} ETH`);

      log(`── tick ${tick} ──`);
      await runCheckpoint({ maxIterations: settings.maxCheckpointsPerTick });

      const claimed = await runClaim({ minSqk: settings.minClaimSqk });
      if (settings.autoMerge) await runMerge({ maxMerges: settings.maxMergesPerTick });

      const proto = await readProtocolState();
      log(
        `tick ${tick} summary: checkpointRound ${proto.miningState.processedThroughRound} · ` +
          `networkWeight ${fmtInt(proto.miningState.totalWeight)} · claimed ${fmtSqk(claimed.claimed, 4)} SQK`,
      );
    } catch (err) {
      logWarn(`tick ${tick} error: ${errorText(err)}`);
    }

    if (!running) break;
    await sleep(Math.max(5, settings.pollSeconds) * 1000);
  }
  log("miner stopped");
}

function help() {
  console.log(`
Squeekchain mining CLI (SqueekMining v6, Sepolia)

Usage: node src/cli.js <command> [--live] [--ids 1,2,3] [--min-claim 5] [--no-merge] [--address 0x…]

Commands
  verify       verify proxies, implementation versions and the contract graph
  status       dashboard: network state, your squeeks, power share, claimable SQK
  checkpoint   call checkpoint() while SqueekCore has settled rounds (permissionless)
  claim        claim SQK for all Squeeks you own (batched, 32 IDs per tx)
  merge        merge same-level pairs to raise power
  mine         loop: checkpoint → claim → merge, every POLL_SECONDS

Flags
  --live          broadcast transactions (otherwise everything is simulated)
  --ids a,b,c     limit to specific token IDs instead of scanning Transfer logs
  --min-claim N   only claim when a batch has at least N SQK
  --address 0x…   inspect/preflight another owner read-only (never broadcasts)
  --no-merge      skip merging inside mine

Config lives in .env — see .env.example. Addresses: mining ${DEFAULTS.mining}
`);
}

const commands = { verify: () => verifyGraph(), status, checkpoint, claim, merge, mine, help };

const main = async () => {
  const fn = commands[command];
  if (!fn) {
    log(`unknown command "${command}"`, "error");
    help();
    process.exit(1);
  }
  await fn();
};

main().catch((err) => {
  log(errorText(err), "error");
  process.exit(1);
});
