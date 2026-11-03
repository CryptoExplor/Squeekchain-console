# Wheelhouse — equal profiles and subtract pass

**Date:** 2026-11-03 (Asia/Calcutta). **Draft PR:** [#3](https://github.com/CryptoExplor/Squeekchain-console/pull/3). **Branch:** `arena/417b8688-squeekchain-console`. Phase 3 (`b705683`) remains accepted; this extends that draft. No main push, merge or deployment. The `thewheel` workflow name is unchanged.

## Current scope and result

The user-supplied identity export resolves the earlier identity-evidence blocker. **Sepolia v6 and Sepolia v9 are equal, selectable profiles**, with live verification or stopped states, not version-based transaction restrictions. Mainnet is **Not deployed**.

The user raised the **total external JavaScript gzip cap to 250,000 bytes** (`budgetBytes: 250_000` in `build.mjs`). This supersedes both the previous 146,800-byte acceptance limit and the older 200,000-byte build limit. Developers and Settings remain dynamically imported. All seven external JS files, including lazy modules, count toward the cap, independently gzipped—not one combined compression stream. Current total: **152,951 bytes** ([breakdown](audit/phase2-js-size.json)).

## Delivery checklist

- [x] Exact attachment preserved as [v9-identity-2026-11-03.json](audit/v9-identity-2026-11-03.json), SHA-256 `fbedcbe2979cf650ff42b1e0f35c679b3afce08da4d13f7b21efe9361e286979`. Sepolia block **12056257**, hash `0x0c8d3619dbfd24c577c119248f472a5c4809cf342651134700b1122731642b22`; Tenderly/PublicNode export fields agree. This is an expected-value seed, **not live qualification of this head**.
- [x] `sdk/deployments.js` seeds six-contract slot/runtime/implementation/version/layout/wiring pins. `sdk/verify-v9.js` checks them at one snapshot, plus chain identity and final two-peer hash agreement. Staking admin comes from the EIP-1967 slot: the ABI has no proxyAdmin function. Staking.launch zero is expected; NFT.launch is checked separately. Core/issuance also check ABI-reported proxy admins. Verified cache writes occur only after the final guard; later operations recheck slots.
- [x] Canonical `sepolia-v6` / `sepolia-v9` keys. `sdk/profile-input.js` is the only compatibility conversion for old `sepolia`, used at hash/storage/MCP input boundaries. `getProfile` rejects legacy/unknown keys. Browser storage/hash are rewritten canonically; Activity records retain the originating canonical profile, including late wallet responses after navigation.
- [x] v9 first-visit default, saved choice, profile-qualified hash routes, both collection balance counts on connect, one-held auto-selection, both-held explicit choice, neither-held retention, Unknown-safe behavior.
- [x] Runtime settlement/readiness for both profiles; mining-live text requires observed round advancement. No fixed frontier or version-derived live state. Pause explanation appears only when Core.paused is true.
- [x] v9 Wallet/Staked Squeeks, indexed deposit-event discovery, same-block depositor plus NFT custody confirmation, separate per-token/broad NFT and exact SQK approval previews. Wallet/staked position details share one multicall.
- [x] v9 NFT/staking merges, mergesOpen reason, exact BURN acknowledgement before any construction/simulation. Claims, claimAndStake, stake, unstake and settled issuance checkpoint use the official ABI. Unstake reviews fee/net/maxFee/deadline; changed fee/outcome or expired deadline stops. Owner wallet signs; agent transports never sign or submit.
- [x] Active-profile on-chain policy table; both address graphs and ABI/pin/staking-source provenance in Info › Contracts. Missing policy readings remain Unknown.
- [x] Subtract pass: removed taglines, obsolete restrictions, repeated checkpoint/non-affiliation copy and art helpers; one footer line. Source icons/accessible names, age on verification badge, one Trust status line and honest Agreed/Not sampled peer list. Concise action/cache labels, empty-state connection action, conditional RPC-secret warning. Merge safety/input remain; unstake review uses a labelled fee/net definition list instead of a base-unit paragraph.
- [x] `sdk/tools.js` single registry for **29 read/prepare tools** (name/description/schema/side effect); generated `web/tools.json`, local MCP, `window.squeek` and postMessage use it. Per-call profile selection and burn guard are shared. No wallet-popup tools in the agent registry.
- [x] Offline v9 action/approval/fee/custody/identity/cache tests and browser action/autopick/Unknown/fee-change/claim-change/burn tests. Existing race, Activity, focus, contrast, header and Mainnet tests retained.
- [x] **44 regenerated mocked captures**: 32 structure/header views plus 12 v9 Squeeks/Merge/Unstake views, light/dark × 1280/390. [Gallery](screenshots/README.md). Mock fixtures do not qualify live contracts.
- [x] Extended `test/live.spec.mjs` to both profiles, read-only. **Did not run it**, dispatch/label a workflow, start a keeper or submit a transaction.

## Phase 2 data-layer checklist

| Requirement | Implementation | Offline coverage / status |
|---|---|---|
| API client rules | `sdk/account-discovery.js`, `sdk/retry-after.js`; telemetry in `web/telemetry.js` | `test/account-discovery.mjs`, `test/review-regressions.mjs`: pagination/context/reorg restart/cancellation, ETag/304, Retry-After <=300s or 30s fallback. API IDs are hints, never transaction authority. |
| Complete wallet ID confirmation | `sdk/discovery.js` | `test/discovery.mjs`, `test/account-discovery.mjs`: snapshot balance count + ownerOf; incremental filtered logs, hint fallback, missing/extra IDs rejected. Unknown is not zero. |
| IndexedDB / memory fallback | `sdk/discovery.js`, `sdk/deposits.js`; Settings clear in `web/settings.js` | Existing persistence/reorg/clear tests plus v9 custody checks. Stored IDs are rechecked, not trusted ownership. Keys are chain/release/contract/account scoped. |
| Request budget | viem multicall, session verification/chain probes, incremental discovery | `test/phase1-safety.mjs`, `test/v9-safety.mjs`; actual mocked JSON-RPC wire counts below. |
| Agent parity / canonical migration | `sdk/tools.js`, `sdk/tool-runtime.js`, `sdk/profile-input.js` | `test/profile-registry.mjs`: exact metadata/schema parity across generated JSON/browser/MCP; legacy key migrates only at boundaries and is rejected internally. |

## Validation and request budgets

- `npm run build`: **PASS**, **152,951 / 250,000 gzip bytes**, all seven external scripts. Settings/Developers lazy loading also asserted in the browser.
- `npm test`: **PASS**, 13 deterministic offline scripts. No external RPC required; test-only synthetic code hashes never override production pins.
- Mocked Chromium: **76 PASS**, last complete run **44.5s**; captures regenerated with `UPDATE_SCREENSHOTS=1`. Roles/test IDs select controls; copy assertions check safety/state, not navigation selectors.
- `git diff --check`: run before commit.

| Profile | Cold network | Warm network | Wallet | Evidence |
|---|---:|---:|---:|---|
| v6 | 22 | 12 | 15 | [v6 wire report](audit/v6-request-budget.json) |
| v9 | 34 | 22 | 34 initial discovery / **24 warm** | [v9 wire report](audit/v9-request-budget.json), two wallet + two staked NFTs |

Warm regression measurements reuse a confirmed snapshot and initialized session/discovery caches, with healthy mocked endpoints and no retries. The <=25 warm gate passes for both profiles. New-block log increments, large inventories, reorgs and unavailable endpoints can require extra discovery/failover requests; these figures are **not a live availability guarantee**. The connect-only two-collection inventory probe is separate from these SDK page-operation measurements. No extra background polling was introduced (age rendering is local only).

Earlier attempts exposed obsolete alias/copy assertions, a mock Multicall3 balance-handler omission, a Mainnet address-display regression, and a 26-request v9 wallet path. These were fixed and followed by the passing full suites; the request reduction preserves custody and identity checks. Earlier failed 146.8 kB-cap measurements are superseded, not acceptance evidence.

## Boundaries and deferred work

No `test:live`, live RPC probe/retry, qualification workflow trigger, real wallet signing, keeper, merge or deploy. Runtime guards remain mandatory; offline tests are not live qualification. Historical Phase 0/Phase 3 evidence does not qualify this source head. Vercel remains the deployment target. Phase 4 planner/per-token redesign, background alerts and Cloudflare extras remain deferred. CLI remains the unsigned v6 helper; equal-profile agent actions are exposed by SDK/browser tools/local MCP.
