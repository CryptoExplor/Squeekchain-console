# Security review follow-up

2026-11-04 · PR #3 · `arena/417b8688-squeekchain-console`

Scope: targeted follow-up to the supplied partial review, not an exhaustive security audit or live qualification. All requests in the new regressions are synthetic/intercepted. No live gate, RPC probe, signing, keeper, merge, manual deployment, ABI change, deployment-pin change, or MCP remote submission.

## Findings and disposition

| Finding | Change / remaining boundary |
| --- | --- |
| LOW: unguarded `AbortSignal.any` / `timeout` | Shared feature-detected `anySignal` deadline helper. Fallback composes AbortController signals, preserves the first reason, deduplicates input signals and removes listeners/timers on abort/disposal. Identity batch, account discovery, display API, telemetry, Settings diagnostic and probe helper dispose after body consumption, including errors. The probe was **not run**. Body deadline errors are not misclassified as corrupt batch responses. |
| LOW: arbitrary HTTPS card images | Fresh and 24h cached metadata validate exact `https://api.squeekchain.com` origin, no credentials; relative paths resolve there. The actual image fetch repeats that check and uses `redirect: 'error'`. Foreign metadata is a schema error and cannot quietly fall back to SVG or contract art. Allowed API fetch failures can still use isolated SVG. No speculative CDN allowlist was added. |
| Hash agreement is not state agreement | Production v6 checks both snapshot peers' implementation/admin slots every operation and implementation runtime hashes on cold verification. Cold code reads share one batch per peer; existing checked-single fallback remains. A warm cached graph cannot conceal changed proxy slots from an honest peer. General v6 graph/configuration reads and v6/v9 post-identity state/simulations still rely on the serving RPC. **No storage proofs or full-state authentication are claimed.** |
| Broad HTTPS CSP | Retained intentionally for custom RPC support. README explicitly says `connect-src https:` is not a destination allowlist or exfiltration boundary. Self-hosted script/style/font and self/data/blob image restrictions remain; artwork origin protection is enforced in code. |
| Cancel while provider prompt remains open | Cancel releases app busy/navigation/read state, not the provider's actual request. A separate page/provider-scoped lock survives cancellation and profile changes, blocks another send until the real request settles, and also covers wallet preflight. Late hashes persist in Activity, are followed through receipt resolution and refresh only the matching current profile/account. It cannot close a wallet popup, cancel a broadcast, or coordinate arbitrary other tabs/dapps. |
| Optional approval clarity | SDK preview adds pinned spender, exact scope and token ID where applicable; review shows SDK warning, spender, amount, token IDs and destination contract. Collection-wide scope says **ALL current and future Squeeks**. Re-simulation rejects changed reviewed approval terms before any wallet prompt. Existing fee/re-quote and permitted claim increases remain. |
| Optional CI generated drift | CI builds then checks `git diff --exit-code -- web/bundle.js web/tools.json` **before** tests can rebuild and hide stale committed artifacts. |
| Optional blob URL reuse | Repeated loads of the same cached profile/token/version reuse a URL. A replacement level/cache version revokes the old URL; destroy revokes all current URLs. A late completion after destroy cannot create a URL or fall through to contract art; an aborted generation finishing an asynchronous cache write cannot revoke the current generation’s artwork. Distinct token URLs remain until replacement/destroy; no hard LRU cap is claimed. |

## New regression coverage

- `test/security-review.mjs`: delete both modern AbortSignal APIs; exercise identity batch, body abort/timeout, account discovery, display API and telemetry. Verify first reason, TimeoutError availability classification, listener dedup/removal and disposed fallback timers. Fresh/cached foreign metadata and direct image boundary rejection, no foreign contact/fallback, relative paths, redirect fetch option, blob reuse/replacement/destroy and late destroy. A genuine-header/hash-agreeing false-slot peer and false-code peer cannot bypass independent v6 identity checks or seed the cache. CI drift-guard ordering.
- `test/security-review.spec.mjs`: actual Chromium path without both APIs including Settings RPC test; foreign artwork and HTTP redirect interception; Cancel followed by late success or rejection, second-prompt prevention, receipt-triggered current-owner refresh, late hash after navigation to Mainnet; six action review detail checks with zero wallet sends.
- `test/security-review-captures.spec.mjs`: six approval captures (three scopes × desktop/mobile), no overflow or page errors, full spender visible, no sends. Cancel during pending wallet preflight and changed approval spender before re-simulation both stop additional sends.
- Existing v9 SDK action tests additionally assert real preview spender/scope/token/amount fields, not only synthetic UI fixtures. Existing canonical-inventory, BURN, payout, fee/deadline, trust-stop and late-hash tests are retained. `test/components.mjs:65` is unchanged.

## Investigation / failure log

1. Initial v6 wire fixture only understood single JSON-RPC objects. New real identity batches exposed `Unmocked wire RPC undefined`. The fixture now responds to both single and batch envelopes and counts HTTP envelopes. No trust or budget guard was weakened; focused rerun passed.
2. Initial complete offline run stopped at an old artwork success fixture using `cards.example.test`, now correctly forbidden. Changed only that success URL to the pinned API origin; added separate explicit foreign-host rejection tests. Its focused rerun passed.
3. A new late-destroy regression exposed an AbortError being swallowed as an ordinary image fallback, producing `fallback is not a function` in the test. The image layer now propagates view destruction/AbortError instead of falling through. The focused rerun passed.
4. Inspection found that an old generation completing its asynchronous image-cache write could replace/revoke a newer level’s current blob URL. Recheck its abort signal after the write; a delayed-write regression proves no extra URL creation or revocation. The in-progress qualification was intentionally stopped for this additional change, then restarted against the final sources.
5. Inspection found the batch JSON-body catch could hide a deadline abort behind a malformed-response trust error. Check the composed deadline after body consumption; the new body-timeout regression passes as TimeoutError/availability.

These were distinct, understood causes; there were no two repeated failures of the same fix for the same reason. No live retry was attempted.

## Qualification

Qualified production/test source commit: **`58012a4fa01195d12514840d7b101e78221d435d`**. The following evidence-only commit adds documentation/captures; it does not change the qualified application. Previous wallet/layout qualification remains historical to its recorded commits.

- `npm test`: **20/20 offline scripts PASS**, 69 PASS assertion-group lines, exit 0 (`.cache/security-offline-head.log`).
- `npm run test:browser`: **246/246 mocked Chromium tests PASS**, 3.3 minutes, exit 0 (`.cache/security-browser-head.log`); no retries configured. Includes all 19 new security-review/browser capture cases, not just the earlier focused subset.
- `git diff --check` and post-build generated asset drift check pass. Machine-readable record: `security-review-qualified.json`. Local raw logs are excluded from Git; results and captures are persisted here.

- Production build: **176,015 / 250,000 gzip bytes**, all **12** scripts including lazy modules. Exact breakdown: `data-diet-js-size.json`.
- Synthetic v6 actual-HTTP budget: cold network **13**, warm network **10**, wallet **13**, cap **25**. Warm identity checks include all four slots on both peers (eight raw primitives), not four single-source checks.
- Synthetic v9 actual-HTTP budget: cold/warm network **15/13**, cold/warm wallet **20/14**, cap **25**. These are SDK fixture budgets, not a whole-page or live performance claim.
- Six new unsigned approval captures: `docs/screenshots/security-review-{approveAll,approveNft,approveSqk}-{390,1280}.png`. Existing full-suite captures cover both profiles, populated/empty/watch, desktop/mobile, wallet/wheel and layout/pending states.

## Removed/replaced visible strings

Only the duplicate-send error text changed from **“Waiting for your wallet…”** to **“A wallet request is still outstanding. Close or reject it in your wallet before starting another transaction.”** The ordinary inline **“Waiting for your wallet…”** label remains. No other existing visible string was removed in this follow-up; new warnings and review detail rows are additions. README security claims were clarified as described above.

## Still not qualified

The user-run live gate remains unrun. This work does not prove malicious-serving-RPC resistance for arbitrary state, RPC availability/CORS in users' browsers, whole-page DATA DIET performance, fork execution, or an exhaustive SDK/MCP/discovery security audit. No stronger security or deployment approval is implied by the offline suite.
