# Wheelhouse evolution — Phase 0 audit

**Audit date:** 2026-11-02 (Asia/Calcutta).  
**Baseline:** `a592f15` (merged PR #1, current branding: The Wheel).  
**Working branch:** `arena/314fd2af-squeekchain-console`.  
**Scope:** inspection, historical evidence, offline characterization tests and a delivery plan; no feature rollout, contract changes, transaction submission, keeper activation, paid service provisioning or rename.

## Decision / completion gate

**Phase 0 is partially complete, not production approval.** Repository inspection and published-record/API comparison are complete. A real-browser comparison and same-block onchain verification remain blocked by this environment. Do not mark the live profile supported, enable undocumented flows, or claim the live smoke suite passes on this evidence.

The old branch in the brief (`arena/13984554-squeekchain-console`) was merged into this baseline. Work stays on the active session branch. Each later phase should be a separate reviewed PR, sequentially after the previous phase is merged; this session must not create or switch to another branch.

Branding remains **The Wheel**. “Wheelhouse” is a proposed product name in this plan, not a completed rename. Obtain explicit confirmation before changing app/package branding or renaming the GitHub repository to `squeek-wheelhouse`.

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
- Telemetry (`web/telemetry.js`) has ETag/304, a 10s timeout, version check and numeric Retry-After backoff, but no explicit HTML/challenge detection, general schema validation or RPC/KV fallback. RPC cannot reconstruct live wheel RPM or launch config that has not been published: these remain Unknown. Onchain state can have an independently labeled verified RPC fallback.
- No API client for account earnings/activity, settlement charts, events, economy or Genesis; no pagination, snapshot-consistency or cursor-reorganization handling for those views.
- No `/squeek/:id` routing, token share page or OG image.
- UI typography/fonts, colors, panel/control radii, dots, light default and stored dark toggle are present. Missing system-theme-following-before-user-choice behavior, skeleton components, standardized reusable component interfaces and the requested header/footer text. No WCAG/Lighthouse or visual matching claim is supported by jsdom tests.
- Wallet provider is `window.ethereum`; no EIP-6963 discovery or WalletConnect.
- No Vite/TypeScript layer yet. Preserve `build.mjs` as orchestration when migrating; do not replace the repo.
- No CSP `_headers`, Playwright E2E, Cloudflare bindings/workers/functions, scheduled tasks, alert store/delivery, remote MCP, analytics or PR preview workflow. Ignore rules also need `.env`/local Worker secret files before adding backend secrets.

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

## Cloudflare deployment boundaries

Keep `wrangler.toml` for **Pages** static output (`dist/`) and same-origin Functions routes such as `/rpc`, `/snap/*` and `/og/squeek/:id` where appropriate. Existing config is only a Pages name/output/date; no resources are provisioned.

Cron Triggers and Durable Object class ownership require **separate Worker deployment/configuration**, not just routes in a Pages project:

- Snapshot/alert scheduled Worker: cron every 1–5 min, KV/D1 bindings, verified read clients, idempotent deliveries and source/freshness metadata. Pages and Workers share bound resources.
- Remote MCP Worker: Agents SDK `McpAgent` Durable Object and streamable HTTP `/mcp`; route via custom-domain routing or a Pages proxy/service binding. Shared SDK tool registry; no signing keys and no owner submit tools.
- Optional keeper Worker: separate key boundary, checkpoint-only, default off; explicit operator approval before configuration or deployment.
- RPC proxy: fixed upstream allowlist (never arbitrary client URLs), timeouts, payload/log-range limits, actual network checks, per-IP rate-limit binding and only approved methods. No raw or wallet transaction broadcasting.

**RPC allowlist conflict to resolve before Phase 2:** existing verification uses `eth_getStorageAt` and actual network verification requires `eth_chainId`; pinning/reorg checks use `eth_getBlockByNumber`. None is in the six-method public proxy allowlist in the brief. Do not silently broaden it or pretend `eth_call` can read EIP-1967 slots. Either explicitly approve those additional read-only methods, or keep the public six-method allowlist and run full verification in a private Worker RPC client, returning a constrained verified-snapshot endpoint. This choice must still preserve verifiable block/hash and identity evidence.

Web Push requires user opt-in, service worker lifecycle, VAPID secrets, deletion/unsubscribe and alert deduplication. Telegram requires explicit chat opt-in and a bot secret. Avoid storing endpoint secrets or personal subscription data in public KV snapshots. Never commit credentials. D1 and rate-limit binding usage, domain routing and analytics configuration need account access/approval; no resources were created here.

## Phase PR sequence / exit criteria

| Phase | In-place changes | Required exit tests |
|---|---|---|
| 0 — Audit (this PR) | Status, dated evidence, offline characterization | Offline tests/build; browser + same-block RPC evidence still required before completion |
| 1 — Design system | Existing web tokens/components/header/footer, local fonts, theme preference state; branding only after confirmation | Keyboard/dialog/focus tests, theme tests, contrast and mobile visual review |
| 2 — Data layer | `sdk/profiles.ts`, verified single-block clients, schema-aware API, permitted RPC/verified-snapshot strategy, bigint states; retain JS/MCP compatibility through build orchestration | Mismatch/reorg/403/HTML/304/429/unavailable fixtures, profile isolation and full verification tests |
| 3 — Holder workspace | Wallet/deposited portfolio, exact simulated payouts, EIP-5792, `BURN-<id>`, planner, route/share, activity/earnings | Mock-wallet tests proving no unconfirmed burn, no unsupported v9 builder, no duplicate sends; live Sepolia smoke |
| 4 — Network and Genesis | Economy/queue/events/settlements and launch/wallet views with Unknown states | Unconfigured launch, pagination and partial-data tests; graph mismatch display |
| 5 — Cloudflare backend | Pages Functions plus scheduled Worker, KV/D1, alerts, OG routes; optional keeper remains off | Local Worker tests for allowlist/rate limits/failover, schedules, idempotency, secret boundaries and opted-in alerts |
| 6 — Agents | Remote MCP Worker/DO, shared generated manifest, client setup docs | Streamable-HTTP/MCP conformance and identical read/prepare semantics, no signer/submit exposure |
| 7 — Hardening | Offline fixtures, Playwright mock wallet, security headers, size/perf/accessibility CI, deployment docs and PR previews | Offline + live suites, mobile Lighthouse >=90, <200 KB initial gzip JS, reviewed CSP and preview deployment |

No claim is made that later phases have been implemented or deployed in this audit PR.

## Required input / remaining blockers

1. Provide a browser-run identity comparison (or a browser-capable environment) and permitted Sepolia RPC connectivity for live smoke and same-block verification. No private key is needed or requested.
2. Confirm whether branding may change to **Wheelhouse**. GitHub repo rename is a separate action requiring approval and is not part of this session's fixed branch handling.
3. Choose the public-proxy verification strategy above before the data-layer PR. The private verifier endpoint option preserves the exact public method allowlist.
4. Later, authorize Cloudflare account/project setup, preview deployment credentials through platform secrets, custom domain, analytics token and opt-in notification channels. Ask before paid services; do not place any credentials in chat.
