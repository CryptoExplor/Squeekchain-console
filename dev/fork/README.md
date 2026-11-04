# Dev-only Sepolia fork harness (not executed qualification)

None of this directory is imported by the production app, SDK, CLI, MCP or `build.mjs`. `npm test` checks the generated production scripts for the dev-only marker strings. Hardhat is a devDependency, not part of the browser bundle.

## Explicit local workflow

```sh
# Terminal one — public/read-only upstream URL, never a key.
SEPOLIA_FORK_URL=https://your-sepolia-rpc npm run fork:start
# Prefers anvil if installed. Otherwise runs:
# npx hardhat node --config dev/fork/hardhat.config.js \
#   --fork <upstream> --chain-id 11155111 --hostname 127.0.0.1 --port 8545

# Terminal two — the only permitted wallet RPC destination is loopback.
FORK_URL=http://127.0.0.1:8545 npm run test:fork

# Optional dev watch-only UI, separate server on 4174:
npm run fork:web
```

The fork launcher requires an explicit upstream and does not start one implicitly. The test runner does not call `test:live`. The dev-only server inserts a **Try a holder** watch shortcut from validated `nft.deposited` API events; that account is just a viewing candidate, not transaction authority.

The eight Playwright workflows cover merge, mergeDeposited, deposit, withdraw, claim, claimAndStake, stake and unstake. A local EIP-1193 mock forwards unsigned transactions to the loopback impersonation node; no private key, real-wallet popup or public-network submission is used. Each test snapshots/reverts local state. Only fork ETH balance is supplied; NFTs and SQK are never fabricated. API candidates must pass the real SDK's canonical on-chain inventory, ownership, code/slot/wiring and simulation checks. Missing assets, zero claimability or no ready same-level pair fail explicitly, not skip or bypass eligibility.

Two separate local client views exercise the snapshot/identity adapter; they are **not independent public RPC peers** and provide no live peer-independence evidence. The test adapter stays outside the production graph. Twelve blocks are mined locally after state changes so the unchanged SDK's head-minus-12 snapshot sees them.

## Installation/execution evidence

2026-11-04: Foundry installation failed twice on sandbox-inaccessible download hosts. Hardhat installed successfully; `hardhat node --help` confirms the required flags, and Playwright `--list` discovers all eight tests. **A real upstream-backed fork and the workflows were not run.** They must not be counted in the offline/browser PASS totals or used as live qualification.

## Phase 4 holder workflows

`holder.spec.mjs` adds four browser workflows (both profiles × planner merge / unified Claim) on an explicit local fork. Set `FORK_HOLDER_V6` and `FORK_HOLDER_V9` to real holder addresses already present at the fork block. The node impersonates those accounts locally and adds only fork ETH, never fabricated NFTs/SQK. The merge workflow opens Path to level, uses Do next step, types the actual `BURN-<donor>` into the ordinary production confirmation, reviews the fresh simulation, submits one merge, and asserts the donor disappears and survivor levels up. Claim follows the unified card and normal re-preview path. Receipt reads stay on loopback; twelve blocks are mined locally after each local transaction. Every case snapshots/reverts.

```sh
FORK_URL=http://127.0.0.1:8545 \
FORK_HOLDER_V6=0xYourExistingV6Holder \
FORK_HOLDER_V9=0xYourExistingV9Holder npm run test:fork
```

This is an explicit user-run command, not part of `npm test`, `test:browser` or `test:live`. Missing prerequisites fail, not skip or weaken checks. The Phase 4 session did not start a fork or execute impersonated transactions: no upstream URL/holder pair was supplied, and live/public signing remains prohibited. Test discovery/syntax and production exclusion are checked separately.
