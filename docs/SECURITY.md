# Security model

This is a static, independent Squeekchain console, not an exhaustive security audit or a guarantee of live RPC/API availability. Offline/mocked checks do not qualify a live network, fork execution or arbitrary malicious-RPC resistance.

## Deployment pins and canonical reads

`sdk/record.js` contains published v6 pins; `sdk/deployments.js` contains profile identity configuration. The byte-preserved [v9 identity export](pins/v9-identity-2026-11-03.json) is provenance, not a live configuration feed. The baseline test checks its SHA-256. API addresses must never update transaction configuration. Mainnet has no deployment and all deployment capabilities are disabled.

Operations bind reads to one block/snapshot and check chain, block agreement, proxy implementation/admin slots, runtime hashes, layout/version and wiring as applicable. Two independently operated peers check identity; WSS aliases of the same operator are not independence. Mutable slots, bindings and pause state are fresh; reusable code verification does not authorize changed slots. Cache commits follow the final snapshot guard; account/profile generations reject stale results.

An API NFT ID is only a hint. Balance/completeness, current owner, v9 custody/depositor and action eligibility need canonical evidence. Incomplete deposit history or positive NFT power without complete deposits is unavailable, never zero. Proven zero power may skip deposited-ID discovery, retaining the final guard.

## RPC trust boundary

The configured pool uses Tenderly, PublicNode and 0xRPC, with optional browser-local custom HTTPS RPC. Availability errors have bounded failover/cooldown; identity/schema corruption is a trust stop, not an excuse to accept another answer. Unsupported batch envelopes may fall back to checked singles; malformed successful data is not trusted.

**Identity/hash agreement is not full state authentication.** Independent v6 slot/code checks and v9 identity checks do not provide storage proofs for arbitrary state. General graph/configuration reads and post-identity state/simulations still rely on the serving RPC. Do not claim resistance to every malicious serving provider.

## Review, simulation and signing

The SDK prepares unsigned transactions. Canonical ownership/custody, fresh preparation and snapshot-pinned simulation precede each wallet prompt. BURN confirmation must be exactly `BURN-<donorId>` before a merge is constructed/simulated; the donor is permanently destroyed. Planning does not execute a sequence.

Claims check payout/recipient changes; permitted fresh v9 increases are displayed, while lower payouts or changed recipients stop. Approvals display pinned spender, amount/token ID and scope. Collection-wide approval explicitly includes **ALL current and future Squeeks**; altered reviewed terms stop. Unstake uses the quoted SQK maximum fee and deadline, not a padded cap; fee/deadline changes require explicit re-quote. These are not network gas estimates.

Wallet requests forward only `from`, `to`, `data`, `value`; the wallet chooses gas/network fees. No private keys, seed phrases or automated keeper are required. Explicit Connect/profile selection may request a network change; restore/watch/cross-tab hints do not. Actual chain state, not acknowledgement alone, controls action gates. Mainnet switching cannot enable undeployed contracts.

Cancel releases app busy state, not the provider's outstanding request. A page/provider-scoped lock blocks duplicate sends until the actual request settles, including preflight. Pending network prompts also block signing. Late hashes are saved to Activity and followed only in the matching context. The app cannot close a wallet popup, cancel a broadcast or coordinate arbitrary other dapps/tabs.

The separate operator-only `keeper/checkpoint.mjs` requires both an enable flag and explicit submission flag with a dedicated low-value account outside the app. It is not exposed by package scripts, CLI or MCP. Never use an owner key.

## Display API, artwork and browser state

The public API is display-only, never transaction authority. Validate profile/chain/identity/schema and freshness; missing or malformed data is Unknown/unavailable. Confirmation-delayed API data cannot replace fresh owner/custody checks or simulation. Earnings gaps are not fabricated zeros.

Artwork metadata/card URLs must resolve to exact `https://api.squeekchain.com` origin without credentials; image fetches recheck origin and reject redirects. Foreign metadata is a schema error, not a route to permissive fallback. Valid API failures may use isolated SVG/contract art. Cache keys include profile/token/version; merges invalidate affected artwork. Replaced/destroyed blob URLs are revoked, and late/aborted work cannot replace a newer image. No hard LRU bound is claimed.

Wallet identity is owned by one EIP-1193 session store; watch scope is separate. Cross-tab hints cause provider rereads, never trust remote account data. Discovery caches and Activity are browser-local, scoped by owner/profile; account history excludes ownerless legacy records. Cache clearing invalidates queued writes; Activity synchronizes shared storage before saving. Shared deadline helpers feature-detect AbortSignal APIs and dispose timers/listeners.

## CSP and agent access

`web/_headers` restricts scripts/styles/fonts to self, images to self/data/blob, framing to none, and disables objects and unsafe base/form destinations. `connect-src` permits only self, the exact API origin and the three listed public RPC origins (Tenderly, PublicNode and 0xRPC); no bare schemes or wildcard hosts. Browser Settings accepts custom RPC URLs only on those listed hosts. A meta policy cannot widen the HTTP header policy. Artwork origin enforcement is in code. Do not weaken CSP with inline-script/style exceptions.

Local stdio MCP provides public reads and unsigned preparation, not wallet access or submission. Browser same-origin human requests may open the wallet only after the normal review/simulation gates. Cross-origin postMessage permits only five public reads with an explicit owner, isolated public-RPC adapters and no session/custom-RPC/inspected-address defaults. Opaque origins and cross-origin prepare/request tools are refused. Agents never receive keys.

CI rejects generated browser-asset drift. Tests may not write into docs; transient evidence belongs in ignored artifacts with seven-day CI retention. Keep pins byte-stable, report new findings in PR descriptions, and retain durable limits here instead of adding run reports.

Identity batches rejected as unsupported fall back to at most two native calls at once, at the same snapshot block. Rate limits retain cooldowns. An unavailable identity peer can be replaced only by a distinct configured peer that agrees on that exact block hash; both replacement identity values and final hashes are checked. Malformed success, chain, hash or pin mismatches still stop.
