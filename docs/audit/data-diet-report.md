# DATA DIET + Squeeks UI follow-up — 2026-11-04

**UI follow-up implemented; broader DATA DIET qualification still incomplete.** PR #3 remains open on `arena/417b8688-squeekchain-console`. All execution reported here is offline/mocked. No test:live, real wallet signing, keeper, merge, or manual deployment was performed. Do not treat historical public checks as qualification of this head.

## Implementation

- Endpoint-specific v9 display API guards, release/identity binding, IndexedDB profile+release keys, static configuration/pins (24h), dynamic last-good (15min), account/activity no-store, ETag/304 and rate-class/Retry-After budgets remain in place.
- API display values are separate from action snapshots. Action IDs are reconstructed from fresh canonical inventory; mutable identities/wiring, ownership, typed BURN, simulation and independent-peer checks remain mandatory. No ABI/deployment/export changes.
- One completion-driven wheel poller: ACTIVE/online 5s, IDLE/stale 60s, hidden-tab pause. No frontier changes means no account/economy refetch. Provisional rows remain separate from confirmed Core values.
- Squeeks now use automatic lazy art cards (Level, Power, Next merge, Wallet/Deposited). SQK has separate balances/staking figures and actions; Claim/Claim and stake/Stake/Unstake are not mixed with NFT actions. No nested bordered card workspace or mixed Action dropdown. Mobile controls stack; desktop action rows use 8px gaps.
- Art: API cardImageUrl credential-free CORS fetch→cached blob, imageDataUri fallback, then guarded SDK tokenURI. Only isolated img data/blob sources. Profile+ID+level 24h durable cache; second visit makes zero art requests. No extra img-src host allowance. Levels select separate immutable keys.
- SQK issued label, no issuance-source line or displayed internal release IDs. Plain action previews plus collapsed Technical details/Copy. Raw general diagnostics and API event identifiers use human-facing copy; developer tools retain technical output. Full inventory: [data-diet-removed-strings.md](data-diet-removed-strings.md).
- Wallet lock releases through finally after success/reject/close/error, or immediately via inline Cancel. Cancel cannot dismiss the wallet itself. Late hashes still reach persistent Activity, without an old request clearing a newer signing ticket.
- Explicit disconnect/revoke attempt, case-insensitive account changes, wrong-chain guards and permissionless Checkpoint remain intact.

## RPC defaults and probe limits

Default order is **Tenderly → PublicNode → 0xRPC.io**, plus explicit custom Settings. dRPC/ZAN/EthPandaOps are absent from the default pool and explicit CSP host entries; Nodies/OnFinality are not included. Unit/browser transport tests use the same default order and retain cooldown, typed availability errors and two-independent-peer guards.

Re-probe attempts for Nodies and OnFinality with eth_chainId and an Origin header each ended at TLS (`curl` exit 35, SSL_ERROR_SYSCALL), before an HTTP response. This environment did **not** establish current CORS support or observe OnFinality's current HTTP status. No TLS failure is relabeled as a CORS failure or 429. The hosts remain omitted; live availability of the selected pool is not claimed.

## Validation

Qualified implementation commit: `aa91c34c999f42c329d9da348bef6733e33b1343`. The evidence-only commit following it does not change production code.

- Build: **169,768 bytes gzip / 250,000**, all **10** independently compressed JavaScript responses, including lazy modules. [Per-script sizes](data-diet-js-size.json).
- Offline suite: **18/18 scripts PASS** after final production edits, including both SDK budgets, ABI/export safety, protected components, display guards, cache/expiry/art, canonical action authority and production fork-code exclusion.
- **199/199 mocked browser tests PASS** in the final full run after all production edits. Includes all existing roles/test-ID/safety suites, the 32-case Squeeks matrix, wallet waits and a real full-reload art cache regression.
- Before/after: 16 pre-redesign light images and 32 post-redesign light/dark images, both profiles × 390/1280 × holder/empty/watch/disconnected. [Audit + comparison links](squeeks-ui-audit.md). Broader light/dark screenshot suites are also regenerated.
- Original wrong-chain Checkpoint blocker was a fixture bug: its one-listener Map dropped one of the app's chain listeners. Fixture now mirrors EIP-1193 multiple listeners/removal. The original production lifecycle test passes its chain-change, account-empty, disconnect and persisted-disconnect reload assertions. No production chain guard was weakened.
- Iteration history: initial redesign run 192/198 passed; stale copy/RPC expectations were migrated, then 198/198 passed. An additional reload regression initially hit duplicate Playwright exposeFunction registration, fixed with per-install binding names; its second focused run passed. Final copy hardening required updated diagnostic expectations; a timing-only lazy-module assertion now waits for the module request instead of racing it. These were test harness/copy migrations, not live retries.
- `test/components.mjs` (including line 65), protected component source, deployment pins and official ABI files are unchanged.

## Request counts — partial, comparable v9 scenarios

These use the production app, intercepted synthetic API/RPC responses and the default dual-profile chooser, **not** an adapter factory. HTTP numbers count envelopes (a JSON-RPC batch is one HTTP request). Provider counts are EIP-1193 chain reads, reported separately; account authorization methods are not chain reads. Counts exclude static assets. Art metadata calls are included in wallet rows. Full reload retains IndexedDB and remounts without an account; connecting is measured separately.

| v9 scenario | API HTTP | Public RPC HTTP | Provider chain reads | API share incl. provider reads |
|---|---:|---:|---:|---:|
| Cold network + wheel/feed bootstrap | 6 | 0 | 0 | 100% |
| Warm cached full reload, not Refresh | 6 | 0 | 0 | 100% |
| First wallet connect + chooser + 2 art metadata reads | 3 | 6 | 7 | 18.75% |
| Warm wallet connect + chooser, cached art | 1 | 6 | 7 | 7.14% |
| Virtual 10min ACTIVE, unchanged frontiers, after bootstrap | 240 | 0 | Not modeled | Not a whole-page/provider-inclusive measurement |
| Virtual 10min IDLE, unchanged frontiers, after bootstrap | 20 | 0 | Not modeled | Not a whole-page/provider-inclusive measurement |
| v6 whole-page cold/warm/wallet/10min | — | — | — | **Still outstanding** |

Warm reload still revalidates dynamic endpoint bodies (fixture returns 200 with ETags), so it is six API requests, **not zero**. Art requests are **2 first visit, 0 second visit**. See [browser measurements](data-diet-browser-art-counts.json) and [aggregate evidence](data-diet-request-counts.json). Historical Refresh-only evidence remains labeled historical; it is not substituted for warm reload.

Virtual polling uses the actual API client/poller with a controlled clock, not ten minutes of public wall-clock observation. It excludes four bootstrap API reads. No frontier change triggers account/economy fetches; hidden pause is covered separately. Provider/receipt behavior and a matching v6 whole-page matrix remain unmeasured.

Existing SDK-only budgets remain 22/12/15 v6 cold network/warm network/wallet, and 15/13/20/14 v9 cold network/warm network/cold wallet/warm wallet. They exclude whole-page bootstrap and are **not** equivalent to the table above. Do not claim a before/after percentage from these unlike scopes. Both warm SDK budgets remain ≤25 and the existing v9≤v6+8 assertions pass.

## Remaining qualification / no live authorization

- Complete the comparable v6/v9 whole-page cold/warm/wallet/10-minute ACTIVE/IDLE table, including provider calls and matching before scope; current evidence is not full DATA DIET performance acceptance.
- Foundry installation previously failed twice; no further retry. Hardhat development fallback is installed and eight fork cases were discovered, but **zero executed**. No fork PASS is claimed; synthetic/local peers are not public independent-peer availability evidence.
- User-triggered run-live remains separate. No live workflow dispatch, signing/key handling, keeper, merge or manual deployment was performed here. Automatic Cloudflare preview may follow the same-branch push; it is not a manual deployment or a live qualification claim.
