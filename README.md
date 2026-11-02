# Wheelhouse

A static, browser-first Squeekchain holder console. The app is branded **Wheelhouse**; the GitHub repository remains **CryptoExplor/Squeekchain-console**.

**WIP — Phase 0 live qualification has not passed.** Offline tests and browser layout/race tests are not proof of public RPC availability, current contract identities, or transaction success. See [status and validation](docs/STATUS.md).

## Deployments and safety

| Profile | Status |
|---|---|
| `sepolia-v6` (default) | **Supported**, docs-pinned v6. Transactions require verified identities, live ownership/eligibility and successful simulation. No hardcoded settlement frontier or claimability. |
| `sepolia` | Observed v9, **read-only (unverified)**. No published record/ABIs for supported actions. All transaction paths, including transfer and checkpoint, are absent/disabled. |
| `mainnet` | **Not deployed**. No chain data/action panels. Saved Sepolia transaction Activity remains visible. |

- Sepolia is `11155111` / `0xaa36a7`. A connected Sepolia EIP-1193 wallet is preferred; otherwise reads go browser-direct to three public RPCs or a browser-local custom HTTPS RPC. No server proxy, paid RPC key or backend.
- Every snapshot requires block-hash agreement with two independent public RPCs, checked again after the reads. Any disagreement makes the result unavailable.
- Full v6 verification checks the published implementations, runtime hashes, layout digests, admins/owners, versions, configuration and wiring at one block. The result is cached **in memory for the session/profile, keyed by implementation addresses and proxy admins**. Each later snapshot re-reads all four EIP-1967 slots; changed slots trigger full verification and fail closed if they do not match the published record. Output distinguishes the full-verification block from the current slot-check block. Cached verification is committed only after the final block-hash check succeeds.
- Chain ID is probed once per transport, with concurrent probes shared; errors and wallet `chainChanged` invalidate it. Verification/status/art contract reads use multicall at the snapshot block. Several artwork IDs share one run/snapshot, in batches of up to 24.
- NFT discovery uses **owner-filtered incoming and outgoing Transfer events**. IndexedDB stores `{lastScannedBlock, lastScannedHash, ids}` per chain/release/NFT/owner. Subsequent reads scan only new blocks, detect reorged checkpoints, and confirm the final set using `balanceOf` and multicall `ownerOf` at the snapshot. Storage is never an ownership oracle. Node/private mode has an in-memory fallback.
- Claims deduplicate/sort IDs, batch at 32, verify every owner and show the simulated payout. Each batch is re-previewed after human review; changed amounts stop the flow.
- Merges require **`BURN-<donorId>` before call construction**, then simulation, human review, a fresh verified simulation, and the owner's wallet signature. No automatic donor selection/submission. Address comparisons are case-insensitive.
- CLI/MCP hold **no owner keys** and never sign/submit transactions. The optional keeper is isolated in `keeper/`, off by default, and can only call `checkpoint()` after explicit dual opt-in.

The official API is display-only telemetry/offchain data; it never supplies transaction inputs. Unavailable data is Unknown, not zero. DotGrid metadata is isolated in `<img>`; immutable renderer/page runtime hashes are not published, so artwork integrity is not claimed verified.

## Run and test

Node 22 is used in CI.

```bash
npm ci
npm run web                    # build + local static file server, port 5173
npm test                       # deterministic offline regressions, safety, RPC budget, discovery and Activity
npx playwright install --with-deps chromium
npm run test:browser            # real Chromium, injected/offline data: layout, profile races, transaction persistence
npm run test:live               # real Chromium + public Sepolia RPCs; no RPC mocks or signatures
```

The live test records public CORS RPC availability, two-peer block agreement and the published v6 graph/network snapshot. A failure must not be reported as a pass. The current sandbox reports **Failed to fetch for all three public RPCs**; run `npm run test:live` locally to establish live qualification. CI installs Chromium **and OS libraries**, runs offline/browser checks, and offers the live check as a manually enabled, non-blocking workflow step.

Switching profiles always wins: reads abort, generation IDs invalidate late results, profile/wallet/position/claim/merge/receipt-view state clears before new reads, and only signing has a busy lock. A wallet request or transaction already sent cannot be cancelled by navigation. Broadcast hashes are saved immediately in localStorage and shown under **Activity across all profiles**, including Mainnet; receipts are monitored while the tab is open and rechecked after reload. No transaction is automatically resubmitted. Closing the tab stops monitoring until it is opened again.

## Static Cloudflare Pages deployment

Use a **Pages** Git integration, not Workers Builds:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Root | Repository root |
| Build variables | None required |

Pages publishes `dist/` automatically. `dist/` is generated, ignored and **not committed**; the build checks source/output parity. There is no Worker entry point. `npx wrangler deploy` is the wrong deployment command for the existing Pages configuration. For manual deployment to an existing Pages project use `npx wrangler pages deploy dist --project-name=YOUR_ACTUAL_PAGES_PROJECT_NAME` with appropriate account permissions. Do not confuse the token name with the project name.

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

MCP defaults to `SQUEEK_PROFILE=sepolia-v6`; `sepolia` exposes only unverified observations/art. Shared schemas are in `sdk/tools.js`, published as `web/tools.json`. Browser tools are available through `window.squeek.callTool(name, args)`; cross-origin messages cannot request wallet actions.

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
