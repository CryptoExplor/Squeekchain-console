// Onchain actions: checkpoint() (permissionless), claim() and merge() (owner only).
import { getAddress, parseEventLogs } from "viem";
import { abi, publicClient, getWallet, log, logWarn, errorText, fmtGwei, fmtSqk } from "./chain.js";
import { COLLECTION, addresses, settings } from "./config.js";
import { batchIds, discoverTokenIds, readPositions } from "./portfolio.js";

const MINING = getAddress(addresses.mining);
const NFT = getAddress(addresses.nft);

/**
 * Simulate-then-send wrapper. Respects LIVE=false (dry run) and MAX_FEE_GWEI.
 * Returns { sent, hash, receipt, simulatedGas, events }.
 */
export async function send({ address, contractAbi, functionName, args = [], label, from }) {
  // `from` lets you simulate an owner action for any address without its key
  // (read-only preflight); broadcasting always requires PRIVATE_KEY.
  const sender = from ?? (settings.privateKey ? getWallet().account.address : null);
  if (!sender) throw new Error("no sender: set PRIVATE_KEY or pass --address for a read-only preflight");
  const account = sender;

  let simulation;
  try {
    simulation = await publicClient.simulateContract({
      address,
      abi: contractAbi,
      functionName,
      args,
      account,
    });
  } catch (err) {
    throw new Error(`${label || functionName} simulation reverted: ${errorText(err)}`);
  }

  const gas = await publicClient
    .estimateContractGas({ address, abi: contractAbi, functionName, args, account })
    .catch(() => null);
  const fees = await publicClient.estimateFeesPerGas().catch(() => null);
  const maxFeePerGas = fees?.maxFeePerGas;
  const maxPriorityFeePerGas = fees?.maxPriorityFeePerGas;

  if (maxFeePerGas && Number(maxFeePerGas) / 1e9 > settings.maxFeeGwei) {
    throw new Error(
      `gas too expensive: ${fmtGwei(maxFeePerGas)} > MAX_FEE_GWEI=${settings.maxFeeGwei}`,
    );
  }

  const gasInfo = gas ? `gas≈${gas}` : "gas≈?";
  if (!settings.live) {
    log(`DRY RUN ${label || functionName}: simulation ok (${gasInfo}); set LIVE=true to broadcast`, "warn");
    return { sent: false, simulatedGas: gas, maxFeePerGas };
  }

  const { client, account: signer } = getWallet();
  const hash = await client.writeContract({
    ...simulation.request,
    account: signer,
    ...(maxFeePerGas ? { maxFeePerGas, maxPriorityFeePerGas } : {}),
  });
  log(`${label || functionName} sent: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") {
    throw new Error(`${label || functionName} reverted in block ${receipt.blockNumber} (${hash})`);
  }
  const events = parseEventLogs({ abi: contractAbi, logs: receipt.logs, strict: false }).filter(
    (e) => e.eventName !== "Transfer" || e.address.toLowerCase() === MINING,
  );
  log(
    `${label || functionName} mined in block ${receipt.blockNumber}: gas ${receipt.gasUsed}` +
      (maxFeePerGas ? ` @ ${fmtGwei(maxFeePerGas)}` : ""),
  );
  return { sent: true, hash, receipt, simulatedGas: gas, events, maxFeePerGas };
}

/**
 * Calls checkpoint() while SqueekCore has a newly certified round.
 * Anyone may call it; it funds every stretch of constant power since the last checkpoint.
 */
export async function runCheckpoint({ maxIterations = settings.maxCheckpointsPerTick } = {}) {
  let calls = 0;
  let totalMinted = 0n;
  let lastRound = null;

  for (let i = 0; i < maxIterations; i += 1) {
    const [corePaused, nextRound, roundSettled] = await publicClient.readContract({
      address: MINING,
      abi: abi.mining,
      functionName: "checkpointStatus",
    });

    if (corePaused) {
      log("SqueekCore is paused — checkpoint skipped (claims still work)", "warn");
      break;
    }
    if (!roundSettled) {
      log(`no settled round to checkpoint yet (next round ${nextRound})`);
      break;
    }

    let result;
    try {
      result = await send({
        address: MINING,
        contractAbi: abi.mining,
        functionName: "checkpoint",
        label: `checkpoint(round ${nextRound})`,
      });
    } catch (err) {
      logWarn(`checkpoint failed: ${errorText(err)}`);
      break;
    }

    calls += 1;
    lastRound = Number(nextRound);
    if (!result.sent) break; // dry run: one simulation is enough

    for (const ev of result.events) {
      if (ev.eventName === "Checkpointed") {
        totalMinted += ev.args.amount;
        log(
          `  funded rounds (${ev.args.afterRound}, ${ev.args.throughRound}] · ` +
            `${ev.args.completedBlocks} blocks · ${fmtSqk(ev.args.amount)} SQK minted`,
        );
      }
      if (ev.eventName === "WeightActivated") {
        log(`  activated ${ev.args.totalWeight} total power at round ${ev.args.round}`);
      }
    }
  }

  if (calls > 0 && totalMinted > 0n) log(`checkpoint total: ${fmtSqk(totalMinted)} SQK minted this tick`);
  return { calls, totalMinted, lastRound };
}

/** Claims SQK for every owned Squeek, batched at MAX_CLAIMS (32 IDs) per transaction. */
export async function runClaim({ minSqk = settings.minClaimSqk, tokenIds, owner } = {}) {
  const ownerAddress = owner ?? getWallet().account.address;
  const ids = tokenIds?.length ? tokenIds : await discoverTokenIds(ownerAddress);
  if (ids.length === 0) {
    log("no Squeeks owned by this wallet — nothing to claim");
    return { claimed: 0n, batches: 0 };
  }

  const positions = await readPositions(ids);
  const owned = positions
    .filter((p) => p.holder && p.holder.toLowerCase() === ownerAddress.toLowerCase())
    .map((p) => p.tokenId);
  if (owned.length === 0) {
    log("no live positions owned by this wallet — nothing to claim");
    return { claimed: 0n, batches: 0 };
  }

  const threshold = BigInt(Math.round(minSqk * 1e6)) * 10n ** 12n; // SQK → base units
  let claimed = 0n;
  let previewed = 0n;
  let sentBatches = 0;

  for (const batch of batchIds(owned, Number(await publicClient.readContract({ address: MINING, abi: abi.mining, functionName: "MAX_CLAIMS" })))) {
    const amount = await publicClient.readContract({
      address: MINING,
      abi: abi.mining,
      functionName: "claimable",
      args: [COLLECTION, batch],
    });
    if (amount < threshold) {
      log(`batch [${batch.length} ids] claimable ${fmtSqk(amount)} SQK below MIN_CLAIM_SQK=${minSqk} — skipped`);
      continue;
    }

    // Ownership is checked live, immediately before preparing the claim.
    for (const tokenId of batch) {
      const holder = await publicClient.readContract({ address: NFT, abi: abi.nft, functionName: "ownerOf", args: [tokenId] });
      if (holder.toLowerCase() !== ownerAddress.toLowerCase()) {
        throw new Error(`token ${tokenId} is no longer owned by ${ownerAddress}`);
      }
    }

    try {
      const result = await send({
        address: MINING,
        contractAbi: abi.mining,
        functionName: "claim",
        args: [COLLECTION, batch],
        label: `claim(${batch.length} ids, ${fmtSqk(amount)} SQK)`,
        from: ownerAddress,
      });
      sentBatches += 1;
      if (!result.sent) {
        previewed += amount;
        break;
      }
      const claimedEvent = result.events.find((e) => e.eventName === "RewardsClaimed");
      if (claimedEvent) claimed += claimedEvent.args.amount;
    } catch (err) {
      logWarn(`claim batch failed: ${errorText(err)}`);
    }
  }

  if (claimed > 0n) log(`claimed ${fmtSqk(claimed)} SQK`);
  else if (previewed > 0n) log(`DRY RUN: would have claimed ${fmtSqk(previewed)} SQK in ${sentBatches} tx(s)`);
  return { claimed, previewed, batches: sentBatches };
}

/**
 * Merges pairs of same-level Squeeks: donor is burned, survivor goes up one level.
 * Preflights exactly as the docs require (same level, below max, no pending activation,
 * cooldown satisfied by SqueekCore's completed block height — never by wall-clock time).
 */
export async function runMerge({ maxMerges = settings.maxMergesPerTick, tokenIds, owner } = {}) {
  const ownerAddress = owner ?? getWallet().account.address;
  const ids = tokenIds?.length ? tokenIds : await discoverTokenIds(ownerAddress);
  if (ids.length < 2) {
    log("need at least two Squeeks to merge");
    return { merges: 0 };
  }

  const [positions, coreState, policy] = await Promise.all([
    readPositions(ids),
    publicClient.readContract({ address: getAddress(addresses.core), abi: abi.core, functionName: "state" }),
    publicClient.readContract({ address: MINING, abi: abi.mining, functionName: "collectionPolicy", args: [COLLECTION] }),
  ]);
  const height = coreState.blockHeight;

  const minePositions = positions.filter(
    (p) => p.holder && p.holder.toLowerCase() === ownerAddress.toLowerCase(),
  );

  const eligible = minePositions.filter((p) => {
    if (p.level >= policy.maximumLevel) return false; // max level cannot merge
    if (p.pendingRound !== 0n) return false; // power not applied yet
    if (p.nextMergeBlock > height) return false; // cooldown counted in completed blocks
    return true;
  });

  const byLevel = new Map();
  for (const p of eligible) {
    const key = Number(p.level);
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(p);
  }

  let merges = 0;
  for (const [level, group] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    group.sort((a, b) => (a.tokenId < b.tokenId ? -1 : 1));
    while (group.length >= 2 && merges < maxMerges) {
      const survivor = group.shift(); // lowest token ID survives
      const donor = group.shift();
      try {
        const result = await send({
          address: MINING,
          contractAbi: abi.mining,
          functionName: "merge",
          args: [COLLECTION, survivor.tokenId, donor.tokenId],
          label: `merge(survivor ${survivor.tokenId} ← donor ${donor.tokenId}, L${level})`,
          from: ownerAddress,
        });
        merges += 1;
        if (!result.sent) return { merges };
        const ev = result.events.find((e) => e.eventName === "PositionsMerged");
        if (ev) {
          log(
            `  token ${ev.args.survivor} is now level ${ev.args.level} ` +
              `(active ${ev.args.activeWeight}, effective round ${ev.args.effectiveRound})`,
          );
        }
      } catch (err) {
        logWarn(`merge ${survivor.tokenId}+${donor.tokenId} skipped: ${errorText(err)}`);
      }
    }
    if (merges >= maxMerges) break;
  }

  if (merges === 0) log("no mergeable pairs right now (need two same-level Squeeks off cooldown with no pending power)");
  return { merges };
}
