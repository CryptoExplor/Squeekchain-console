# PR #22 merge audit — reviews #15–#22

## Scope and review inventory

Read the issue-discussion comments, submitted reviews, and inline review comments for every PR from #15 through #22 (paginated GitHub API). Inventory at audit start:

| PR | Discussion comments | Submitted reviews | Inline comments | Relevant disposition |
| --- | ---: | ---: | ---: | --- |
| 15 | 4 | 0 | 0 | Deployment success; closed/failed and usage-limited bot reviews. No actionable inline finding provided. |
| 16 | 3 | 0 | 0 | Deployment success; draft-review skipped; review usage limit. |
| 17 | 4 | 0 | 0 | Deployment success; closed/failed and usage-limited bot reviews. |
| 18 | 4 | 0 | 0 | Deployment success; closed/failed and usage-limited bot reviews. |
| 19 | 3 | 0 | 0 | Deployment success; closed/failed and usage-limited bot reviews. |
| 20 | 4 | 0 | 0 | Deployment success; closed/failed and usage-limited bot reviews. |
| 21 | 6 | 0 | 0 | Two engineering audit reports plus deployment/skipped/usage-limited notices. |
| 22 | 4 | 1 | 3 | CodeRabbit review with three actionable comments; incomplete generated-bundle coverage and docstring warning; Codex review failed due to usage limit. |

**Skipped/failed bot reviews are not represented as approvals.** PR #22's CodeRabbit check passed but its code CI failed; neither a deployment nor a bot's green summary substitutes for passing tests.

## Confirmed findings and fixes

1. **CI blocker: keyboard test races disabled controls during share-sheet reopening.** Original PR22 CI run `42468701870`, job `128694142608`: 308 passed / 1 failed. The persisted `aria-pressed` value is rendered before async stage preparation unlocks the controls. Calling `focus()`/Enter at that point does not activate the disabled button. Wait explicitly for enabled controls before keyboard interaction; retain all toggle assertions and zero retries.
2. **Review 4505794740: artifact directory missing on custom-output runs.** Create `artifacts/` recursively before writing the exported PNG.
3. **Review 4505794754: premium import cleanup can override the new wallet's loading gate.** Apply one current-state eligibility helper during holder rendering and after busy cleanup. It respects the in-flight import lock, current owner, snapshot availability and destruction. Regression fixture deliberately stalls the new wallet read across adapter regeneration; no stale modal may mount and the button must remain disabled after the old import finishes.
4. **Review 4505794761: full address in X URL was insufficiently disclosed.** Showing a shortened address no longer opts into a full-address X link. A separate, default-off toggle explicitly explains full-address disclosure. Rehiding identity also clears link consent. Tests cover anonymous sharing, shortened identity without full URL, and explicitly consented full URL.
5. **Additional audit hardening: idempotent React root cleanup.** Manual close followed by dashboard destruction must not invoke cleanup/callback twice. Dedicated regression added.

The source/export/boundary helpers now have additional targeted documentation. CodeRabbit's numeric docstring coverage was not locally reproduced and is not represented as independently certified.

## Historical audit carry-forward

PR21's known 18-decimal fractional-power issue is fixed by PR22's explicit `formatStakingPower` rather than magnitude guessing; zero/sub-unit/large/unknown unit tests and a real PNG integration exercise that path. PR21's disappearing video-format message is fixed by a separate persistent `share-format` element and a style/visibility regression test.

Prior abort/export/fallback/focus/GPU fixes remain covered by the original sharing suite. No wallet, transaction, RPC trust, chain configuration or indexer authority changes were introduced by these review fixes. Real holder data remains separate from presentation; no invented PnL, rankings, tiers or verification claims were added.

## Build and dependency audit

- Clean `npm ci`, production build, focused lint, strict TypeScript, and complete offline `npm test` passed.
- Full source-to-generated build was rerun, including the generated `web/premium-share.js` that CodeRabbit could not review. CI checks generated-asset drift.
- Total independently gzipped production JavaScript: approximately 458 KB, under the 500,000-byte budget, including the lazy React module.
- Lockfile was included in clean installation and audit review; no lockfile deletion or forced breaking upgrades.
- Existing high-severity Zod/Hardhat advisory remains outside this UI fix. Vercel's account-level deployment block is also not a code fix. Neither is claimed resolved.

## Qualification

This is an engineering audit, not an exhaustive security certification. Browser checks use deterministic fixtures, not live wallet transactions. Physical mobile/Safari/Firefox export qualification remains outstanding. Tests and final GitHub code-CI evidence are recorded on PR22 before merge. Review fixes are delivered from the active session branch through an intermediate PR into PR22's head branch, without pushing directly to another session's branch.

## Follow-up review on b3ac86b

After PR24's rendering hardening passed 316 browser tests and merged into PR22, a new review identified further valid cases. Main merge was held:

- A 15-second deadline now bounds the complete export, including non-abortable FontFaceSet waits. Per-attempt abort signals cancel embedded-font fetches and fence every later render step. Only successfully loaded font CSS is cached; old pending promises cannot poison retries. Watchdog timers reject stalled work; they are not timing-based render delays.
- Card and X draft share one unknown-metric formatter. Missing/NaN/infinite values remain unknown everywhere.
- Zero-minimum grid tracks constrain both columns. Full metric strings adapt font size and wrap rather than ellipsize; uint256-length values cannot push stats off-card.
- Added exact full-string SVG checks, last-character raster checks for all five metrics, and footer/layout containment at 375px. The worst-case exported PNG was visually inspected. Two independent timeout/retry tests cover abortable embedded-font fetches and late non-abortable FontFaceSet completion; neither old attempt may download or begin an extra encoding pass after a retry.

These fixes are isolated from legacy card styles and wallet/transaction paths and require another full code-CI pass before merge.
