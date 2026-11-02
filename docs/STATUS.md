# Wheelhouse — current Phase 1 WIP status

**Date:** 2026-11-03 (Asia/Calcutta). **PR:** #2, open/draft. **Branch:** `arena/314fd2af-squeekchain-console`. App rebrand approved; repository name unchanged.

## Qualification gate

**Phase 0 remains incomplete.** The new real-browser `npm run test:live` check was attempted once after the RPC/discovery load fixes and failed before contract verification: all three public RPC probes in the **old** endpoint list returned `Failed to fetch`. This is not proof of rate limiting, CORS rejection, TLS failure, current identity mismatch, a frozen frontier, or transaction failure. No live reads qualified in that sandbox attempt and no transactions were submitted. The subsequent user-reported SDK successes below are partial live evidence, not a completed Playwright qualification.

Evidence: [`audit/live-qualification-2026-11-02.json`](audit/live-qualification-2026-11-02.json). The user will run the live check locally. Mark Phase 0 complete only after a live qualification suite passes, keeping the successful evidence. The historical jsdom smoke failure is not retried here. Public RPC availability is not a Phase 1 blocker.

## Public RPC availability follow-up

Public endpoints change often; configured roles are availability preferences, not trust pins. The user reported real-network checks at **2026-11-02 23:50 IST**: dRPC rejects the free plan, 1RPC is forbidden, and PublicNode serves state but returns error `4444` for pruned log history. Those observations explain why the old list cannot satisfy two-peer availability; they do not qualify this app's full live verification.

- Replaced dRPC/1RPC with **Tenderly, PublicNode, Nodies, OnFinality, 0xRPC**. Any two healthy independent peers can establish snapshot agreement. State reads prefer Tenderly → PublicNode → Nodies, then OnFinality → 0xRPC.
- Log scans use **Tenderly → 0xRPC → OnFinality**, trying the same range on all log-role endpoints before shrinking on pruned/range failures. Nodies remains snapshot/state-only (reported 50-block log cap). OnFinality is a last resort; HTTP 429/503 sets a shared session cooldown honoring `Retry-After` seconds/HTTP date (positive and <=300s, otherwise 30s). Cooling endpoints are skipped, including identity re-probes; healthy fallbacks do not wait. Historical-state, pruned-history, range-limit, forbidden and free-plan errors fail over as availability errors. Wrong-chain, implementation and hash mismatches remain fail-closed trust failures.
- Settings retains the custom RPC option: it joins the peer set and is first for state/log reads; aliases on one origin cannot count as two peers. A connected Sepolia wallet stays preferred, with availability-only fallback to the role-appropriate public endpoints.
- Run **`npm run rpc:probe`** locally for a per-endpoint table: chain ID, a head-minus-12 block/hash, the mining EIP-1967 implementation slot at that block, and an inclusive 10k-block NFT Transfer log query. Requests time out after 15 seconds. Each capability reports independently; a log failure does not disqualify an otherwise healthy snapshot/state peer. This Node diagnostic does not test browser CORS, peer agreement or the full graph and is **not Phase 0 qualification**.
- Offline regression coverage uses the reported `4444: pruned history unavailable`, `historical state unavailable`, `range too large`, `35: chain is not available on free plan` and `forbidden` payloads; asserts unchanged-range endpoint failover before chunk shrinking, custom/wallet behavior and trust-stop behavior.

**Phase 0 is still incomplete.** The replacement list awaits the user's local `npm run test:live` result. The old failed evidence is retained, not relabeled as a pass.

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

**Phase 0 remains incomplete until the user supplies a successful `npm run test:live` result.** PR #2 stays open/draft/WIP.

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
- `npm run test:browser`: **6 passing Chromium tests**: light/saved theme and responsive layout; pending-RPC switch; three rapid switches; pending-simulation switch; late broadcast persistence/receipt tracking across a switch and reload; live-derived v6 frontier messaging/advancement/failure/switch/mobile behavior. RPC/adapters are mocked in this suite; it is not live qualification.
- `npm run build`: passes; `dist/` output parity is a build check, not tracked generated content.
- CI includes `npx playwright install --with-deps chromium`. The sandbox used an npm-distributed Chromium with bundled system libraries because browser download hosts are restricted; that temporary package/binary is not a project dependency or committed artifact.
- `npm run test:live`: the **historical sandbox attempt failed / was unavailable**; the updated full suite is **pending local qualification**. The user-reported SDK checks above do not mark it passed.

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

No mainnet deployment or v9 owner integration; no real signed transaction test; no closed-tab alerts, remote MCP, OG/alert Worker/D1, EIP-6963/WalletConnect integration or paid service provisioning. Official API/Genesis unavailability remains Unknown, including `launch_unconfigured`. No repository rename or PR closure. PR #2 stays WIP pending review and local live qualification.
