# Wheelhouse

A static, browser-first Squeekchain holder console. The app is branded **Wheelhouse**; the GitHub repository remains **CryptoExplor/Squeekchain-console**.

**Equal-profile / subtract pass ready for draft review.** [PR #3](https://github.com/CryptoExplor/Squeekchain-console/pull/3) now includes the holder-first shell, with the user's approval to extend the current draft rather than create a separate branch. Phase 1 merged in PR #2; Phase 0 remains complete from its historical qualified source. This head has not run `test:live`. Offline tests are not live qualification. See [status and validation](docs/STATUS.md).

The light-first Wheelhouse design uses local Barlow Condensed, Quicksand and IBM Plex Mono, warm neutral surfaces and gold/blue accents. It is an independent community console, not the official dApp. See the [design contract and offline checks](docs/DESIGN.md).

[Review the 60 mocked screenshots](docs/screenshots/README.md): Squeeks, Network, Info, Settings, Merge dialog and not-deployed Mainnet, v9 Unstake, plus connected/disconnected header crops, each in light/dark at 1280px/390px. These are synthetic review fixtures, not live qualification. Shared DOM components live in `web/components.js`; missing values read **Unknown**, never an invented zero. All dist JavaScript totals **153,968 bytes gzipped**, below the build-enforced 250,000-byte budget, including lazy Developers/Settings modules ([breakdown](docs/audit/phase2-js-size.json)).

## Deployments and safety

Old `sepolia` inputs migrate once at hash/storage/MCP boundaries. Internal SDK, Activity and cache keys use canonical profile keys only. Mainnet is never guessed.

| Profile | Status |
|---|---|
| `sepolia-v6` | Sepolia v6. Published identity pins; verified reads and simulated owner actions. |
| `sepolia-v9` (default) | Sepolia v9. Dated two-peer identity pins; verified NFT/staking/issuance reads and simulated owner actions. |
| `mainnet` | **Not deployed**. No chain data/action panels. Saved Sepolia transaction Activity remains visible. |

- Sepolia is `11155111` / `0xaa36a7`. A connected Sepolia EIP-1193 wallet is preferred; otherwise reads go browser-direct to five role-aware public RPCs or a browser-local custom HTTPS RPC in Settings. No server proxy, paid RPC key or backend.
- Every snapshot requires block-hash agreement with two independent RPC peers (public endpoints plus any supplied RPC), checked again after the reads. Any disagreement makes the result unavailable.
- Full v6 verification checks the published implementations, runtime hashes, layout digests, admins/owners, versions, configuration and wiring at one block. v9 applies equivalent checks to the export-pinned six-contract graph, with twelve slot reads per operation (staking admin from storage). The result is cached **in memory for the session/profile, keyed by implementation addresses and proxy admins**. Each later snapshot re-reads all four EIP-1967 slots; changed slots trigger full verification and fail closed if they do not match the published record. Output distinguishes the full-verification block from the current slot-check block. Cached verification is committed only after the final block-hash check succeeds.
- Chain ID is probed once per transport, with concurrent probes shared; errors and wallet `chainChanged` invalidate it. Verification/status/art contract reads use multicall at the snapshot block. Several artwork IDs share one run/snapshot, in batches of up to 24.
- Public peers: Tenderly, PublicNode, Nodies, OnFinality and 0xRPC. State reads try Tenderly/PublicNode/Nodies first; history scans try **Tenderly → 0xRPC → OnFinality** before reducing the block range. Nodies is snapshot/state-only (its log range is capped at 50 blocks). HTTP 429/503 triggers a shared per-endpoint cooldown honoring `Retry-After` (positive seconds or HTTP date up to 300s; otherwise 30s), without delaying healthy fallbacks. Pruned/history/range/plan errors are availability failures; identity/hash mismatches still stop immediately. A custom RPC is tried first for state/log reads and joins the peers; a Sepolia wallet remains preferred. Public endpoints change often: use `npm run rpc:probe` for current capabilities.
- NFT discovery uses **owner-filtered incoming and outgoing Transfer events**. IndexedDB stores `{lastScannedBlock, lastScannedHash, ids}` per chain/release/NFT/owner. Subsequent reads scan only new blocks, detect reorged checkpoints, and confirm the final set using `balanceOf` and multicall `ownerOf` at the snapshot. Storage is never an ownership oracle. Node/private mode has an in-memory fallback. Tenderly is currently the only consistently reliable full-range log source in the user's checks, so preserving the incremental cache is especially important. When all log endpoints fail, the official account API can provide paginated **candidate wallet IDs only**. Candidates must match the configured NFT/account/chain context, their unique count must equal snapshot `balanceOf`, and every ID must pass multicall `ownerOf` at that same block before use or caching. Invalid/unavailable hints never become an empty balance; smaller-range logs are still tried where applicable.
- v6 claims deduplicate/sort NFT IDs in batches of 32. v9 claims account rewards, including SQK-only stakers, and supports claimAndStake. Both show simulated payout and re-preview after review; changed outcomes stop. v9 deposit/withdraw/mergeDeposited require confirmed depositor/custody; NFT and exact SQK approvals are separate explicit steps. Unstake reviews fee/net/maxFee/deadline and rejects a changed quote.
- Merges require **`BURN-<donorId>` before call construction**, then simulation, human review, a fresh verified simulation, and the owner's wallet signature. No automatic donor selection/submission. Address comparisons are case-insensitive.
- CLI/MCP hold **no owner keys** and never sign/submit transactions. The optional keeper is isolated in `keeper/`, off by default, and can only call `checkpoint()` after explicit dual opt-in.

The official API supplies display-only telemetry and untrusted discovery hints; it never supplies authoritative transaction inputs, ownership, payout, deployment addresses or capabilities. Unavailable data is Unknown, not zero. DotGrid metadata is isolated in `<img>`; immutable renderer/page runtime hashes are not published, so artwork integrity is not claimed verified.

## Run and test

Node 22 is pinned in `.nvmrc` and used in CI (within the package engine range).

```bash
npm ci
npm run web                    # build + local static file server, port 5173
npm run rpc:probe              # endpoint capability table; diagnostic, not live qualification
npm test                       # deterministic offline regressions, safety, RPC budget, discovery and Activity
npx playwright install --with-deps chromium
npm run test:browser            # real Chromium, injected/offline data: components, profile races, persistence, and the 44 mocked screenshot states
npm run test:live               # real Chromium + public Sepolia RPCs; no RPC mocks or signatures
```

The live test records public CORS RPC availability, two-peer block agreement and the published v6 graph/network snapshot. A failure must not be reported as a pass. The earlier sandbox attempt failed on the old three-endpoint list. That list was replaced following the user's real-network findings; the real-browser gate **passed on dd0afff in run 41618128325**. That pass does not qualify later commits automatically. Run `npm run rpc:probe` and `npm run test:live` locally. The Node probe checks chain ID, a head-minus-12 block, the pinned mining implementation slot at that block, and a 10k-block NFT Transfer log query per endpoint. It does not establish browser CORS, two-peer agreement or full deployment verification. The normal CI workflow installs Chromium **and OS libraries** and runs offline/browser checks only. Live qualification is isolated in the explicit-opt-in **thewheel** workflow; a failed live check fails that manual gate.

### Opt-in CI qualification gate: thewheel

`.github/workflows/live.yml` is named **thewheel**. It accepts `workflow_dispatch` or `pull_request` **`labeled` only**, with the live job gated on explicit dispatch or the newly added **`run-live`** label. No push, PR-open/synchronize, or scheduled live runs occur; other labels skip the job. On `ubuntu-latest`, with Node from `.nvmrc` and a 15-minute job timeout, it runs:

1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `npm run rpc:probe`
4. `npm run test:live`

It uses read-only repository permissions and no configured secrets, wallet, keeper or signing variables. Opted-in runs are serialized under the same concurrency group to avoid hammering public RPCs. Test failures are not ignored. An always-run artifact upload retains the HTML Playwright report, screenshots/traces/test attachments and **`live-qualification/live-qualification.json`**, including failure evidence. A not-run JSON is seeded before dependency/browser setup so a later setup or probe failure is not mistaken for a pass. The dedicated live reporter rejects empty/skipped/incomplete suites as qualification passes; ordinary browser tests remain separate.

**For the intended final follow-up head, the user re-triggers the pre-merge gate:** remove/re-add the **`run-live`** label and manually review the app in their browser before merge. The job checks out the event's exact **PR head SHA**, not GitHub's synthetic merge commit. `LIVE_SOURCE_COMMIT` carries that same SHA into both the initial and final qualification JSON. For `workflow_dispatch`, the checkout/evidence use the selected ref's event SHA. No `pull_request_target`, configured secrets or write permissions are used.

Dispatch from the Actions tab still requires the workflow on the default branch; the label trigger avoids that bootstrap requirement. I.e. no merge of this WIP PR is needed to run the label gate. Adding subsequent commits does not rerun live RPC tests automatically: remove and re-add `run-live` to qualify a newer head.

**Phase 0 is complete**, supported by the offline audit and [successful live run 41618128325 on dd0afff](docs/audit/live-qualification-run-41618128325.json). The Phase 3 structure head needs its own user-triggered live pass. Before merge, the opted-in live job must pass for the intended final source SHA. A skipped job, successful SDK call, endpoint probe, offline test, or stale JSON artifact is not a substitute. The workflow does not write phase status back to the repository or enable signing/keeper behavior.

### Live failure diagnostics

The live gate retains `verified-network-snapshot.json` and the Playwright failure trace, and also attaches **`rpc-network-diagnostics.json`**, plus **`rpc-tool-diagnostics.json`** when a tool returns error diagnostics. The network attachment passively records endpoint origin, method, HTTP status and JSON-RPC failure codes, plus explicit browser CORS-policy signals. A browser `TypeError`/`ERR_FAILED` alone is not proof of CORS. Tool diagnostics preserve the cause chain, original errors when chain-ID availability rechecks fail, and a bounded history of endpoint failures. Endpoint URL credentials, paths/query strings, request parameters/headers and arbitrary provider messages are deliberately omitted. Only recognized fetch-failure TypeErrors qualify as availability; other TypeErrors stop immediately, including through viem HTTP wrappers. Trust mismatches and reverts still fail closed; availability fallback does not retry changed transaction inputs.

### Chromium downloads and local Chrome

Some **linux-arm64** environments return **403** from the Playwright Chromium CDN. For `test:live`, use an **x64 machine** with the standard Chromium install above, or an already-installed local Chrome on a supported platform. The config accepts `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome` and passes it as Playwright's `channel: 'chrome'`:

```bash
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:live
# Alternatively, point directly at an existing compatible local Chrome/Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome npm run test:live
```

Choose one override. These options do not install Chrome or make an unsupported browser/platform combination work; Chrome must already be installed. This bypasses the bundled Chromium download, not RPC/CORS or verification checks. CI still installs Chromium with `npx playwright install --with-deps chromium`.

The v6 Chain pulse panel shows the **live settlement frontier**, not a hardcoded round. If the live next round is unsettled and mining has no settlement backlog, it says no new rewards are being issued **at that snapshot**, while existing rewards may still be claimable. The notice updates when checkpoint readiness/frontier changes and clears on read failure or profile switch; it does not infer a permanent freeze from one read.

Switching profiles always wins: reads abort, generation IDs invalidate late results, profile/wallet/position/claim/merge/receipt-view state clears before new reads, and only signing has a busy lock. A wallet request or transaction already sent cannot be cancelled by navigation. Broadcast hashes are saved immediately in localStorage and shown under **Activity across all profiles**, including Mainnet; receipts are monitored while the tab is open and rechecked after reload. No transaction is automatically resubmitted. Closing the tab stops monitoring until it is opened again.

## Static deployment (Vercel)

The current deployment target is Vercel: build with `npm run build` and publish `dist/`. No backend or RPC proxy. Phase 7 CSP/Lighthouse work is not included here. Cloudflare alerts, cron, push, Telegram and OG extras remain deferred; alerts stay in-tab.

### Legacy Cloudflare Pages configuration (optional, not the current target)

Use a **Pages** Git integration, not Workers Builds:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Root | Repository root |
| Build variables | None required |

Pages publishes `dist/` automatically. `dist/` is generated, ignored and **not committed**; the build checks source/output parity. There is no Worker entry point. `npx wrangler deploy` is the wrong deployment command for the existing Pages configuration. For manual deployment to an existing Pages project use `npx wrangler pages deploy dist --project-name=YOUR_ACTUAL_PAGES_PROJECT_NAME` with appropriate account permissions. Do not confuse the token name with the project name.

## Holder-first navigation

- **Squeeks · Art · Network · Info**, with URL hashes (`#sepolia-v9/squeeks`, `#sepolia-v6/info/trust`, etc.). New sessions default to Network; connecting a wallet or viewing an address selects Squeeks. Explicit hashes survive reload and browser history. Legacy `selectTab('holdings'|'overview'|'agent')` API calls remain display-only aliases.
- Profile status opens **Info › Trust**. The wallet menu has copy address, Activity with a pending count, and disconnect. Saved Activity remains reachable without reconnecting, including on Mainnet, where the menu cannot connect or submit.
- **Settings**: browser-local custom HTTPS RPC save/test/remove, IndexedDB log-cache clear, confirmed Activity clear, and light/dark/system theme. RPC tests show chainId/block but do not establish two-peer trust.
- **Info**: How it works, Trust, Status, Contracts, Developers (existing console, tools.json and local MCP snippet), About. Trust lists snapshot hash peers as Agreed and unsampled configured peers as Not sampled; it does not invent per-read provenance.
- Existing claim/merge inputs and BURN/simulation/signing behavior are unchanged. Selection actions, merge planner and per-Squeek pages are Phase 4, not implemented here. v9 staking actions are integrated; policy reads follow the active profile.
- The Genesis referral link now lives in Info › About, unchanged. Hero, introductory/section eyebrows, network strip and action/capability cards on Squeeks are removed.

## Unsigned CLI and MCP

```bash
node src/cli.js --help
npm run verify
npm run status
npm run checkpoint -- --from 0xCALLER
npm run claim -- --owner 0xOWNER --ids 1,2
npm run merge -- --owner 0xOWNER --survivor 1 --donor 2 --confirm BURN-2
npm run mcp
```

Replace the illustrative addresses with real public addresses. Owner actions return unsigned calls for the owner's wallet. No `--live`, private-key option, unattended owner automation or `mine` command exists.

MCP defaults to `SQUEEK_PROFILE=sepolia-v9`; every read/prepare tool accepts `profile: "sepolia-v6" | "sepolia-v9"`. Shared names/descriptions/schemas live only in `sdk/tools.js`, published as `web/tools.json` and checked against MCP/browser metadata. Browser tools use `window.squeek.callTool(name, args)`. MCP and SDK are read/prepare only. Browser-only `squeek_request_*` tools can ask the human wallet after simulation, via `window.squeek` or same-origin postMessage; merges require BURN acknowledgement and agents never see a private key. The CLI commands above remain v6 helpers.

For an operator-run checkpoint keeper, read `keeper/checkpoint.mjs`: both `CHECKPOINT_KEEPER_ENABLED=true` and `--submit-checkpoint` are required, with a dedicated low-value keeper account supplied outside the app. Its target, calldata and value are fixed/checked; it is not exposed through CLI/MCP and is not enabled by any package script. Never supply an owner key.

## Repository layout

- `sdk/`: pinned record, snapshot/RPC trust, verification cache, discovery, unsigned previews, shared tool schemas.
- `web/`: light-default UI, saved theme, local fonts, telemetry and persistent transaction Activity.
- `mcp/`: local stdio, read/prepare-only.
- `src/`: unsigned public owner CLI and compatibility facades.
- `keeper/`: separate checkpoint-only opt-in script.
- `test/`: offline and Playwright suites.
- `build.mjs`, `wrangler.toml`: existing static build/Pages architecture, preserved.

Independent community software. Sepolia testnet only; not investment advice.
