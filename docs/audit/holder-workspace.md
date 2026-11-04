# Phase 4 — holder workspace

Date: 2026-11-04. Draft PR: [#4](https://github.com/CryptoExplor/Squeekchain-console/pull/4), targeting `main` from `arena/285786f4-squeekchain-console`.

Qualified code head: **`377b8e24a48218fbe27a108b78132f1c4de4b8e0`**. Base: merged PR3, **`8a629c606cd3179cb3dd2412aac63a78f28620a9`**. The final evidence-only head is recorded in the PR body; it changes documentation/screenshots/request measurements, not application code.

## Implemented

- **Path to level:** fresh SDK-owned inventory only, recursive lowest-donor-burn path, explicit custody prerequisites, dependency order, target selection and final level/power. Preference among equivalent donors is same custody, then earliest ready height, then ID. Minimal burn counts are compared with a brute-force search for all level-1/2 donor assignments with a level-1 survivor, target 3 and inventories of one to six tokens. This is not a gas optimizer. A missing path stops at its earliest unavailable dependency; “needs N” is the next-step deficit, not a shopping list for the entire target.
- **Do next step** preselects one existing merge panel. It neither simulates a burn before typed `BURN-<donor>` nor sends any transaction. Mixed custody first preselects the existing Deposit/Withdraw action; it does not silently move NFTs. A fresh canonical inventory is reread at selection, followed by the existing same-block verification, live ownership and simulation at review/signing. Every merge remains one donor and one wallet signature, never an aggregated burn.
- **Cooldown:** completed Squeek blocks and a current-pace estimate. Pace needs two fresh ACTIVE measurement frontiers; stale, IDLE, future, regressing and inconsistent samples clear it. No genesis-average estimate. Where an appropriate current measurement source is unavailable—including the v6 path—ETA is **Unknown**, not a fabricated clock guarantee. Pending activation is also conservative/Unknown; a cooldown estimate is not transaction eligibility.
- **Unified SQK:** a single card, Claim, and v9 Claim and stake. The amount is from the real SDK claim preview or Unknown, never indexed API rewards. A differing recipient is shown in full. The existing v6 `claim(0, ids)` handling remains: sorted live owned IDs, zero-individual-amount IDs retained, up to 32 per prepared call, sequential larger batches and a fresh simulation for each submission. v6 has no claim-and-stake operation; that action stays hidden rather than suggesting a nonexistent contract capability.
- **Per-Squeek route:** `#/<profile>/squeek/<id>`, IDs 1–9999; card/title/art navigation, large cached art, traits, owner, level/power, custody, readable merge status/height and per-token rewards where available. v9 token rewards remain Unknown because no supported per-NFT reward preview is assumed. Actions require displayed inventory membership and a matching connected owner; those hints do not authorize anything. Clicking an action rereads canonical inventory before the existing fresh action checks. Non-owned IDs are read-only. Burned/stray records never enable actions.
- **Watch links:** `#/<profile>/address/<address>`; strict EIP-55/nonzero validation, Copy link, Viewing/Exit, disabled actions even for one's own address, and independent connected-wallet identity. Watch scope survives token navigation, an actual page reload, Back/Forward and Exit via session-history display state. That state cannot supply signing identity or holdings. Address tabs preserve their watch route. Invalid links fail closed.
- **Activity:** account activity API, human action lines/amounts/age/transaction links, owner/profile-isolated local lifecycle records, event-ID dedupe plus pending/indexed transaction-hash dedupe, nextCursor pagination, one bounded restart for the official HTTP 409 `{"error":"cursor_invalidated"}` form, repeated-cursor detection and a 100-page cap. Account requests omit credentials and use no-store. Per-token history filters the current holder's account feed by token/survivor/donor ID; it does not pretend to reconstruct every prior owner's lifetime feed. v6 displays matching local records plus Unknown for unavailable remote history. Its token history is Unknown, not empty/proven zero.
- **Earnings:** lazy seven-UTC-day chart and accessible exact amounts, lifetime claimed/compounded, real zero preserved and absent dates explicit gaps/Unknown. Hidden when unavailable and for v6.

No backend, proxy, new ABI, deployment-pin change, signing keys, transaction-authoritative API data, Subtract helper copy or added affiliation footer. Mainnet remains Not deployed/no chain reads. Existing wallet store, EIP-6963, cancellation, late-hash activity, toast positioning, raw technical-details disclosure and trust checks are retained.

## Qualification

**PASS** — final complete run at the qualified code head: 21 offline scripts and **279/279 mocked browser tests (3.6 minutes)**. These are synthetic/offline tests, not public-chain or fork qualification.

- `npm test`: **21 offline scripts**. Includes both actual-SDK token reads, dual-peer identity/wiring safety, all prior regressions and the new pure-model suite.
- `npm run test:browser`: **279 mocked browser tests** (246 retained + 33 holder-workspace tests). Includes the protected old UI paths, both profiles, watch ownership/reload/history, no-signing fixtures, late profile response discard, cursor restart and all 20 new captures.
- `npm run build`: **186,461 bytes gzip across all 18 production scripts**, individually compressed, including every lazy script. **63,539 bytes below 250,000**. Full per-script accounting: [holder-workspace-js-size.json](holder-workspace-js-size.json).
- `test/components.mjs` is byte-for-byte unchanged, including line 65. SHA-256: `c07d1f504601cb70ec29c83d877022d8d062816689d5736297e581a7591633ce`.
- ABI/pin files, tool manifest and MCP/tool surface are unchanged. New SDK read helpers reuse the verified same-block context; no handwritten ABI.
- `test:live`, public signing, fork execution, manual deployment and PR merge: **not run**.

### Request accounting

Counts are synthetic actual HTTP envelopes unless stated otherwise. Feature-only measurements exclude app-shell/context bootstrap; they must not be mistaken for all-page real-network latency measurements.

| Operation | Cold | Warm | Scope/evidence |
|---|---:|---:|---|
| v6 token detail + first art | 23 | 10 | Cold SDK detail+art; warm detail with cached art, no image fetch; [JSON](v6-squeek-page-budget.json) |
| v9 token detail + first art, SDK fallback | 26 | 13 | No display API; cold detail+art, warm detail/cached art; [JSON](v9-squeek-page-budget.json) |
| v9 token detail API display | 2 API / 0 RPC | 2 API / 0 RPC | `/squeeks/8888` + no-store account activity; image is cached data SVG, no image HTTP; [JSON](v9-squeek-page-api-budget.json) |
| v6 network status | 13 | 10 | Existing dual-peer verification/wiring HTTP budget; wallet status 13 |
| v9 network status | 15 | 13 | Existing dual-peer verification/wiring HTTP budget; cold/warm wallet 20/14 |

The v9 SDK-only cold detail+art case is 26, not concealed as ≤25. Every measured **warm** SDK path remains ≤25; cold v9 wallet remains within v6 +8. The production intercepted-browser connected-wallet fixture now records 10 RPC/9 wallet reads rather than the earlier 6/7 because the claim card requests a canonical preview; [updated complete browser accounting](data-diet-browser-art-counts.json). Second-visit artwork network requests remain **0**. No API number or these display counters enters transaction calldata.

### Dev-only fork extension — unrun

`dev/fork/holder.spec.mjs` adds four explicit-loopback workflows: planner Do next step → ordinary typed-BURN merge and unified Claim, for both profiles. They use existing real holder state, local impersonation/funding, normal SDK preparation/simulation, local receipt reads, and per-case snapshot/revert. See [fork setup](../../dev/fork/README.md).

Syntax and `playwright --list` discovery: **12 tests in 2 files** (8 existing +4 new). No fork URL or holder pair was supplied; **zero fork tests executed**. No PASS is claimed for these workflows. Dev/fork files and mock-wallet bridges are excluded from `dist/` by the explicit production build allowlist and tested exclusion checks.

## Screenshots and review

20 new deterministic captures: both profiles × five views × 390/1280. Captures wait for fonts/art and return to scroll top, so the sticky header is not painted mid-document. A 390px input flex-basis issue found during visual review is fixed and height-asserted. No horizontal overflow, page errors or send requests in the capture cases. Older phase screenshots are not rewritten as new Phase 4 evidence.

| Profile / view | 390 | 1280 |
|---|---|---|
| v6 planner | [PNG](../screenshots/holder-sepolia-v6-planner-390.png) | [PNG](../screenshots/holder-sepolia-v6-planner-1280.png) |
| v6 token | [PNG](../screenshots/holder-sepolia-v6-squeek-390.png) | [PNG](../screenshots/holder-sepolia-v6-squeek-1280.png) |
| v6 watch | [PNG](../screenshots/holder-sepolia-v6-watch-390.png) | [PNG](../screenshots/holder-sepolia-v6-watch-1280.png) |
| v6 activity | [PNG](../screenshots/holder-sepolia-v6-activity-390.png) | [PNG](../screenshots/holder-sepolia-v6-activity-1280.png) |
| v6 earnings unavailable | [PNG](../screenshots/holder-sepolia-v6-earnings-390.png) | [PNG](../screenshots/holder-sepolia-v6-earnings-1280.png) |
| v9 planner | [PNG](../screenshots/holder-sepolia-v9-planner-390.png) | [PNG](../screenshots/holder-sepolia-v9-planner-1280.png) |
| v9 token | [PNG](../screenshots/holder-sepolia-v9-squeek-390.png) | [PNG](../screenshots/holder-sepolia-v9-squeek-1280.png) |
| v9 watch | [PNG](../screenshots/holder-sepolia-v9-watch-390.png) | [PNG](../screenshots/holder-sepolia-v9-watch-1280.png) |
| v9 activity | [PNG](../screenshots/holder-sepolia-v9-activity-390.png) | [PNG](../screenshots/holder-sepolia-v9-activity-1280.png) |
| v9 earnings | [PNG](../screenshots/holder-sepolia-v9-earnings-390.png) | [PNG](../screenshots/holder-sepolia-v9-earnings-1280.png) |

Every newly introduced or surfaced visible/accessibility string, dynamic template, reused label and validation error is inventoried in [holder-workspace-strings.json](holder-workspace-strings.json). Baseline literal replacements: `enter a valid 0x address` → `Invalid address`, and `Account activity` → `Activity`. All other baseline copy remains. No method/storage/slot/digest/revision prose was introduced into the holder views.

## Failure accounting and scope of evidence

Distinct failures resolved: watch connect/Exit history overwrite; a `.btn` rule overriding a hidden pagination button; an EIP-55 test comparing checksummed output with a lowercase fixture; and one old restoration expectation that implicitly exited watch mode for the connected owner. The old test now requires read-only plus explicit Exit; its wallet identity and action-disabled checks remain. No identical failing fix was attempted more than twice. Later full runs were deliberately interrupted for review-found changes (official cursor error format and readable detail merge states), not counted as passes. Only the final complete run is qualification evidence.

Official references: [API](https://docs.squeekchain.com/developers/api.md), [account activity schema](https://docs.squeekchain.com/assets/api/account-activity.json), [owner actions](https://docs.squeekchain.com/developers/owner-actions.md), [mining](https://docs.squeekchain.com/developers/mining.md). API is display-only; chain amounts, ownership, eligibility and transaction preparation remain the SDK's responsibility.

## External checks

At the pushed code head `377b8e2`, Cloudflare Pages' automatic preview check succeeded. GitHub's offline workflow was still running at reporting time. Vercel returned its existing account-level deployment-block status; no attempt was made to change that service or manually deploy. These integration statuses are separate from the completed local 21-script/279-browser qualification and will update on the evidence-only PR head.
