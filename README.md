# Wheelhouse

A static, browser-first Squeekchain holder console. Inspect Squeeks and SQK, plan merges, and review transactions before your own wallet signs. Independent community software, not the official dApp.

**Live:** https://wheel-house.pages.dev · **Hosting:** Cloudflare Pages

## Quick start

Use the Node version in `.nvmrc` (Node 22) and npm:

```sh
npm ci
npm run web
```

Open the URL printed by the static server (default port 5173). `HOST` and `PORT` configure its listener. The browser talks directly to public APIs/RPCs and the selected wallet; there is no application backend or RPC proxy. Custom HTTPS RPC settings stay in the browser.

## Profiles

| Profile | Support |
| --- | --- |
| `sepolia-core-20261103` (default) | The current graph: [published record](docs/deployments/core-sepolia-20261103.json) `core-sepolia-20261103` revision 7, deploymentBlock 12057556. Implementation, implementation runtime hash, storage layout digest and ProxyAdmin are pinned from that record, and the calls use the published ABIs in `abi/core-sepolia-20261103/`. |
| Legacy · `sepolia-v9` | Previous graph, kept for historical inspection. Not the default and never offered as the current deployment. |
| Legacy · `sepolia-v6` | Oldest graph, frozen cache, wallet-held merges only. Historical inspection. |
| `mainnet` | Not deployed. No deployment reads or actions. |

Every Sepolia profile has the same safety requirements, and every operation proves the pinned identities at the same block on two independent peers. Saved/profile-qualified links retain context; connection checks holdings across both profiles. Explicit Connect and profile selection can request the matching wallet network; confirmation remains in the wallet. Silent restore and read-only watch navigation do not open network prompts.

Squeeks has separate NFT and SQK views, a merge planner, token detail pages, shareable read-only address links, Activity and available earnings. A planned step only selects the next action; it never signs or runs a whole merge path automatically. Missing data is **Unknown**, not zero. Loading, failed reads, empty portfolios and disconnection are different states.

## Commands

| Script | Purpose |
| --- | --- |
| `npm run web` / `serve` | Build and serve the static app. |
| `npm run dev` | Serve local source without rebuilding. |
| `npm run build` | Build `dist/`; enforce 500,000 gzip bytes across all JavaScript, including lazy modules. |
| `npm test` | Offline SDK, safety, documentation and integration checks. |
| `npm run test:browser` | Mocked Chromium regressions; install with `npx playwright install --with-deps chromium`. |
| `npm run test:web` / `test:audit` | Focused UI / deployment-baseline checks. |
| `npm run verify` / `status` | CLI verification / reads. |
| `npm run checkpoint` / `claim` / `merge` | Prepare unsigned calls; consult CLI help for arguments. |
| `npm run mcp` | Local stdio MCP: public reads and unsigned preparation, no keys or submission. |
| `npm run rpc:probe` / `test:live` | Explicit opt-in public-network diagnostics / read-only qualification; not part of ordinary tests. |
| `npm run fork:start` / `fork:web` / `test:fork` | Explicit local fork workflows; see [fork instructions](dev/fork/README.md). |

Tests must not write into `docs/`. Screenshots and measured counts belong in gitignored `artifacts/`; CI uploads results with seven-day retention. Request ceilings are maintained in `test/budgets.json`, not rewritten by measurements. Offline/mock passes do not establish live availability or fork qualification.

## Safety in brief

Contract identity is pinned and rechecked at a single snapshot, with independent-peer identity checks and a final snapshot guard. API data is display-only: ownership, custody, eligibility and transaction inputs require canonical reads and simulation. Merging permanently burns the donor and requires exact `BURN-<id>` confirmation. Every transaction needs fresh review/preparation and a human wallet prompt. The wallet sets gas/network fees; the unstake SQK fee cap remains independently enforced.

RPC agreement is not authentication of arbitrary state. Read [SECURITY](docs/SECURITY.md) for trust boundaries, cancellation limits, approvals, CSP and cross-origin access.

A separate checkpoint-only keeper under `keeper/` is disabled by default and outside CLI/MCP/UI; holders do not need it.

## Project reference

- [Current support and open items](docs/STATUS.md)
- [Design and copy rules](docs/DESIGN.md)
- [Security model](docs/SECURITY.md)
- [Merged changes](docs/CHANGELOG.md)
- [Official Squeekchain documentation](https://docs.squeekchain.com/)
- `web/`: static UI; `sdk/`: verified adapters and tool registry; `mcp/`: local stdio; `src/`: CLI; `test/`: offline/mocked checks.

History, per-run measurements and review reports live in Git/PR descriptions, not current documentation.
