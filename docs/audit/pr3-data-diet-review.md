# PR #3 DATA DIET review follow-up — 2026-11-04

Reviewed the two CodeRabbit batches submitted against `a8eb471` at 10:17–10:18 UTC: **16 inline findings, two nitpicks, and one explicitly unverified schema-default observation**. Each was checked against the current branch, not applied blindly. No paid review service, new branch, live run, signing, merge, keeper, or manual deployment was used.

Comment links use `https://github.com/CryptoExplor/Squeekchain-console/pull/3#discussion_r<ID>`.

| Comment ID | Disposition and evidence |
|---|---|
| 4466297299 | Fixed STATUS build total, ten-script count and current breakdown link. Uses the newly rebuilt total, not the review's now-historical 166,257-byte suggestion. |
| 4466297324 | Fixed STATUS qualification section: current completed offline/browser results are linked to evidence, historical 156/17 and stopped 161/1 are not presented as current. Broader DATA DIET qualification remains incomplete for the full performance matrix/fork execution; the original chain-change fixture blocker is already resolved. |
| 4466297339 | Fixed the “no extra polling” claim: API status/events run at ACTIVE 5s / otherwise 60s, paused while hidden, separate from SDK RPC-envelope budgets. |
| 4466297348 | README/DESIGN/STATUS use the current build artifact and ten-script total. Historical commit-qualified figures remain historical. Current RPC/discovery descriptions were also synchronized. |
| 4466297364 | Economy installation context is committed only after all economy fields validate. Regression rejects a malformed first installation, observes no pinned context, then accepts a valid different installation. |
| 4466297381 | Checkpoint readiness is false and lag is Unknown when either input is stale **or** Core/economy safe block number/hash do not match. Other last-good display figures remain visible. Tests cover each stale input and mismatched snapshots. Action preparation still uses fresh guarded SDK reads. |
| 4466297392 | Took the review's bounded alternative: hide the ETH menu line when this display path supplies no balance, rather than adding an expensive canonical wallet refresh or inventing zero. Existing guarded balance lines remain visible where supplied. Production API-path browser test asserts the absent line is hidden. |
| 4466297404 | Projected-block failures have `blocks` scope and remain eligible to retry. Non-trust projection schema failures no longer clear successful RPM/state. Unit and production-app browser regressions cover it; trust mismatches still clear/stop. |
| 4466297418 | Network TypeError/timeout identity batch failures get the same shared 30s endpoint cooldown as singles, after the existing fresh chain recheck. Two transport regressions prove no repeated batch during cooldown and retry after expiry; programming TypeErrors/trust failures remain distinct. |
| 4466297427 | README now states production canonical v6/v9 inventory uses `accountSource:null` and fails closed when logs are unavailable. Explicitly configured helper hint validation remains distinct from production action discovery. |
| 4466297442 | Shared network/wallet descriptions document v9 null emission/sharePercent/estimatedSqkPerDay. Rebuilt `web/tools.json` and browser bundle; SDK/browser/JSON/MCP registry parity passes. |
| 4466297449 | **Already fixed** in the prior UI follow-up: event→Set of listeners, fanout, and matching removeListener. Kept the implementation; production wrong-chain/disconnect/reload assertions pass. No redundant replacement. |
| 4466297468 | Storage-driven Activity reload now refreshes receipts, not just repainting unverified pending items. Regression rechecks both successful and reverted transactions; existing cross-tab clear/in-flight anti-resurrection tests remain intact. No status is trusted from storage. |
| 4466297476 | Removed API-count substitution from both connect and profileBalances. Both NFT balances plus v9 NFT power always come from the guarded canonical multicall. Regression passes a false-zero display hint while canonical v9 balance is positive and verifies no wrong v6 auto-pick. Same-block final guard remains mandatory. |
| 4466297490 | Unclamped telemetry age rejects invalid dates, >5s future values, and ≥15min expired readings. Only display age is clamped. Boundary tests cover tolerance and expiry; future timestamps cannot force fast ACTIVE polling. |
| 4466306942 | Frontier callback returns explicit failure when network refresh returns null/stale or wallet refresh fails. Poller commits neither round nor processed frontier after null/false; same-round future ticks retry. Unit regression and production browser failure/recovery test reach the network panel again. |

## Review-body notes

- **Non-v9 timer nit:** poller has an enabled predicate, clears scheduled timers while v6/Mainnet is active, and is re-armed on profile switch. In-flight generations still cannot repaint after switching. Unit tests cover no disabled reads/timers and re-enabling; browser switching coverage remains in the full suite.
- **Changed-frontier test nit:** added both the failed callback/same-round retry scheduler case and the production `refreshNetwork` failure/recovery browser case above.
- **Unverified schema-default observation:** confirmed against `sdk/tools.js` and `mcp/server.js`. Removed the static `profile` input-schema default while preserving the enum, optional field and context-dependent runtime selection. The manifest's global defaultProfile remains v9; it no longer instructs clients to materialize a per-call v9 override in v6 sessions. Registry tests assert the input property has no static default on every surface.

## Validation and limits

Final commands: `npm run build`, `npm test` (18 offline scripts), and `UPDATE_SCREENSHOTS=1 npm run test:browser -- --max-failures=1` with the session's offline Chromium executable/library configuration. **PASS: 18/18 offline scripts, 200/200 mocked browser tests, 169,908 gzip bytes / 250,000 across all 10 scripts.** Screenshots regenerated; protected components/ABI/deployment pins unchanged. See the current size/validation artifacts and DATA DIET report. The first new cooldown test used a generic TypeError message (correctly classified as a programming error); corrected it to an actual fetch-failure fixture, then its second focused run passed. No production programming-error guard was weakened.

A later CodeRabbit auto-review was skipped for file-count/usage limits. We did not purchase credits, hide code from review, split/switch the fixed session branch, or claim a fresh automated approval. This document records the manual verification and regression evidence for the posted findings.
