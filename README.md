# The Wheel

**The Wheel** is a wallet-first console for [Squeekchain](https://squeekchain.com) — a wheel you spin for SQK: **anyone can checkpoint**, **Squeek holders can claim, merge and inspect**, and **agents can drive the whole thing** over MCP or `postMessage` — with every signature happening in the user's own wallet.

Built light-first in Squeekchain's own design language (Barlow Condensed / IBM Plex Mono / Quicksand, gold `#d9a017` + blue `#4460cf`, 10px panels, 4px controls, dotted grid), with a dark theme one click away. The three typefaces are **vendored as woff2 in `web/fonts`** — no CDN, no third-party request at runtime.

```
sdk/            one isomorphic core: reads + unsigned tx builders + deployment profiles
web/            the console (index.html, app.js, styles.css, bundle.js) + local static server
mcp/            stdio MCP server (reads + prepare-only transactions)
src/            keeper CLI (optional hot key, unattended checkpoint loop)
test/ui.mjs        deterministic UI + telemetry tests (no network)
test/web-smoke.mjs  optional live Sepolia integration checks
build.mjs       esbuild bundle + tools.json + dist/ static site
```

---

## Read this first: two deployments

Squeekchain's Sepolia graph has moved on from the published docs, and the console is honest about it.

| Profile | What it is | Status in this build |
|---|---|---|
| **Sepolia (live)** | The graph the official dApp (`sepolia.squeekchain.com`) talks to: core `0x980B…3d44`, issuance **v9** `0xcd46…dc62`, staking v2 `0x4b67…ea4F`, new SqueekNFT `0xCB98…B70F`, token `0x5501…Db60`, launch/dispenser `0x1ff6…E04Dd`. 9,972 Squeeks live, `mergesOpen = true`. | **Reads + art + verification.** Owner actions are gated: v9's flows (staking deposits, `SqueekNFT.merge`, issuance checkpoint) are **not documented**, so this build shows state and refuses to guess. |
| **Sepolia · docs v6** | The deployment the docs pin: SqueekMining v6 `0x3beE…7EC4`, core `0x7466…119f`, token `0x6872…cc76`, NFT `0x0eAF…05c6`. | **Fully supported**: checkpoint, claim, merge, merge planning. But its settlement frontier is **frozen at round 1973**, so `checkpoint()` reverts `RoundNotSettled`. |
| **Mainnet** | — | **No deployment exists.** Shown explicitly instead of pretending. |

The console labels each profile in the UI (`legacy` / `experimental` / `not-deployed`), explains it in-page, and — for the live profile — marks verification as *untrusted-but-checked*, because those addresses come from the official dApp bundle and `api.squeekchain.com/v1`, not from a published deployment record.

### Why your checkpoint reverted

```
tx 0xf5f460f1…f583a6 → SqueekMining 0x3beE…7EC4, data 0xc2c4c5c1 (checkpoint())
status: reverted · gasUsed 65,689 of 2,000,000 · no logs
revert data: 0x3db78c7c 0000…07b6  →  RoundNotSettled(1974)
```

Two facts stack up:

1. `checkpoint()` processes rounds that `SqueekCore` has **certified**. At that block `processedThroughRound = 1973` and round 1974 was not settled, so it reverted with `RoundNotSettled(1974)`. This is not "not enough gas" and not a broken contract — it is the documented "wait for the settlement relayer" case. The console checks `checkpointStatus()` first and disables the button with the same reason.
2. It could not have worked anyway: the **v6 graph is no longer fed.** Settlements now land on the newer core (`0x980B…`, settled round 1013 growing), so `settledThroughRound` on the old core never advances past 1973. Any `checkpoint()` against the old address will keep reverting `RoundNotSettled`, no matter when you send it.

Also worth noting from that transaction: it was sent as a **legacy type-0 transaction with `gasPrice = 20 wei`** (Sepolia base fee was gwei-scale). Bump the fee or let the wallet manage EIP-1559 fees — underpriced-submission habits are how "I clicked at the right moment" transactions end up in a weird state.

---

## Features

**Everyone (no Squeek needed)**
- See settled round, block height, checkpoint lag, issuance, supply, live Squeek count
- Run `checkpoint()` when the chain allows it — simulated first, signed in the wallet
- Inspect any address read-only, no wallet required

**Holders**
- Positions with level, power, pending activation, merge cooldown, per-token claimable SQK
- **Claim** in 32-ID batches (simulated, then one wallet popup per batch)
- **Merge plan**: same-level pairs that already satisfy every onchain precondition, with power before → after
- **Merge guard**: the dialog names both IDs, states the donor is burned permanently, and requires typing the donor ID
- **Onchain art**: `tokenURI` decoded into name, 11 traits and the DotGrid SVG, rendered as an isolated `<img>` (never inline markup)

**Agents**
- `window.squeek.callTool(name, args)` in the page
- `postMessage` bridge: `{type:"squeek.tool"}` → `{type:"squeek.result"}`
- MCP stdio server with the same tool names and JSON Schemas (`web/tools.json` is generated from `sdk/tools.js`, so they cannot drift)
- Merge tools require `confirm: "BURN-<donor>"`; there is no MCP claim/merge submit path at all

---


## Holder dashboard update

- **Light-first frontend:** spacious Squeekchain-inspired typography, gold accents, dotted paper background, an original inline wheel illustration, mobile layout, and a saved dark-mode preference. This is an independent community console, not the official site.
- **Official wheel telemetry:** `/v1/status` is polled every 15 seconds for RPM, speed and daily distance. Supports ETag/304, request timeouts and Retry-After backoff. Unsupported or malformed responses show unknown; stale measurements never masquerade as current activity. Device measurements are not settled work and never enter transaction builders.
- **Holder workspace:** visible per-profile capability cards for claims, merges, staking and DotGrid art, alongside the position table, optional token-ID claim selection, a custom survivor/donor pair picker, simulated claim batches and irreversible merge confirmation. Claims reject unowned selections rather than silently dropping IDs, and re-read ownership before preparation.
- **Honest mainnet view:** mainnet can now be selected to inspect launch availability. It has **no configured deployment and no enabled transactions**. Adding production support requires an official mainnet deployment record, published ABIs, verified identities and transaction-flow tests; changing the chain ID alone is not sufficient.
- **Profile isolation:** changing deployment clears chain metrics, holdings, tools, output and art; late responses from the previous profile are discarded.
- **Tests:** `npm test` runs offline with injected adapter and API responses. It does not prove current contract availability; `npm run test:live` retains the real-network integration checks.

### Name suggestions

| Dapp | Repository | Why |
|---|---|---|
| **Squeek Station** (recommended) | `squeek-station` | A home for holder actions, network activity and developer tools. |
| The Wheel (current) | `squeekchain-wheel` | Short, memorable and native to the hamster-powered idea. |
| Squeek Nest | `squeek-nest` | A friendly home for NFT collections and rewards. |

These are suggestions, not availability or trademark checks. The existing app branding, package name and repository have not been renamed.

## Run The Wheel locally

```bash
npm install
npm run web     # builds bundle + dist, serves http://localhost:5173
npm test        # offline UI + telemetry regression checks
npm run test:live # optional: real Sepolia integration (requires RPC connectivity)
```

Wallet note: the page needs an injected EIP-1193 wallet (MetaMask, Rabby, Frame). Inside a sandboxed preview iframe extensions often stay out — open `http://localhost:5173` in a normal tab. Read-only inspection always works.

## Deploy

`npm run build` emits a fully static `dist/` (no server, no env vars, no build-time secrets).

| Target | How |
|---|---|
| **Cloudflare Pages** | Connect the repo → build `npm run build`, output `dist`. Or `npx wrangler pages deploy dist` (`wrangler.toml` included). **Recommended.** |
| **Vercel** | Import the repo; `vercel.json` already sets `buildCommand` and `outputDirectory=dist`. |
| **GitHub Pages** | Push to `main`; `.github/workflows/deploy.yml` builds, runs the smoke test, uploads and deploys. |

Cloudflare Pages is the better default here: this is a static bundle that talks to public RPCs, so Cloudflare's unmetered bandwidth and edge caching fit better than Vercel's function-oriented free tier. Vercel is the nicer DX if you want previews per PR or plan to add server routes later. Neither can host the MCP server — that runs on the user's machine over stdio (or later as a Cloudflare Worker/SSE remote MCP).

## MCP

```jsonc
{
  "mcpServers": {
    "the-wheel": {
      "command": "node",
      "args": ["/absolute/path/to/the-wheel/mcp/server.js"],
      "env": { "SQUEEK_PROFILE": "sepolia" }   // or "sepolia-v6"
    }
  }
}
```

- `SQUEEK_PROFILE=sepolia` (default) → `squeek_network_status`, `squeek_verify`, `squeek_wallet_status`, `squeek_art`
- `SQUEEK_PROFILE=sepolia-v6` → adds `squeek_checkpoint_preview`, `squeek_claim_preview`, `squeek_merge_plan`, `squeek_merge_preview`, `squeek_prepare_{checkpoint,claim,merge}`
- `KEEPER_PRIVATE_KEY=…` adds `squeek_submit_checkpoint` **only** — checkpoint and nothing else, matching the docs' keeper rule

Prepare tools return `{ to, data, value, chainId }` for the owner's wallet. The server never signs owner actions.

## SDK

```js
import { createSqueekchain, createSqueek9, PROFILES } from "./sdk/squeekchain.js";

const live = createSqueek9({ profileKey: "sepolia" });
await live.verify();                       // implementation versions + wiring
await live.networkStatus();                // rounds, issuance, supply, checkpoint state
await live.walletStatus(owner);            // Squeeks, levels, nextMergeHeight, deposited, claimable
await live.art(1);                         // { name, attributes, image: data:image/svg+xml;base64,… }

const v6 = createSqueekchain();            // docs-pinned graph
await v6.claimPreview(owner);              // simulated batches with gas
await v6.mergePlan(owner);                 // mergeable pairs + power delta
await v6.mergePreview(owner, survivor, donor);
```

Both adapters are JSON-safe (`bigint` → decimal strings), remember snapshots for 4s, and fail over across three public Sepolia RPCs because they return **HTTP 429** under load.

## Safety model

- No private key in the web or MCP path; signing is a wallet popup
- Verification before reading: implementation versions + wiring for both graphs; the live profile is explicitly marked as coming from the official dApp bundle + API rather than a published record
- Simulate before proposing a signature (`eth_estimateGas` doubles as a check; decoded reverts like `RoundNotSettled`, `CooldownActive`, `PendingActivation` surface first)
- Merges are irreversible: typed confirmation, explicit donor warning, machine-readable guard for agents
- Art is untrusted output: rendered as an isolated image, never injected as markup
- Count cooldowns in **completed Squeek blocks**, never wall-clock time

## Troubleshooting

| Symptom | Meaning |
|---|---|
| `RoundNotSettled(1974)` on v6 | Expected: that deployment stopped being settled. Use the live profile for reads. |
| "No injected wallet found" | Sandboxed iframe or no extension — open the app in its own tab. |
| HTTP 429 | Public RPC throttling; the SDK fails over and memoises. Point `RPC_URL` at your own node for heavy use. |
| Live profile shows 0 claimable | v9 pays through **staking**: an undeposited Squeek earns nothing, and the deposit flow is not documented yet. |
| Art takes a second | `tokenURI` renders the DotGrid page onchain (~90 KB of metadata per token). |

The Wheel is testnet-only today. Testnet SQK and Squeeks have no monetary value.
