# DATA DIET + LIVE WHEEL — blocked qualification (2026-11-04)

**Not ready for run-live or merge.** PR #3 remains open. All execution in this report was offline/mocked. No test:live, real wallet signing, keeper, merge or manual deployment was performed.

## Implementation committed

- Endpoint-specific v9 display API guards, release/identity binding, IndexedDB profile+release keys, static configuration/pins and token+level art tiers (24h), dynamic last-good tier (15min), account/activity no-store, ETag/304 and shared rate-class/Retry-After budgets.
- API display values are separate from action snapshots. Canonical-only SDK wallet-discovery namespaces cannot reuse old API-hint discovery entries. UI action IDs are reconstructed from a fresh canonical inventory; identity/mutable wiring/ownership checks and simulation remain in the original SDK pipeline.
- One completion-driven wheel poller: ACTIVE/online 5s, IDLE/stale 60s; hidden-tab pause. No old 15s/45s loops. Frontier changes trigger account/economy reads; provisional block rows are confirmed against Core round and block height.
- Persisted explicit disconnect/revoke attempt, account-empty/switch handling, wrong-chain action guards, permissionless production Checkpoint UI (no NFT inventory gating).
- API provenance is in tooltips. Four new light/dark, desktop/mobile API-wheel screenshots are synthetic evidence, not live qualification.

## Validation and stop condition

- Current build: **166,257 bytes gzip**, all **8** JavaScript responses including lazy modules; budget 250,000. See `data-diet-js-size.json`.
- Full offline suite: **18/18 scripts PASS** after final production edits.
- Browser run 1: **157 passed / 5 failed**. Fixed stale Trust block, legacy copy expectations, and the incomplete RPC-failure fixture; attempted to fix busy-state Checkpoint re-enabling.
- Browser run 2: **161 passed / 1 failed** of 162. The **same** `test/display-browser.spec.mjs` wrong-chain Checkpoint assertion failed again: after `chainChanged('0x1')`, the Checkpoint button remained enabled. **Stopped under the two-failure rule; no third attempt or further fix.**
- Last-good spec coverage passes: two failed polls retain numbers with age, mismatch clears/stops, 15-minute expiry becomes Unknown; schema-version rejection, release/implementation/installation mismatch, explicit-unavailable eviction, ETag/304, 429 Retry-After, no-store accounts, IndexedDB namespaces, art invalidation and production fork-code exclusion.
- Failure evidence: `data-diet-chain-change-failure.md`, `../screenshots/chain-change-checkpoint-failure.png`. The failure does not constitute authorization to weaken the assertion. Subsequent disconnect/reload assertions in that browser test were not reached and must not be described as passing.
- ABI/export/deployment record and protected `test/components.mjs` were not modified by this work.

## Request-count evidence (incomplete — do not treat as acceptance)

Counts below are **HTTP requests**, not JSON-RPC methods within a batch. EIP-1193 wallet reads are excluded; the browser fixture's public peer HTTP calls are included. v9 values were recovered passively from the second-run Playwright trace before its failing chain assertion, without rerunning the failed step.

| Profile / scenario | API HTTP | RPC HTTP | API share | Evidence |
|---|---:|---:|---:|---|
| v9 cold network + wheel/feed bootstrap | 6 | 0 | 100% | Production app, intercepted responses |
| v9 explicit Refresh (NOT a warm cached reload) | 2 | 0 | 100% | Production app, intercepted responses |
| v9 wallet connect, including dual-profile chooser | 1 | 6 | 14.29% | Account panel API; public-peer RPC chooser checks; excludes wallet-provider reads |
| v9 10min ACTIVE, no frontier changes, after bootstrap | 240 | 0 | 100% | Virtual-time API client/poller: 120 status + 120 event polls |
| v9 10min IDLE, no frontier changes, after bootstrap | 20 | 0 | 100% | Virtual-time API client/poller: 10 status + 10 event polls |
| v6 new display cold/warm/wallet/10min | — | — | — | **Not measured end-to-end; outstanding** |
| v9 warm cached reload | — | — | — | **Outstanding; explicit Refresh is not substituted for this** |

Virtual polling bootstrap is 4 API reads and is excluded from the 10-minute rows. No account/economy refetch occurred while frontiers were unchanged. Hidden pause is covered by the offline scheduler test. These are not ten minutes of wall-clock public endpoint observation.

Existing *SDK-only* baselines remain in `v6-request-budget.json` (22 cold network / 12 warm network / 15 wallet) and `v9-request-budget.json` (15 / 13 / 20 cold wallet / 14 warm wallet). They exclude whole-page API bootstrap and are **not directly equivalent** to the new browser HTTP scenarios. Do not claim a before/after percentage from unlike scopes. The complete comparable cold/warm/wallet and ACTIVE/IDLE v6/v9 table, including wallet-provider reads, remains a qualification task after the browser blocker is resolved.

## Fork fallback

Foundry installation was attempted twice: the standard installer failed reaching `foundry.paradigm.xyz`; the GitHub-sourced foundryup script then failed reaching its Rust installer on `raw.githubusercontent.com`. No further Foundry retries.

Hardhat 3 is installed as a **devDependency**. Its node help validates `--fork` and `--chain-id`; the dev config and Playwright discovery list eight fork workflow tests. See `../../dev/fork/README.md`. **No upstream-backed fork or fork workflow was executed**; there are no fork PASS claims. The local fork harness, mock wallet bridge, peer adapter and Try-a-holder shortcut are absent from the production allowlist/import graph.

## Remaining blockers

1. Resolve wrong-chain Checkpoint re-enabling without weakening the regression; requalify the full offline/mocked suites.
2. Complete disconnect/reload/account-switch browser qualification, comparable request measurements and additional failure/TTL/frontier browser coverage.
3. Validate the opt-in fork harness against a reachable local Sepolia fork; all eight workflow outcomes depend on actual canonical holder balances, custody and cooldowns and fail rather than fabricate assets/eligibility.
4. Only after green qualification should the user trigger run-live on the pushed head. No merge authorized here.
