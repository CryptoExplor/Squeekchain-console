# PR #3 — RPC / Multicall and review follow-up

Date: 2026-11-04 (Asia/Calcutta). Same branch: `arena/417b8688-squeekchain-console`. No live qualification is claimed. Inline comments and the six submitted review bodies were read and checked against current code, not blindly applied.

## Supplied errors and scope

- `eth_getStorageAt`: **Identity batch HTTP failure**. The supplied text does not identify the HTTP status or failing endpoint. The deterministic fix covers unsupported-batch HTTP responses (including 403/405), plus transient gateway 500/502/504 fallback to checked singles. It does not claim to fix unavailable credentials, rate limits, or browser network/CORS restrictions. 401/429/503 do not trigger fanout. Malformed successful responses and identity mismatches still stop; no failed verification can populate the session cache.
- Wallet `eth_getLogs` against EthPandaOps: **getLogs request exceeded max allowed range**, range `0xb716d9–0xb7c6a0` (45,000 inclusive blocks), staking `0x4b67b739dFd832f4EAC67a7Aa3bc244fB74cea4F`. The exact phrase was missing from range classification, so it stopped before the intended HTTP availability fallback and interval shrink. Nested viem-style payloads now exercise both paths offline. Redacted diagnostics report **Log range limit**, not an unexplained generic JSON-RPC error.
- Ordinary Multicall3 cannot obtain arbitrary foreign EIP-1967 storage or historical logs. Those remain guarded RPC operations. ETH balance joins same-block Multicall3 contract reads; v9 art uses one per-token-tolerant multicall. Proven zero NFT power skips staking history without pretending power is a token count.
- Confirming every ID in an API subset cannot prove staking completeness. Complete staking inventory now requires canonical indexed history and same-snapshot depositor/custody confirmation. No staking API request is spent when it cannot prove completeness; complete wallet hints still need snapshot balance and owner confirmation. Unavailable staking history remains Unknown. The SDK also rejects an empty confirmed staking set when snapshot NFT power is positive; it cannot commit verification or return a false zero in that inconsistent case.

## Inline findings

Discussion links use `https://github.com/CryptoExplor/Squeekchain-console/pull/3#discussion_r<ID>`.

| ID | Finding | Disposition / evidence |
|---|---|---|
| 4457012763 | Unopened IndexedDB clear falsely succeeds | Fixed: durable open failure rejects clear; offline blocked-open regression. Optional read/write memory fallback remains available. |
| 4457012799 | Cleared checkpoint is rewritten after an await | Fixed: remove redundant memory write, generation-gate queued durable operations; overlapping set/clear regression. |
| 4457012810 | Sepolia fixture returns trusted wallet data with untrusted network data | Superseded: both profiles now have identity pins and equal runtime guards. The obsolete unverified-v9 fixture policy must not return. Network/wallet/verify fixtures are consistent; profile-specific verification evidence strengthened below. |
| 4457012823 | Stale tab restores cleared Activity | Fixed: synchronize shared storage before reads/saves and on storage events; regression clears while another receipt read is awaited. No resubmission path. |
| 4457012833 | Failed direct wallet read leaves Trust stale | Already fixed in 3d1b52c: wallet catch clears `state.net`, ETH and placeholders; `showReadFailure` clears current Trust/check time. New actual-range-error browser cases explicitly assert Unknown block/time and disabled actions. |
| 4457012842 | Clear Activity confirmation reopens Settings on a new profile | Fixed: capture/check load generation before clear or reopen. Browser test switches while confirmation is open and preserves the pending record. |
| 4457686718 / 4457782052 | Mutable v9 wiring is cached | Already fixed in prior safety pack: all wiring/layout/version/paused calls run outside the code-cache miss branch, fresh at every snapshot. Existing corruption regressions remain green; cache commits follow the final guard. |
| 4457686734 | Legacy untagged transactions migrate to v9 | Fixed: missing profile migrates to v6; explicit legacy alias still uses the canonical input migration. Offline coverage checks both cases. |
| 4457781953 | MCP loses selected adapter failure attempts | Fixed: shared `readToolResult` collects diagnostics from the adapter actually called. MCP marks structured errors `isError`; no signing/submission added. |
| 4457781993 | Staking schemas advertise unsupported v6 | Fixed: nine staking previews/preparations and applicable browser requests advertise only `sepolia-v9`; shared v6/v9 tools retain both profiles. Manifest parity and schema regressions pass. |
| 4457782012 | One failed artwork lookup drops all valid NFTs | Fixed with one `allowFailure: true` tokenURI multicall and per-token metadata parsing/error result. Regression preserves tokens 1 and 3 when 2 fails. Whole-operation trust/final-snapshot failures still reject the operation. |
| 4457782061 | Browser tool error uses active, not serving, adapter | Fixed with the shared diagnostic wrapper; browser test explicitly requests v6 while v9 remains active and checks only v6 attempts. Public cross-origin adapters remain isolated, without wallet/session defaults. |
| 4458812952 | postMessage same-origin label is too broad | Fixed with the current stricter policy: same-origin read/prepare/request; cross-origin only five explicit-owner reads, never prepares or requests. Broad cross-origin prepare access suggested by the old review would be incorrect now. |
| 4460240748 | Incomplete staking hints accepted as complete | Fixed: no API subset short-circuit; indexed history establishes completeness. Partial-hint regression discovers omitted IDs; unavailable history cannot turn hints into a count. |

## Review-summary findings

| Review | Finding | Disposition |
|---|---|---|
| 5755212227 | Mainnet active tab controls a hidden panel | Fixed: undeployed routes select static Info, not a hidden deployment panel; Mainnet screenshots assert Info selected/visible, Unknown Trust and hidden chain-content container. No deployment adapter exists. |
| 5755212227 | Policy row assertion checks only count | Strengthened: independently assert each fixture row's level/weight/cooldown as well as row count. |
| 5755212227 | Saved RPC tested only behind adapterFactory | Added browser tests for both production adapters, no factory, save through Settings and intercept requests reaching the saved custom endpoint. All other outbound requests are blocked; no endpoint is probed live. |
| 5755212227 | Clear notification not asserted | Added explicit last-onChange assertion after clear; existing browser pending-notice coverage retained. |
| 5756184575 | Failed wallet refresh should recover Trust | Already fixed by clearing the failed snapshot and check time, not by immediately enqueueing another network read. Immediate duplicate retries would conflict with current cooldown/recovery policy. Actual range-error browser tests cover this. |
| 5756184575 | Verify mock lacks `trusted` and masks baseline failure | Fixed mock and positive baseline assertion before testing failed verification. |
| 5756184575 | Expand live wallet/art/postMessage coverage | Deferred: not performed or claimed in this offline fix pack. User-controlled live qualification and broader live-test planning remain separate; no run-live label/dispatch, live probes, signing, or keeper. |
| 5757465603 | Assert profile passed to v6 fixture adapter | Added recorded factory keys and explicit v6 assertions in restored owner-action cases. SDK ABI/custody tests remain separate from injected browser fixtures. |
| 5757465603 | Programmatic focus masks missing Tab reachability | Fixed: focus wallet predecessor once, then assert each header control after actual Tab navigation. |
| 5759400952 | Activity rows omit deployment | Fixed: each row includes its canonical profile label; browser asserts the pending v9 label. |
| 5759400952 | No browser exercises minified output | Added dist smoke: imports app/bundle/components/Activity and lazy Settings/Developers from freshly built dist assets, checks rendered wallet and zero sends, and fails on page errors. Web-source browser coverage remains intact. |
| 5759400952 | v9 header verification fixture is indistinguishable from v6 | Added distinct full-verification block evidence across network/wallet/verify responses and title assertion after switching to v9. No production verification bypass. |

## Acceptance evidence and boundaries

Current build, complete deterministic suites, screenshot count and mocked wire budgets are recorded in [STATUS](../STATUS.md#validation-and-request-budgets), [gzip report](phase2-js-size.json), [v6](v6-request-budget.json), [v9](v9-request-budget.json), and [screenshots](../screenshots/README.md). The unchanged two-wallet/two-staked v9 fixture falls from 21 to 20 initial wallet envelopes and 15 to 14 warm; v6 remains 22/12/15 cold-network/warm-network/wallet. Network v9 remains 15/13. These are healthy mocked HTTP envelope counts, not a bound for a long cold history, tiny provider ranges, reorg replay or unavailable endpoints.

The original v9 ABI, deployment record and identity export remain unchanged, as does `test/components.mjs:65`. Two independent identity peers, same-block mutable checks, final hash guards, owner custody, explicit approvals, BURN confirmation and pre-sign simulation remain mandatory. No live RPC, test:live, qualification dispatch, signing, keeper, merge, main push or manual deployment was performed. The existing Cloudflare branch-preview integration may build after the authorized branch push.
