# Removing v6/v9 from the product — status, 2026-11-06

Work in progress on `arena/ba7ca559-squeekchain-console` (PR #6, draft).

## Done

- **Two profiles only.** `sdk/deployments.js` exports `PROFILES = { sepolia, mainnet }`,
  `DEFAULT_PROFILE = 'sepolia'`, `listProfiles()`, `getProfile(key)` (throws on unknown keys).
  `sepolia` carries the published pins from `docs/deployments/core-sepolia-20261103.json`
  (release `core-sepolia-20261103`, revision 7, deploymentBlock 12057556) and the published ABIs.
  `mainnet` is `kind: 'not-deployed'` with `addresses: null`, `abis: null`, all capabilities
  false and `apiBase: null`. It never guesses addresses; it turns on only when the docs record
  publishes a mainnet deployment.
- **One SDK module.** `sdk/squeekchain.js` (was `v9.js`) and `sdk/verify-chain.js`
  (`createChainVerifier`, `IMPLEMENTATION_SLOT`, `ADMIN_SLOT`). `sdk/policy.js` holds
  `SQUEEKS_POLICY`. Deleted: `sdk/abi.js`, `sdk/abi-v9.js`, `sdk/record.js`, `sdk/verify.js`,
  `sdk/profile-selection.js`, `sdk/verify-v9.js`, `abi/*.json`, `docs/pins/`.
- **Generated ABIs** are neutral: `coreAbi, nftAbi, tokenAbi, miningAbi, stakingAbi` from
  `abi/core-sepolia-20261103/*.json`; pins in `sdk/pins-core-20261103.js`.
- **Input aliases only at boundaries.** `sdk/profile-input.js` maps `sepolia-v9`, `sepolia-v6`,
  `sepolia-v9-live`, `sepolia-core-20261103` to `sepolia` and offers `profileFromHash()` /
  `canonicalHash()` for redirects. No adapter or cache ever sees a versioned key.
- **Consumers cleaned**: `web/app.js` (single adapter, no `abiSet` branches, no dual-profile
  auto-pick, picker lists the two labels only), `web/explore-chain.js`, `web/explore-index.js`,
  `web/holder-workspace.js`, `web/network.js`, `web/network-strip.js`, `web/activity.js`,
  `web/explore.js`, `sdk/browser-entry.js`, `sdk/public-tools.js`, `sdk/tools.js`,
  `src/config.js`, `src/rpc-probe.mjs`, `keeper/checkpoint.mjs`, `mcp/server.js`.
- **Bundle:** `npm run build` green — 429.9 KB raw, **192,296 B gzip** across 25 scripts
  (was 214,081 B → **−21,785 B, about −10%**).

## Still open

1. **UI state work**: first-load hash redirect (`#sepolia-v9/...` → `#sepolia/...` via
   `canonicalHash`), the storage purge for old keys (localStorage, IndexedDB, Explore index —
   carry nothing into `sepolia`), removal of the `#profile-choice` node and its copy, and the
   contract-mismatch banner ("Squeekchain updated its contracts. Wheelhouse is being updated",
   actions blocked, reads off).
2. **Tests.** The v6/v9-era suites still assert the old flat `DEPLOYMENT`/`verifyGraphAt`
   contract; a test-only fixture `test/fixtures/graph.mjs` now derives that shape from the
   published pins, but the suites still need real rewrites. Currently failing and needing work:
   `audit-baseline`, `browsing`, `components`, `display-data`, `docs-cleanup`, `explore-index`,
   `explore-wire`, `frontend-baseline`, `holder-workspace`, `network-genesis`, `network-strip`,
   `phase1-safety`, `pr3-fix-pack`, `profile-registry`, `published-pins`, `review-fixes`,
   `rpc-failover`, `security-review`, `ui`, `v9-safety`. Passing: `account-discovery`,
   `activity`, `art-onchain`, `discovery`, `identity-batch`, `live-ci`, `review-regressions`,
   `reward-status`, `rpc-429`, `rpc-diagnostics`, `wallet-store`.
   Do not treat the safety suites as green until they are rewritten against the new pins.
3. **Beginner-friendly menu** (second requested change: Home · My Squeeks · Explore · Art ·
   Help, Home tab content, wording, ⓘ hints) is not started.
4. Delete `.github/workflows/tmp-fetch-published.yml` and `tmp-echo.yml` before merge.
