# Wheelhouse — current Phase 1 WIP status

**Date:** 2026-11-02 (Asia/Calcutta). **PR:** #2, open/draft. **Branch:** `arena/314fd2af-squeekchain-console`. App rebrand approved; repository name unchanged.

## Qualification gate

**Phase 0 remains incomplete.** The new real-browser `npm run test:live` check was attempted once after the RPC/discovery load fixes and failed before contract verification: all three public RPC probes returned `Failed to fetch`. This is not proof of rate limiting, CORS rejection, TLS failure, current identity mismatch, a frozen frontier, or transaction failure. No live reads qualified and no transactions were submitted.

Evidence: [`audit/live-qualification-2026-11-02.json`](audit/live-qualification-2026-11-02.json). The user will run the live check locally. Mark Phase 0 complete only after a live qualification suite passes, keeping the successful evidence. The historical jsdom smoke failure is not retried here. Public RPC availability is not a Phase 1 blocker.

## Implemented in place

- **Wheelhouse design:** light-default, saved theme, local Barlow Condensed/Quicksand/IBM Plex Mono, gold/blue, original wheel artwork, responsive wallet/verification visibility, keyboard focus lifecycle and reduced motion. No Lighthouse score or blanket WCAG certification is claimed.
- **Supported deployment:** v6 default, pinned to the official Sepolia record. Observed v9 remains read-only/unverified; all transaction paths are disabled/absent. Mainnet has no chain panels or transaction buttons.
- **Keys:** web/MCP/owner CLI never load an owner key. MCP has no submit tool or keeper configuration. Separate checkpoint-only keeper requires both explicit enablement and `--submit-checkpoint`, checks to/data/value and is off by default; it has not been enabled or run.
- **Session verification:** full pinned verification at a single snapshot block on first use; in-memory cache keyed by release/profile graph, implementation addresses and proxy admins. Every operation reads the four EIP-1967 slots at its snapshot, re-verifies changed identities, and rejects unpublished values. Full-verification provenance and current slot-check provenance are separately reported. No cache trust is written before final hash agreement. Immutable renderer/page hashes are not published; artwork integrity stays Unknown.
- **RPC work reduction:** one chain-ID probe per transport with shared in-flight probes; invalidate/recheck on errors and wallet chain changes. Multicall batches verification/status/art. Two independent public block hashes still agree at each snapshot and are rechecked afterward; hashes are never session-cached. Wrapped trust errors cannot be retried away through fallback.
- **Request budget:** actual JSON-RPC requests counted through real viem transports with synthetic offline wire responses: **22 cold network, 12 warm network, 15 warm wallet**. Warm budgets fail above 25. A multi-ID artwork batch uses one `eth_call` and one snapshot. These are deterministic test counts, not measured live RPC performance. Wallet refresh reuses network state and a pure merge plan from the same snapshot rather than loading them again.
- **Discovery:** ABI-indexed incoming `Transfer(to: owner)` and outgoing `Transfer(from: owner)` filters, never collection-wide history. IndexedDB stores the frontier/hash/IDs and scans only new blocks. Reorged/future checkpoints are discarded. Each final set is checked against same-block `balanceOf` plus multicall `ownerOf`. No ownerOf sweep fallback or API-derived ownership.
- **Explicit actions:** BURN-donor required before merge calldata; post-review fresh simulation/verification. Claim batches re-preview and stop on amount changes or reverts. Case-insensitive owner comparisons. No changed-input transaction retries.
- **Profile isolation:** every load gets a generation/controller. Switches bypass the signing-only busy lock, abort reads, clear profile/wallet/position/output/receipt-view state and drop late results. Explicit modal Cancel returns `cancelled`; a switch returns `profile-changed`.
- **Activity:** broadcast hash/label/chain/time persisted immediately, even if the wallet returns after a switch. Activity lives outside the profile generation and remains visible on Mainnet. Receipt block hashes are checked against the public peers; mined receipts stay distinct from final status until 12 confirmations. Storage receipts are re-read after reload; unknown outcomes stay pending and never trigger transaction submission/retry. Monitoring is tab-open only.
- **Static build:** no backend, own RPC proxy or Worker entry point. `dist/` is removed from Git and ignored; Cloudflare Pages builds it. Build-time source/output parity includes Activity. Existing `sdk/`, `src/`, `mcp/`, `test/`, `build.mjs`, `wrangler.toml` architecture retained.

## Validation

- `npm test`: passes UI/telemetry/modal regressions, published-record characterization/local ABI parity, stdio tool listing, same-block identity mismatch cases, actual wire request budgets, chain/cache invalidation, IndexedDB filtered/incremental/reorg discovery and Activity persistence/reverts/unavailability.
- `npm run test:browser`: **5 passing Chromium tests**: light/saved theme and responsive layout; pending-RPC switch; three rapid switches; pending-simulation switch; late broadcast persistence/receipt tracking across a switch and reload. RPC/adapters are mocked in this suite; it is not live qualification.
- `npm run build`: passes; `dist/` output parity is a build check, not tracked generated content.
- CI includes `npx playwright install --with-deps chromium`. The sandbox used an npm-distributed Chromium with bundled system libraries because browser download hosts are restricted; that temporary package/binary is not a project dependency or committed artifact.
- `npm run test:live`: **failed / unavailable in this environment**. Do not mark it passed from any offline result.

## Sources and historical evidence

Pinned data were read from the published record and approved in the user's audit of `1a747a7`; no pinned values were changed in this follow-up. Earlier observations are preserved in [`audit/observations-2026-11-02.json`](audit/observations-2026-11-02.json) as historical evidence, never runtime transaction configuration.

Official material read for the integration:
- [llms-full.txt / skill alternative](https://docs.squeekchain.com/llms-full.txt)
- [Sepolia deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json)
- [Quickstart](https://docs.squeekchain.com/developers/quickstart.md), [all eleven Build with AI safety rules](https://docs.squeekchain.com/developers/build-with-ai.md)
- [Owner actions](https://docs.squeekchain.com/developers/owner-actions.md), [API](https://docs.squeekchain.com/developers/api.md), [DotGrid](https://docs.squeekchain.com/developers/dotgrid.md)
- Published [Core](https://docs.squeekchain.com/assets/abi/SqueekCore.json), [Mining](https://docs.squeekchain.com/assets/abi/SqueekMining.json), [NFT](https://docs.squeekchain.com/assets/abi/SqueekNFT.json), [Token](https://docs.squeekchain.com/assets/abi/SqueekToken.json) and renderer ABI pages.

Complete remote/local ABI byte-for-byte parity and a browser comparison with the official dApp have not been claimed. Stop if a required official source cannot be read; never substitute API observations or remembered ABIs as trust pins.

## Deferred / not claimed

No mainnet deployment or v9 owner integration; no real signed transaction test; no closed-tab alerts, remote MCP, OG/alert Worker/D1, EIP-6963/WalletConnect integration or paid service provisioning. Official API/Genesis unavailability remains Unknown, including `launch_unconfigured`. No repository rename or PR closure. PR #2 stays WIP pending review and local live qualification.
