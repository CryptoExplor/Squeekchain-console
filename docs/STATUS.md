# Wheelhouse evolution — Phase 0 audit

**Audit date:** 2026-11-02 (Asia/Calcutta).  
**Baseline:** `a592f15` (merged PR #1, current branding: The Wheel).  
**Working branch:** `arena/314fd2af-squeekchain-console`.  
**Scope:** inspection, historical evidence, offline characterization tests and a delivery plan; no feature rollout, contract changes, transaction submission, keeper activation, paid service provisioning or rename.

## Decision / completion gate

**Phase 0 is partially complete, not production approval.** Repository inspection and published-record/API comparison are complete. A real-browser comparison and same-block onchain verification remain blocked by this environment. Do not mark the live profile supported, enable undocumented flows, or claim the live smoke suite passes on this evidence.

The old branch in the brief (`arena/13984554-squeekchain-console`) was merged into this baseline. Work stays on the active session branch. Each later phase should be a separate reviewed PR, sequentially after the previous phase is merged; this session must not create or switch to another branch.

Branding remains **The Wheel**. “Wheelhouse” is a proposed product name in this plan, not a completed rename. Obtain explicit confirmation before changing app/package branding or renaming the GitHub repository to `squeek-wheelhouse`.

## Review follow-up — browser-first scope

The browser-first revision supersedes the backend architecture in the original brief. The implementation remains an in-place evolution of this static app, not a new service. The Phase 2 wallet-first transport, IndexedDB log cache and custom RPC setting are **planned, not implemented by this review patch**.

All five inline findings were checked against current code and were still valid. This patch keeps telemetry visible while same-profile refreshes are pending (but clears it to Unknown on failure), adds shared confirmation/art-dialog focus entry/trapping/restoration, keeps the wallet and verification chips visible at responsive breakpoints, and accepts bounded Retry-After seconds or HTTP dates. No prior retry ceiling existed in the checked-in telemetry module: the explicit ceiling is now **300 seconds**, retaining the **30-second** default for past, invalid or over-ceiling values.

`test/review-regressions.mjs` covers these changes offline, including delayed API responses, profile isolation, dialog keyboard/dismissal paths, responsive CSS declarations and fake-clock backoff boundaries. jsdom CSS checks are not a visual browser/layout qualification. No contract addresses, signing flows, branding or keeper settings changed in this follow-up.

## Sources read

Official sources were retrievable through the page retrieval tool. The `llms-full.txt` resource was loaded as the allowed alternative to installing the skill; no skill installer was run. Relevant standalone guides were read as well. ABI URLs were inspected, but a complete byte-for-byte remote/local ABI comparison is still outstanding; do not interpret URL availability as ABI provenance verification.

- [Developer documentation / skill alternative](https://docs.squeekchain.com/llms-full.txt)
- [Deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json)
- Published ABIs: [SqueekCore](https://docs.squeekchain.com/assets/abi/SqueekCore.json), [SqueekMining](https://docs.squeekchain.com/assets/abi/SqueekMining.json), [SqueekNFT](https://docs.squeekchain.com/assets/abi/SqueekNFT.json), [SqueekToken](https://docs.squeekchain.com/assets/abi/SqueekToken.json), [DotGridRenderer](https://docs.squeekchain.com/assets/abi/DotGridRenderer.json)
- [API](https://docs.squeekchain.com/developers/api.md)
- [Owner actions](https://docs.squeekchain.com/developers/owner-actions.md)
- [DotGrid](https://docs.squeekchain.com/developers/dotgrid.md)
- [Build with AI: all eleven safety rules](https://docs.squeekchain.com/developers/build-with-ai.md)
- [Quickstart / graph verification](https://docs.squeekchain.com/developers/quickstart.md)
- [Official landing page](https://squeekchain.com/) and [Sepolia application](https://sepolia.squeekchain.com/), retrieved as text, not visually inspected in a browser.

**Stop rule:** if any required source becomes unavailable during subsequent implementation, stop that integration and report it. Never substitute remembered ABIs, explorer contracts or API addresses as transaction configuration.

## Fresh observations, not deployment configuration

See [`audit/observations-2026-11-02.json`](audit/observations-2026-11-02.json) for the small historical evidence excerpt. It must never feed runtime transaction builders.

| Source | Observation on audit date | Interpretation |
|---|---|---|
| Published record | Release `squeeks-sepolia-core3-mining6-001`, Sepolia chain ID 11155111, core v3, mining v6, selector 0, maximum level 10 | Trusted configuration source; current onchain identity still needs verification. |
| `/v1/core` | Schema 1, available, safe through Ethereum block 12049184; core `0x980b…3d44`, implementation `0x2847…6889`, version 3 | Different core from the published record (`0x7466…119f`). Stop treating it as the published graph. |
| `/v1/economy/state` | Schema 2, available, safe through 12049185; release `stream-game-sepolia-test-20261026-01`, issuance v9, staking v2, different token/NFT | Confirms an indexed newer graph, not permission to use its ABIs or addresses for owner actions. |
| `/v1/genesis-launch` | Schema 2, `status: unavailable`, `reason: launch_unconfigured` | Display **Unknown / Launch not configured**, not an empty launch or zero inventory. |
| Official landing page / record | Preparing to launch; record says no mainnet deployment | Mainnet remains not-deployed. Recheck official records before future activation. |

The observed economy identities match the existing experimental profile's address strings (case-insensitive). Its release string matches too. This is an **API comparison only**, not independent runtime hash verification. `/v1/core` did not carry a release field; release was obtained from `/v1/economy/state`. These reads used adjacent, not identical, safe blocks.

### Runtime checks still required

1. From a real browser on the deployed preview, GET the published record, `/v1/core`, `/v1/economy/state` and `/v1/genesis-launch`; record schema versions, identities, release, safe block, response content type and unavailable reasons. The record and API graphs currently differ: that is a failure to trust, not something to auto-repair.
2. On a permitted Sepolia RPC, verify chain ID and choose one confirmed block/hash. Verify EIP-1967 slots, reported implementation, runtime keccak256, version, layout, admin ownership, graph wiring and core configuration against the **published record**, at that block. Recheck the block hash afterward.
3. Read the documented graph's `state`, `collectionPolicy(0)` and `checkpointStatus` at that snapshot. Do not hardcode “frozen at round 1973” from the existing README as current truth. One unchanged frontier does not establish that it can never advance.
4. Do not make RPC calls against the API-observed newer addresses as a trusted integration until an official deployment record and published matching ABIs exist. Keep observations display-only.

There is no installed browser executable in this sandbox. The page tool successfully retrieved JSON, but that does **not** satisfy the requested browser/CORS check. A direct `curl --max-time 12` API probe failed with `SSL_ERROR_SYSCALL`; no HTTP challenge response was received. Therefore bot protection is an integration requirement from the brief, not a 403 reproduced in this audit.

## What exists per profile

“Present” below means implemented or exercised offline; **not** a successful live-chain qualification.

| Feature | `sepolia` (experimental newer graph) | `sepolia-v6` (published graph) | `mainnet` |
|---|---|---|---|
| Registry | JS `sdk/deployments.js`; inferred addresses/ABIs | JS registry; addresses match the record excerpt | Null addresses, no adapter |
| Status / portfolio | Read adapter present; live RPC unverified | Read adapter present; live RPC unverified | Not-deployed placeholder |
| Wallet vs deposited NFTs | Wallet-owner discovery only; misses NFTs owned by staking | Owner positions, active/pending power and claimable | Unavailable |
| SQK balance | SDK returns it, UI does not expose a dedicated balance | Same | Unavailable |
| Claim | UI/MCP gated off | Optional selected IDs, sort/dedupe, <=32 batches, fresh ownership checks, estimated gas; payout simulation incomplete | Off |
| Merge | UI/MCP gated off | Planner and custom survivor/donor picker; incomplete same-block preflight; dialog currently types donor number only | Off |
| Checkpoint | UI/MCP gated off | Status check, gas-estimated unsigned call, wallet submission path; live eligibility unknown | Off |
| Art | `tokenURI` read and isolated `<img>` | **Missing:** v6 adapter does not export `art`, although its registry advertises it | Off |
| Staking | Read-only subset; undocumented-flow card | No staking contract in pinned record | No deployment |
| Genesis | No tab | No tab | No Genesis status fetch |
| Watch-only | Address input and reads present | Present | No chain reads |
| Agent tools | Read tools, art; v9 unsigned builders still directly exported by SDK | Read/prepare tools; web requests signatures, stdio returns unsigned transactions | No tools |

Profile notes currently assert historical live counts, frozen frontiers and deployment states as prose. Replace volatile claims with runtime status and source/freshness labels. `transfer: true` is advertised without a corresponding web action; capability metadata must represent actual exposed behavior.

## Safety findings / required remediations

### High priority: before holder actions are called production-ready

1. **Incomplete verification (`sdk/squeekchain.js`, `verify`)**: obtains a block number but reads slots and contracts without passing it. Omits implementation runtime-hash pinning, reported implementation comparison, proxy-admin owner and core-configuration validation, actual RPC chain-ID validation and reorg hash checks. Returning `chainId: CHAIN.id` is not a runtime network check. Verification can produce a green status without meeting Quickstart requirements.
2. **New graph lacks approved provenance (`sdk/v9.js`, `sdk/abi-v9.js`)**: locally inferred ABI fragments and addresses are not the published record. Verification checks selected versions and links, not all identities at a single block, and explicitly returns `trusted: false`. Its `networkStatus`, `walletStatus`, `art` and exported `buildMerge`/`buildTransfer`/`buildCheckpoint` do not enforce a verified-graph boundary. Keep owner actions unavailable at **every** SDK/tool entry point, not just buttons.
3. **Claim preflight (`sdk/squeekchain.js`, `claimPreview`)**: fresh `ownerOf` checks exist; missing selections are rejected rather than silently dropped. However estimated payout comes from potentially cached per-token portfolio amounts, and simulation is `estimateGas`, not `simulateContract` returning `paid`. Read batch `claimable`, simulate from the owner and show exact integer payout. Refresh ownership and preflight before each later batch/signature; stop on any failure.
4. **Merge preflight and guard (`sdk/squeekchain.js`, `mergePlan`/`mergePreview`; `web/app.js`, `requestMerge`)**: planner combines cached or latest reads from different blocks. Preview checks owner and level, then estimates gas; it lacks the documented explicit maximum-level, pending activation and cooldown checks at one block. New level displayed can come from stale UI state. UI confirmation uses `requireText: pair.donor`, while acceptance requires `BURN-<donor>`. The tool/MCP string guard alone does not satisfy the UI requirement.
5. **MCP can handle a private key (`mcp/server.js`)**: `KEEPER_PRIVATE_KEY` activates checkpoint submission. No owner claim/merge signing tool was found, but this keeper exception still violates the new stricter no-key MCP acceptance criterion. Move all signing to a separately authorized, default-off checkpoint-only keeper. Do not configure a key to test this path.
6. **Keeper/CLI is not checkpoint-only (`src/`)**: `PRIVATE_KEY`, `LIVE=true`, `AUTO_MERGE` (default true) and `mine` support owner claims and automatic donor selection/merges. Claim/merge loops catch failures and continue with later batches/pairs. Preserve the directory but remove/restrict owner signing and automatic merges before a keeper rollout. Never turn it on as part of this refactor.
7. **Verification bypasses exist**: `skipVerification`, MCP `SKIP_VERIFICATION` and CLI `ALLOW_UNVERIFIED`. Test injection must remain isolated from deployed paths; production must fail closed. CLI verification computes but does not compare runtime hashes, tolerates a failed admin-owner read, and can fall back to unpinned head reads.

### Additional correctness / platform gaps

- Web transaction failure handling (`web/app.js`, `sendTransaction` / `requestClaim`) returns `ok: false` on a reverted receipt, but the batch loop does not stop or propagate that failure and can ultimately return overall success. Stop on a failed receipt, decode/report the reason where available, and do not proceed to other IDs after failure.
- Wallet submission uses `eth_sendTransaction` only. Add EIP-5792 capability-aware bundles, status/receipt handling and fallback **only on known unsupported-method outcomes**, not on user rejection or an ambiguous submitted bundle. Re-read before retrying; never duplicate a transaction.
- Unavailable values can become invented zeros: v9 depositor failure becomes `false`; missing account-power tuple entries default to `0n`; UI holder power falls back to `"0"`; `paused` can render false from an absent value. Unknown handling needs discriminated data states throughout, not just API errors.
- Existing generation guards discard late network/art/profile reads. They do not cover every wallet error, async tool result, wallet-chip update and pending modal/submission. Profile changes do not fully reset connected/inspected wallet state, table contents, all form inputs or modal state. Add adversarial delayed-response E2E coverage.
- Metadata is rendered in isolated images, which is good; validate URI scheme, metadata shape/size and all DotGrid identity evidence. Do not inject metadata into markup. The merge-plan renderer uses `innerHTML`; replace it with text nodes for a stronger data boundary.
- Token enumeration uses full logs or owner sweeps. v9 sweeping up to current `totalSupply` is not equivalent to highest issued token ID after burns. Deposited NFTs must be included separately with published, verified custody semantics or API display projections.
- Precision: financial formatting, ETH balance, power-share arithmetic and lag calculations contain `Number` conversions. Keep financial/ID/block arithmetic as bigint and convert only bounded visual quantities or preformatted strings.
- Telemetry (`web/telemetry.js`) has ETag/304, a 10s timeout, version check and numeric Retry-After backoff, but no explicit HTML/challenge detection, general schema validation or browser RPC fallback for chain-readable data. RPC cannot reconstruct live wheel RPM or launch config that has not been published: these remain Unknown. Onchain state can have an independently labeled verified RPC fallback.
- No API client for account earnings/activity, settlement charts, events, economy or Genesis; no pagination, snapshot-consistency or cursor-reorganization handling for those views.
- No `/squeek/:id` routing, token share page or OG image.
- UI typography/fonts, colors, panel/control radii, dots, light default and stored dark toggle are present. Missing system-theme-following-before-user-choice behavior, skeleton components, standardized reusable component interfaces and the requested header/footer text. No WCAG/Lighthouse or visual matching claim is supported by jsdom tests.
- Wallet provider is `window.ethereum`; no EIP-6963 discovery or WalletConnect.
- No Vite/TypeScript layer yet. Preserve `build.mjs` as orchestration when migrating; do not replace the repo.
- No CSP `_headers`, Playwright E2E, analytics or PR preview workflow yet. Browser Notifications and IndexedDB log caching are also pending. Backend bindings, scheduled jobs, remote MCP and closed-tab push delivery are **not required** under the revised static scope. Ignore rules still need local credential files excluded before any optional deployment tooling is configured.

## Existing tests and measurements

| Check | Result on audit date | What it proves / does not prove |
|---|---|---|
| `npm ci` | Pass; audit reported 0 vulnerabilities | Reproducible local dependency installation, not a full security review |
| `npm test` | Pass | Existing deterministic jsdom/telemetry/claim-selection tests; simulations and signature dialogs are not fully tested |
| `npm run build` | Pass | Existing esbuild static output and manifest generation |
| `npm run test:live` | **Failed**: `timeout waiting for network panel` after approximately 120s | RPC-backed panel did not load; no successful live holder/claim/merge verification |
| `npm run test:audit` | Pass (also included in `npm test`) | Offline historical-record/profile comparison, local ABI export parity, no default stdio submit tools and profile tool gates; not chain qualification |
| Real browser, Lighthouse, CSP/E2E | Not run | Outstanding acceptance checks |

Local gzip measurements after build (Node `gzipSync`, not browser transfer measurements):

| JS resource | Raw bytes | Gzip bytes |
|---|---:|---:|
| `web/bundle.js` | 444,907 | 119,307 |
| `web/app.js` | 41,842 | 11,411 |
| `web/telemetry.js` | 2,383 | 1,103 |
| **Combined initial JS** | **489,132** | **131,821** |

This baseline is below the requested 200 KB gzipped JS ceiling by a local measurement only. Vite, wallet discovery, charts and future dependencies need a build-size gate; mobile Lighthouse 90+ has **not** been demonstrated.

## Browser-first Cloudflare architecture (supersedes the original backend plan)

**Fully static Cloudflare Pages. No backend, RPC proxy, private verifier endpoint, KV snapshots, D1, Cron, Durable Objects or remote MCP service is required or will be introduced for reads or transactions.** Keep `wrangler.toml` and `build.mjs` targeting `dist/`.

### Browser RPC selection — Phase 2

1. Prefer the connected wallet's EIP-1193 provider only when the user is connected and `eth_chainId` is 11155111. Handle wallet account/network changes; never read another chain as Sepolia.
2. Otherwise use viem `fallback()` across at least three public CORS-enabled Sepolia RPCs, with bounded retries/backoff on 429 and multicall batching. Candidate endpoints from the revised brief include PublicNode, `sepolia.drpc.org` and `1rpc.io/sepolia`; their browser CORS/reliability still need validation.
3. Provide a Settings “Use my own RPC URL” option saved in localStorage. Never ship a paid RPC key in the bundle or commit a user's URL. This field selects transport, never deployment addresses or expected identities; sanitize errors so credential-bearing URLs are not logged or reflected in the UI.

Run graph/identity checks, ownership, balances, positions, policy, claimable, checkpoint status, core state, art decoding, simulations, cooldown math, merge planning and receipt verification **in the browser**. Pin each snapshot/multicall to one Ethereum block/hash. The old public-proxy method allowlist conflict no longer applies: direct RPC supports the read methods required by full verification.

Use browser `eth_getLogs` with an IndexedDB cache for wallet NFT discovery and recent settlements, checkpoints, claims and merges. Scope cache entries by chain, deployment identity and block hash; handle reorgs, pagination/chunking, transfers and burns. Discovery remains read data, not proof of live ownership for signing.

### Official API exceptions — direct browser requests only

- Wheel telemetry (`/v1/status`) and measurement runs/blocks/stats, which chain state cannot reconstruct.
- Genesis launch data until matching official contract ABIs are published.
- Account activity, seven-day earnings and the events feed are allowed API-first for speed, with browser `eth_getLogs` fallback.

All other chain-readable state is browser-RPC-first, including economy/supply and settled histories. API data is display-only and must **never** enter transaction preparation. A 403 challenge, 429, invalid schema or `unavailable` response affects only its panel: show **Unknown**, keep other panels working, and use a labeled RPC/log fallback where equivalent data exists. Do not invent RPM, measurement history or unpublished launch state from RPC. Account history/log reconstruction may be incomplete; label coverage rather than filling gaps with zero.

### Alerts and optional later services

Current scope: user-opted-in browser Notifications while the tab is open. No closed-tab Web Push or Telegram delivery, no server-side keeper, and no always-on notification infrastructure.

Phase 5 is optional and deferred: an OG image Worker and, only after a separate scope/approval decision, Cron/D1-backed Telegram or Web Push could be considered later. None is a prerequisite to this static platform. Local stdio MCP and the browser tool bridge remain; a hosted remote MCP would itself require a backend and is outside the revised scope. No Cloudflare resources were created in this audit or review patch.

## Phase PR sequence / exit criteria

| Phase | In-place changes | Required exit tests |
|---|---|---|
| 0 — Audit (this PR) | Status, dated evidence, offline characterization | Offline tests/build; browser + same-block RPC evidence still required before completion |
| 1 — Design system | Existing web tokens/components/header/footer, local fonts, theme preference state; branding only after confirmation | Keyboard/dialog/focus tests, theme tests, contrast and mobile visual review |
| 2 — Data layer | `sdk/profiles.ts`, wallet-first/public-fallback browser clients, single-block verification, custom RPC setting, IndexedDB logs, scoped API exceptions, bigint states; retain JS/MCP compatibility through build orchestration | Mismatch/reorg/403/HTML/304/429/unavailable fixtures, profile isolation and full verification tests |
| 3 — Holder workspace | Wallet/deposited portfolio, exact simulated payouts, EIP-5792, `BURN-<id>`, planner, route/share, activity/earnings | Mock-wallet tests proving no unconfirmed burn, no unsupported v9 builder, no duplicate sends; live Sepolia smoke |
| 4 — Network and Genesis | Economy/queue/events/settlements and launch/wallet views with Unknown states | Unconfigured launch, pagination and partial-data tests; graph mismatch display |
| 5 — Optional later services (deferred) | No backend now; OG image Worker / closed-tab alert services require a separate approved scope | Not a static-platform acceptance gate; browser Notifications tested in current scope |
| 6 — Agents | Keep browser tools/postMessage and local stdio MCP, generated manifest and client setup docs; no hosted MCP | Browser/stdio conformance, consistent read/prepare semantics, no signer/submit exposure |
| 7 — Hardening | Offline fixtures, Playwright mock wallet, security headers, size/perf/accessibility CI, deployment docs and PR previews | Offline + live suites, mobile Lighthouse >=90, <200 KB initial gzip JS, reviewed CSP and preview deployment |

No claim is made that later phases have been implemented or deployed in this audit PR.

## Required input / remaining blockers

1. Provide a browser-run identity comparison (or a browser-capable environment) and permitted Sepolia RPC connectivity for live smoke and same-block verification. No private key is needed or requested.
2. Confirm whether branding may change to **Wheelhouse**. GitHub repo rename is a separate action requiring approval and is not part of this session's fixed branch handling.
3. The RPC proxy/verification architecture decision is **resolved** by the browser-first revision: no proxy or private verifier. Phase 2 must validate wallet-first routing and public RPC CORS/failover in a real browser.
4. Later, authorize static Pages/preview deployment setup, custom domain and optional analytics configuration through platform secrets. No backend bindings or notification-service secrets are needed for current scope. Ask before paid services; do not place any credentials in chat.
