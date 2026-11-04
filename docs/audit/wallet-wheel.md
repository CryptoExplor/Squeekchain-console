# Central wallet + live wheel review

> Historical qualification for the commits named in this document. Current security follow-up and changed request/size budgets: [security-review-followup.md](security-review-followup.md).

Scope: static browser app, offline and synthetic intercepted API/RPC only. No live tests, signing, merge, or deployment. Existing ABI exports, deployment pins, RPC trust/simulation gates, and `test/components.mjs:65` are unchanged.

## Implementation

- `web/wallet.js` owns immutable `{status, account, chainId, providerInfo, ethBalance}` snapshots. The app exposes read-only account/chain/balance getters; header, menu, holder, checkpoint gate, chooser and Activity follow its subscription.
- EIP-6963 request/announcement discovery, an accessible wallet picker when ambiguous, rdns persistence, fallback injected provider, chosen-provider listeners attached once and removed on destruction.
- Silent authorised restore uses `eth_accounts` only, unless explicitly disconnected. Epochs discard stale restore/balance replies without dropping account/chain events. BroadcastChannel messages trigger local authorised-provider reads, never trust a broadcast account or request a popup in another tab.
- Profile switches keep the signer, abort reads, increment the generation, clear profile data and reload the same inspected account. Watch addresses remain independent. Pending transaction history survives navigation, account changes and late wallet hashes.
- Wheel uses one unboxed, left-aligned list, five entries initially and Show more. Documented event IDs/payloads supply numbers and relative times. Settlement, feed settlement and checkpoint for a round collapse to a single row; issuance is labelled as a separate checkpoint, not attributed to a settlement. Unknown events and incomplete issuance descriptions are skipped.
- Provisional data is one ACTIVE line, based on the documented projected frontier and billionth-block progress, never a numbered list. IDLE hides it.
- Until actual SDK contract checks complete the chip says Checking…, with an explicit explanation in Info › Trust that API display data has not verified contracts and fresh independent checks run before actions. This does not silently introduce background verification reads or claim API data is verified. A completed SDK result updates the chip; actual check failures retain their reason under Trust.

Official payload references: https://docs.squeekchain.com/developers/api.md (events, settlements, measurement blocks; read during implementation). This work changes no ABI, deployment identity or transaction authority.

## Regression evidence

- Static literal ID audit scans all authored web modules against index.html, plus the wheel item template. Browser wallet tests additionally wrap `getElementById` to reject missing indirect IDs at runtime.
- Store: silent reload, disconnected reload, listeners once, rdns/picker, lock, account/chain events, outstanding restore race, Unknown balance.
- Browser: real reloads, account switch during a held load, chain switch, independent watch, two-wallet picker, two actual tabs, profile-switch generation abort/clear/reload with pending Activity retained.
- Feed: real values/times, deduplication, unknown skipping, five/Show more, no nested panel, single provisional line, IDLE hidden and Checking/Trust copy.
- Screenshots: `docs/screenshots/wallet-wheel-{before,after}-{v6,v9}-{header,network,squeeks}-{390,1280}.png`. Before source: 61511275040ef6469e6b323ea93b64e0267ba84d. Each phase has twelve images.

## Failures and corrections

1. Superseded profile-switch test expected the signer to clear. It now expects the wallet session to persist. A new held-read browser regression checks cancellation, generation increase, profile data clearing and same-signer reload; pending-transaction tests remain.
2. Integration-script HTML selector did not match the existing markup. Added the feed container, item template and Show more button, and both static/runtime ID checks.
3. The preserved-wallet failure fixture previously expected a profile switch to hide a failed wallet read behind a successful network read. It now remains Unavailable; the protected assertion on line 65 is untouched.
4. Empty-Squeeks screenshot fixtures patched an adapter before connection. Connection correctly rebuilds the generation/adapter, so the test now patches the current adapter after connection and refreshes. All eight empty cases passed after correction.
5. New unit-test assumptions corrected: ID string concatenation is not a static literal; equal-timestamp rows have no promised tie order. Neither changed production safety rules.

## Completed validation

- `npm test`: all 19 offline scripts pass (`.cache/wallet-offline-final.log`).
- `npm run test:browser -- --max-failures=1`: 211 mocked tests pass (`.cache/wallet-browser-final.log`).
- Build: **173,350 / 250,000 gzip bytes across all 12 scripts**, including lazy modules (`dist/js-size.json`).
- Four audit cases capture all twelve matching after screenshots. The full browser suite includes these audits and the new wallet/feed regressions.
- `git diff --check`: clean. No live qualification is claimed.

Removed/replaced strings: the generic event labels “SQK issuance updated”, “Round completed”, “Network activity”, “Squeek deposited”, “Squeek withdrawn” (now include real IDs), the generic fallback “Account activity” (the heading remains), separate “Recent events” / “Settlements” subheadings in the wheel, “Display only — verify when an action starts” and its premature “Unverified” chip, and the numbered provisional-block labels. “Unverified” remains available only after an actual non-transport, non-mismatch check failure; stronger Unavailable / Mismatch: stop states remain.

