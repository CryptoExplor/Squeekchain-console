# Wheelhouse — header-polish follow-up ready for draft review

**Date:** 2026-11-03 (Asia/Calcutta). **Base:** PR #2 merged at `22263e775461101b7d1dcb24933edd2ccd5a281f`. **Follow-up branch:** `arena/417b8688-squeekchain-console` (separate draft against main). App rebrand approved; repository name unchanged.

## Phase plan and pre-merge qualification gate

**Phase 0: complete.** The opted-in **thewheel** live gate [run **41618128325**](https://github.com/CryptoExplor/Squeekchain-console/actions/runs/41618128325) passed on **`dd0afff7a88250d5d8aca88427ffe449c9e387c4`**. GitHub metadata independently confirms the exact head SHA, successful live-read step, public RPC probe, Chromium setup and artifact upload. [Qualification evidence](audit/live-qualification-run-41618128325.json) records the run, job and artifact IDs. Artifact contents were not downloaded; no specific block/hash/latency metrics are claimed.

This qualifies **dd0afff**, not the new header-polish head. Before PR #2 merged, [run 41650460910](https://github.com/CryptoExplor/Squeekchain-console/actions/runs/41650460910) also passed on its final source `b26f7f94fb0c28601408f4fade93f87bc2f84b1f`. Neither historical pass qualifies this follow-up; manual browser review and final-head qualification are not waived.

**Phase 1 merged via PR #2.** The user requested a separate header-polish draft against main. Preserve the existing architecture and every approved safety rule; no restart or direct-main push.

| Phase 1 work | Current status |
|---|---|
| First task — browser RPC availability/fallback and diagnostics | Implemented in `c128c83d4171bece61d0226f0690abb366110c2f`; offline Node and bundled Chromium regressions pass. Typed cooldown/transport errors fail over, including browser fetch/CORS-style TypeErrors; cause traversal retains trust hard stops. Tool errors expose redacted endpoint, method and cause diagnostics. This is not a verified diagnosis of run `41606508624`. |
| Wheelhouse branding and light design system | Continued with a consolidated neutral/gold/blue token palette, independent-console wordmark subtitle, readable 11px operational captions, semantic primary/danger controls, accessible theme state and matching browser chrome colors. Thirty-five mocked Chromium checks pass, including the 24-state review gallery, light/dark component contrast and focus; final human browser review is pending. See [design contract](DESIGN.md). |
| Approved safety fixes | Existing capability gates, same-block graph/two-peer verification, explicit BURN confirmation, fresh simulation and wallet-only signing, profile cancellation/isolation, persistent Activity, API hint validation and key isolation remain unchanged. |

**After this review polish**, the user will re-trigger `run-live` for the intended final PR head and manually check the app in their browser before merge. The pre-merge live gate must pass; offline tests, SDK probes and manual review do not substitute for that gate. The agent will not retry `test:live` in the sandbox or apply the label. The header follow-up remains draft; PR #2 is already merged. After each push, report the commit, changes and offline results.

### Historical live evidence (not qualification)

The historical real-browser `npm run test:live` check was attempted once after the RPC/discovery load fixes and failed before contract verification: all three public RPC probes in the **old** endpoint list returned `Failed to fetch`. This is not proof of rate limiting, CORS rejection, TLS failure, current identity mismatch, a frozen frontier, or transaction failure. No live reads qualified in that sandbox attempt and no transactions were submitted. The subsequent user-reported SDK successes below are partial live evidence, not a completed Playwright qualification.

Evidence: [`audit/live-qualification-2026-11-02.json`](audit/live-qualification-2026-11-02.json). The earlier local-run plan is now superseded by the explicit-opt-in **thewheel** CI gate below. The successful dd0afff CI run above now completes Phase 0. Retain its qualification artifacts; a later head requires its own pre-merge rerun. The historical jsdom smoke failure is not retried here. Public RPC availability is not a Phase 1 blocker.

## Header-only follow-up

- Disconnected wallet chip hidden; connected address/balance retained.
- All header controls/badges are 36px with shared radius, 11px/14px text and 8px gaps. Body action/dialog controls remain 44px. Theme/refresh are 36×36px, with 18px authored SVGs and existing labels/focus rings.
- Desktop ≥900px keeps brand left and controls right on one row, with Squeekchain/Docs links before the select. Mobile 390px stays stacked. Supported and verified remain separate. Tests cover 900/1024px connected/disconnected and read-only/unverified badge clipping.
- No SDK, trust, capability, signing, simulation or keeper change; no live workflow dispatch/label operation.

## Screenshot review polish

- At 390px the profile select is full width, the badges share one row, and wallet/theme/refresh controls share an aligned row; theme/refresh use 36px icon buttons with 18px SVGs and accessible labels. The layout also passes the existing 320px overflow checks.
- The hero and introductory eyebrow appear only on Overview. Task tabs and the not-deployed Mainnet view do not repeat the hero. Hero paragraph copy wraps naturally, without hard `<br>` elements.
- Below 600px, each holdings row becomes a labelled token card: all seven cells remain visible without horizontal clipping. Desktop keeps the table with scoped headers and explicit table/row/cell semantics.
- Mainnet has one Not deployed badge and one deployment-status panel; the redundant verification badge, network strip, hero and repeated banner are hidden. The separate prior-wallet-request warning is retained when applicable; no action capability changes.
- The screenshot-only MOCKED REVIEW ribbon is placed below the header, not over the wordmark. All 16 light/dark desktop/mobile screenshots plus eight connected/disconnected header crops are regenerated with geometry, card-cell visibility, one-badge/one-panel and hero-visibility assertions.

## Phase 1 finish checklist

- **Shared components:** `web/components.js` exports Panel, Stat, Table, TokenCard, ConfirmDialog, Toast and Skeleton. Existing static markup is enhanced in place; no framework, backend or new authority over capabilities. Panel busy state preserves known readings; Skeleton visibly retains Unknown and respects reduced motion. Tables have captions/scoped headers; TokenCard is a keyboard-operable button and renders artwork as an isolated image. The shared dialog preserves the existing focus trap/restore/cancellation lifecycle and Merge's typed BURN-<id> before call construction/simulation, then review/fresh simulation/wallet signing.
- **Unknown, never invented zero:** absent/nonfinite/unavailable values display literal **Unknown** in network, wallet, table and telemetry views. Known zero is still a valid reading. A missing paused flag is not shown as “no.” v6 Power and v9 Deposited are distinct fields, not a fallback pretending an absent power value is zero. Failed wallet refresh clears stale holdings/actions.
- **Shell:** Wheelhouse wordmark in header/footer, profile select with separate Supported / Read-only · unverified / Not deployed badge, light-default saved theme toggle, and explicit **independent community console · not affiliated with Squeekchain** footer. Live verification status remains separate from profile support status.
- **Review gallery:** [24 committed mocked Chromium screenshots](screenshots/README.md): light/dark × 1280px/390px × Overview/Wallet/Merge dialog/Mainnet-not-deployed, plus connected/disconnected header crops. Every capture uses synthetic fixtures; no live qualification, contract simulation, signing or real wallet submission. The PR description links the gallery and individual images. Regenerate only with explicit `UPDATE_SCREENSHOTS=1 npm run test:browser`; ordinary CI saves captures to ignored test output.
- **JavaScript size:** **147,359 gzip bytes (147.4 kB / 143.9 KiB)**, summed across all five independently gzipped dist JS files using Node's default gzip level. Under the **200,000-byte** budget, now checked at build time. [Per-file report](audit/phase1-js-size.json); `dist/` remains ignored.
- **Final offline validation:** all **11** `npm test` scripts, build/static parity/size budget, all **35** mocked Chromium tests, and `git diff --check` pass. Wire request budgets remain **22 cold / 12 warm / 15 wallet**.

**Header follow-up ready for draft review**, not approval to merge. PR #2 is already merged. All approved safety rules and the opt-in live workflow are unchanged. No sandbox `test:live`, label operation, keeper activation or transaction submission was performed. User-triggered live qualification at the intended final head and manual browser review are still required before merge; Phase 0 is complete based on the qualified dd0afff head.

## Public RPC availability follow-up

Public endpoints change often; configured roles are availability preferences, not trust pins. The user reported real-network checks at **2026-11-02 23:50 IST**: dRPC rejects the free plan, 1RPC is forbidden, and PublicNode serves state but returns error `4444` for pruned log history. Those observations explain why the old list cannot satisfy two-peer availability; they do not qualify this app's full live verification.

- Replaced dRPC/1RPC with **Tenderly, PublicNode, Nodies, OnFinality, 0xRPC**. Any two healthy independent peers can establish snapshot agreement. State reads prefer Tenderly → PublicNode → Nodies, then OnFinality → 0xRPC.
- Log scans use **Tenderly → 0xRPC → OnFinality**, trying the same range on all log-role endpoints before shrinking on pruned/range failures. Nodies remains snapshot/state-only (reported 50-block log cap). OnFinality is a last resort; HTTP 429/503 sets a shared session cooldown honoring `Retry-After` seconds/HTTP date (positive and <=300s, otherwise 30s). Cooling endpoints are skipped, including identity re-probes; healthy fallbacks do not wait. Historical-state, pruned-history, range-limit, forbidden and free-plan errors fail over as availability errors. Wrong-chain, implementation and hash mismatches remain fail-closed trust failures.
- Settings retains the custom RPC option: it joins the peer set and is first for state/log reads; aliases on one origin cannot count as two peers. A connected Sepolia wallet stays preferred, with availability-only fallback to the role-appropriate public endpoints.
- Run **`npm run rpc:probe`** locally for a per-endpoint table: chain ID, a head-minus-12 block/hash, the mining EIP-1967 implementation slot at that block, and an inclusive 10k-block NFT Transfer log query. Requests time out after 15 seconds. Each capability reports independently; a log failure does not disqualify an otherwise healthy snapshot/state peer. This Node diagnostic does not test browser CORS, peer agreement or the full graph and is **not Phase 0 qualification**.
- Offline regression coverage uses the reported `4444: pruned history unavailable`, `historical state unavailable`, `range too large`, `35: chain is not available on free plan` and `forbidden` payloads; asserts unchanged-range endpoint failover before chunk shrinking, custom/wallet behavior and trust-stop behavior.

**The replacement RPC list passed the real-browser gate on dd0afff in run 41618128325.** The new header-polish head needs its own user-triggered rerun before merge. The old failed evidence is retained, not relabeled as a pass.

## User-reported partial live results and follow-ups

At **2026-11-02 23:58 IST**, on commit `0b0fe17`, the user ran real-network checks outside the sandbox:
- SDK `verify()` passed full v6 graph verification at block **12049929** in **1,490 ms**.
- `networkStatus()` completed two-peer snapshot plus reads in approximately **2.3 s**.
- `checkpointPreview()` correctly reported **Round 1974 is not settled**, with verification attached.
- Reported CORS `Access-Control-Allow-Origin: *`: Tenderly, PublicNode, Nodies, 0xRPC.
- `rpc:probe`: Tenderly/PublicNode/0xRPC all OK; Nodies logs capped at 50 blocks; OnFinality returned HTTP 429.

Recorded as **user-reported evidence**, not independently rerun or a `test:live` pass: [`audit/live-user-report-2026-11-02.json`](audit/live-user-report-2026-11-02.json). The earlier failed sandbox evidence is retained as a separate historical result.

Tenderly is effectively the only reliable full-range log source in these observations; 0xRPC and OnFinality are opportunistic fallbacks. The IndexedDB incremental ownership checkpoint therefore matters: do not routinely clear it or rescan old history. If logs fail, paginated official account API wallet IDs may be used **only as hints**: validate the consumed schema/account/chain/NFT context and stable pagination, then require the full unique set to match **snapshot balanceOf plus multicall ownerOf**. Only that chain-confirmed set is returned/cached at the RPC snapshot. Unavailable, wrong-owner, missing or extra hints fail closed; API metadata/rewards/levels/addresses never configure actions. API cursor invalidation gets one clean restart; 429/503 backs off. Full SDK graph and final peer-hash checks remain mandatory.

The v6 panel now displays its live settlement frontier and a snapshot-scoped no-new-issuance notice when the next round is unsettled and checkpoint lag is zero. The user's observed frontier **1973** is historical evidence, **not a runtime constant**. The notice updates on frontier/readiness changes and clears on failure/switch; it does not claim that one observation proves a permanent freeze or that existing claimable rewards are zero.

README documents the linux-arm64 Chromium CDN 403 workaround: use x64 or an already-installed supported local Chrome via **`PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:live`** (`channel: 'chrome'`), or the existing executable-path override. The Chrome-channel config is provided; local Chrome itself was not available/tested in this sandbox.

**Phase 0 is complete: offline audit plus live qualification on dd0afff in run 41618128325.** PR #2 is merged; the separate header follow-up stays draft pending review and its own final-head rerun.

## Opt-in CI live gate (passed on dd0afff; user re-triggers for the polish head)

Added **thewheel** (`.github/workflows/live.yml`), triggered by **`workflow_dispatch` or `pull_request: types: [labeled]`**, with the live job gated on explicit dispatch or the event's **`run-live`** label. Other labels skip the job; pushes/PR synchronization never run the live tests automatically. It uses `ubuntu-latest`, Node 22 from `.nvmrc`, a **15-minute** timeout and read-only repository permissions; runs `npm ci`, Chromium install with OS dependencies, `rpc:probe`, then `test:live`; and always attempts to upload Playwright HTML/report data plus fresh `live-qualification/live-qualification.json` evidence. No configured secrets or keeper/signing variables are used. Empty/skipped/incomplete suites cannot qualify; failures are not marked continue-on-error. The old non-blocking live option was removed from ordinary offline CI to leave one clearly named manual live gate.

No sandbox `test:live` retry was performed for this change. Its last blocked attempt is preserved in [`audit/live-qualification-2026-11-03.json`](audit/live-qualification-2026-11-03.json); the earlier user-reported SDK verification passed at block **12050470** in **1.6 seconds**, frontier **1973**, but did not include a full Playwright live-suite pass. The later successful CI run 41618128325 supplies that qualification.

The workflow can run directly from **the follow-up PR by adding `run-live`**; no default-branch bootstrap or WIP merge is required for that trigger. `actions/checkout` pins `github.event.pull_request.head.sha` on PR events (selected event SHA on dispatch). Both the initial JSON and live reporter use **`LIVE_SOURCE_COMMIT`** set to that exact head SHA, not the PR merge-commit `GITHUB_SHA`. If the explicit source variable is absent, the reporter uses checked-out HEAD (or unknown if Git is unavailable), never the synthetic merge-commit `GITHUB_SHA`. Read-only permissions and concurrency group **`thewheel-live-sepolia`** are unchanged; **no `pull_request_target`** or secrets are used.

The user triggered the successful dd0afff run and will remove/re-add the label for the polish head; the agent has not labeled/dispatched or rerun live tests. **Qualification passed for dd0afff, and the intended final PR head must be requalified before merge**; a skipped job is not qualification. No automatic phase transition is performed by the workflow. Actions-tab `workflow_dispatch` remains available only once the workflow exists on the default branch.

## Failed live gate 41606508624: diagnostics hardening

The [run on `be43b9d`](https://github.com/CryptoExplor/Squeekchain-console/actions/runs/41606508624) failed at the live step; GitHub run metadata confirms build/setup/probe steps succeeded and artifacts uploaded. The user reports browser CORS/block agreement passed, then `squeek_network_status` returned an unknown RPC error; the same SDK call passed 3/3 in Node. **That failed run did not qualify; the later run 41618128325 passed on dd0afff.**

Artifact **`thewheel-live-41606508624-1`** exists (ID `13217570445`), but this sandbox cannot download it: GitHub redirects artifact bytes to an unallowed Azure Blob host, and run logs to an unallowed results-receiver host; both requests ended in EOF. Therefore **`verified-network-snapshot.json` and `trace.zip` were not inspected**. The exact failing endpoint, RPC method, HTTP status, and CORS/429/JSON-RPC category remain **unknown**. An uploaded ZIP or the next gate's new diagnostic attachments is needed; do not claim a verified CI root cause.

Offline characterization of the pre-change code showed that plain cooldown and `TypeError('Failed to fetch')` already failed over and were recognized through `UnknownRpcError.cause`. `TypeError('Load failed')` was not recognized; an unavailable chain-ID recheck could discard the original method error. This verifies gaps, **not** that either caused this CI failure.

Hardening: viem-BaseError typed availability/context errors retain endpoint origin, method and causal structure through custom transports. Availability walks bounded/cycle-safe cause/recheck chains; wrong chain/hash/identity and execution reverts still stop immediately. A failed identity availability recheck preserves the original method/code; a wrong-chain recheck remains fatal. Web/MCP errors now include redacted diagnostics and recent endpoint failures; no raw params, headers, URL paths/query/userinfo or arbitrary provider messages are serialized. CLI/MCP logs use the same redacted summary.

The live assertions remain unchanged; the unmocked test now passively attaches **`rpc-network-diagnostics.json`** (actual HTTP status, JSON-RPC code, network failure and explicit browser CORS signals) and, when a tool returns error diagnostics, **`rpc-tool-diagnostics.json`**. These are attached in `finally`, including on assertion failure. The live qualification reporter includes these attachments. `ERR_FAILED`/TypeError alone is explicitly not treated as proof of CORS. Offline Node and Chromium wire regressions exercise first-state-endpoint cooldown/TypeError fallback, typed-error preservation, original + chain-ID recheck errors, trust/revert stops and secret redaction. No sandbox live suite was retried or label applied.

## Phase 1 review: non-network TypeErrors fail closed (`6ccaf06`)

Only known fetch-failure TypeError messages (`Failed to fetch`, `Load failed`, `NetworkError when attempting to fetch resource.`, Node `fetch failed`, or `Network request failed`) qualify as transport availability. Other TypeErrors, including `Cannot read properties of undefined`, stop immediately through nested viem/HTTP/availability wrappers; they cannot trigger peer fallback, chain-ID re-probes or log-range shrinking. Snapshot peer selection and wallet probes also preserve this stop. Diagnostics label these as possible programming errors, not CORS failures, without serializing arbitrary provider messages.

The offline first-endpoint regression injects the exact programming TypeError through the real viem HTTP transport, verifies the original cause survives, and asserts no next endpoint or identity re-probe is called. Existing cooldown and recognized fetch-failure fallback tests remain in place. Live qualification subsequently passed on dd0afff; manual review and a live rerun for the new header-polish head remain pre-merge requirements.

## Implemented in place

- **Wheelhouse design:** light-default, saved theme, local Barlow Condensed/Quicksand/IBM Plex Mono, gold/blue, original wheel artwork, responsive wallet/verification visibility, keyboard focus lifecycle and reduced motion. No Lighthouse score or blanket WCAG certification is claimed.
- **Supported deployment:** v6 default, pinned to the official Sepolia record. Observed v9 remains read-only/unverified; all transaction paths are disabled/absent. Mainnet has no chain panels or transaction buttons.
- **Keys:** web/MCP/owner CLI never load an owner key. MCP has no submit tool or keeper configuration. Separate checkpoint-only keeper requires both explicit enablement and `--submit-checkpoint`, checks to/data/value and is off by default; it has not been enabled or run.
- **Session verification:** full pinned verification at a single snapshot block on first use; in-memory cache keyed by release/profile graph, implementation addresses and proxy admins. Every operation reads the four EIP-1967 slots at its snapshot, re-verifies changed identities, and rejects unpublished values. Full-verification provenance and current slot-check provenance are separately reported. No cache trust is written before final hash agreement. Immutable renderer/page hashes are not published; artwork integrity stays Unknown.
- **RPC work reduction:** one chain-ID probe per transport with shared in-flight probes; invalidate/recheck on errors and wallet chain changes. Multicall batches verification/status/art. Two independent RPC-peer block hashes still agree at each snapshot and are rechecked afterward; hashes are never session-cached. Wrapped trust errors cannot be retried away through fallback.
- **Request budget:** actual JSON-RPC requests counted through real viem transports with synthetic offline wire responses: **22 cold network, 12 warm network, 15 warm wallet**. Warm budgets fail above 25. A multi-ID artwork batch uses one `eth_call` and one snapshot. These are deterministic test counts, not measured live RPC performance. Wallet refresh reuses network state and a pure merge plan from the same snapshot rather than loading them again.
- **Discovery:** ABI-indexed incoming `Transfer(to: owner)` and outgoing `Transfer(from: owner)` filters, never collection-wide history. IndexedDB stores the frontier/hash/IDs and scans only new blocks. Reorged/future checkpoints are discarded. Each final set is checked against same-block `balanceOf` plus multicall `ownerOf`. Unavailable logs may use official-account ID hints only after full same-snapshot ownership/completeness confirmation; no ownerOf sweep or API-derived ownership.
- **Explicit actions:** BURN-donor required before merge calldata; post-review fresh simulation/verification. Claim batches re-preview and stop on amount changes or reverts. Case-insensitive owner comparisons. No changed-input transaction retries.
- **Profile isolation:** every load gets a generation/controller. Switches bypass the signing-only busy lock, abort reads, clear profile/wallet/position/output/receipt-view state and drop late results. Explicit modal Cancel returns `cancelled`; a switch returns `profile-changed`.
- **Activity:** broadcast hash/label/chain/time persisted immediately, even if the wallet returns after a switch. Activity lives outside the profile generation and remains visible on Mainnet. Receipt block hashes are checked against the public peers; mined receipts stay distinct from final status until 12 confirmations. Storage receipts are re-read after reload; unknown outcomes stay pending and never trigger transaction submission/retry. Monitoring is tab-open only.
- **Static build:** no backend, own RPC proxy or Worker entry point. `dist/` is removed from Git and ignored; Cloudflare Pages builds it. Build-time source/output parity includes Activity. Existing `sdk/`, `src/`, `mcp/`, `test/`, `build.mjs`, `wrangler.toml` architecture retained.

## Validation

- `npm test`: passes UI/telemetry/modal regressions, published-record characterization/local ABI parity, stdio tool listing, same-block identity mismatch cases, role-based RPC availability/failover/backoff and probe checks, paginated API hint isolation and onchain confirmation, actual wire request budgets, chain/cache invalidation, IndexedDB filtered/incremental/reorg discovery and Activity persistence/reverts/unavailability.
- `npm run test:browser`: **35 passing mocked Chromium tests**: light/saved theme and responsive layout; pending-RPC switch; three rapid switches; pending-simulation switch; late broadcast persistence/receipt tracking across a switch and reload; live-derived v6 frontier messaging/advancement/failure/switch/mobile behavior; bundled browser-wire state cooldown/TypeError failover; light/dark component contrast, readable captions, theme metadata/state and focus; 24 screenshot states and compact-desktop header regressions; TokenCard keyboard/isolated-image/dialog focus behavior. RPC/adapters are mocked in this suite; it is not live qualification.
- `npm run build`: passes; `dist/` output parity is a build check, not tracked generated content.
- CI includes `npx playwright install --with-deps chromium`. The sandbox used an npm-distributed Chromium with bundled system libraries because browser download hosts are restricted; that temporary package/binary is not a project dependency or committed artifact.
- `npm run test:live`: the **historical sandbox attempt failed / was unavailable**; the full suite subsequently **passed opted-in CI run 41618128325 on dd0afff**. That is the Phase 0 evidence; the new header-polish head awaits its own rerun.

## Sources and historical evidence

Pinned data were read from the published record and approved in the user's audit of `1a747a7`; no pinned values were changed in this follow-up. Earlier observations are preserved in [`audit/observations-2026-11-02.json`](audit/observations-2026-11-02.json) as historical evidence, never runtime transaction configuration.

Official material read for the integration (API account documentation and its [response schema](https://docs.squeekchain.com/assets/api/account.json) re-read 2026-11-03 before the hint integration):
- [llms-full.txt / skill alternative](https://docs.squeekchain.com/llms-full.txt)
- [Sepolia deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json)
- [Quickstart](https://docs.squeekchain.com/developers/quickstart.md), [all eleven Build with AI safety rules](https://docs.squeekchain.com/developers/build-with-ai.md)
- [Owner actions](https://docs.squeekchain.com/developers/owner-actions.md), [API](https://docs.squeekchain.com/developers/api.md), [DotGrid](https://docs.squeekchain.com/developers/dotgrid.md)
- Published [Core](https://docs.squeekchain.com/assets/abi/SqueekCore.json), [Mining](https://docs.squeekchain.com/assets/abi/SqueekMining.json), [NFT](https://docs.squeekchain.com/assets/abi/SqueekNFT.json), [Token](https://docs.squeekchain.com/assets/abi/SqueekToken.json) and renderer ABI pages.

Complete remote/local ABI byte-for-byte parity and a browser comparison with the official dApp have not been claimed. Stop if a required official source cannot be read; never substitute API observations or remembered ABIs as trust pins.

## Deferred / not claimed

No mainnet deployment or v9 owner integration; no real signed transaction test; no closed-tab alerts, remote MCP, OG/alert Worker/D1, EIP-6963/WalletConnect integration or paid service provisioning. Official API/Genesis unavailability remains Unknown, including `launch_unconfigured`. No repository rename or follow-up PR merge/deployment. PR #2 was merged at user request; the new header draft awaits manual review and opted-in live qualification of its intended final head.
