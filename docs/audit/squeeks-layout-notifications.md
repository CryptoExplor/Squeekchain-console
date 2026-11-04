# Squeeks layout and lifecycle notifications

> Historical qualification for the commits named in this document. Current security follow-up and changed request/size budgets: [security-review-followup.md](security-review-followup.md).

Production implementation: `bad97fa4ce774c23d154236cae596ad81ab9c0e4`.
Wallet / Live Wheel prerequisite was completed, qualified and pushed first at `a0ca1352b91c12877c8bb0fa6deed77c8caf3d6a` (19 offline scripts, 211 mocked Chromium tests, 173,350 gzip bytes). See [wallet and wheel evidence](wallet-wheel.md).

## Notifications

- No permanent warning beneath the profile selector. An actual profile/account switch with unresolved Activity entries produces “1 transaction still pending. Switching won't cancel it.” (pluralised for multiple entries), with a **View** action opening Activity. Initial history display and switches without pending entries do not produce that warning. Pending records still survive switches and late wallet responses.
- One Toast component handles submitted, confirmed and failed transactions, other errors, address-copy feedback and switch warnings. Successful/transient notifications dismiss after 6 seconds. Errors remain until dismissed, including through profile navigation. Submitted hashes are recorded before notification; confirmation is based on Activity's independently checked receipt/12-confirmation status, not a fabricated successful outcome.
- Desktop stack: top-right, below the measured header. Mobile: bottom, capped to available height below the header. View and close controls have accessible names and 44px targets; status/alert roles, atomic messages and a polite notification region provide announcements. No signing, resubmission or retry is attached to a toast.

## Squeeks workspace

- One heading row with the shortened inspected address (full tooltip; copies the full address) and a 44px refresh icon. No Your wallet block, text merge-plan refresh button or empty-wallet checkpoint sentence.
- Row 1: selection count and Merge / Deposit / Withdraw / Merge deposited on the left; Deposit permissions and explicit single/all-Squeek approvals on the right. Unsupported v6 staking/approval controls remain hidden, not falsely advertised.
- Row 2: equal-width ID preview and merge columns. Inputs are bounded to their column; ID input and Preview remain inline. At 390px the groups wrap and the columns stack. Watch input is bounded on desktop, not stretched across the page.
- Selected pair displays keep/burn IDs, resulting level and the exact BURN acknowledgement required **before** construction/simulation. Existing fresh canonical ownership, custody, eligibility, simulation, re-preview and human-wallet safety paths remain intact. Checkbox selection and API display rows are never transaction authority.
- Gates check ownership context, selection size, same known level and matching custody. Single approval requires one wallet Squeek; broad approval is a separate explicit full-scope choice. Manual IDs are validated for the current inspected inventory before Preview becomes available. SDK simulation remains the final authority.
- Empty NFT inventory shows its heading/address/refresh and “No Squeeks in this wallet”, not the two action rows. The separate SQK workspace remains usable for an SQK-only account. Loading, failure and Unknown are not treated as a proven empty inventory.
- The existing load/frontier refresh reconstructs the holder/plan and clears stale selection. A production-display-path regression changes a settlement and token level and proves the old selected merge cannot stay enabled. The retained legacy table/plan DOM is non-visual; it is not a duplicate nested card or action UI.

## Captures

Twelve new full-page captures, all synthetic and unsigned:

`docs/screenshots/squeeks-layout-{v6,v9}-{empty,selected,pending}-{390,1280}.png`

The pending cases cover switches in both directions (the filename profile is the starting profile). Toast geometry is asserted against the actual header bounds. Existing paired wallet/wheel after captures and the 32-case light/dark Squeeks matrix are refreshed by the complete mocked suite. Before captures remain untouched. No screenshot is evidence of live chain availability or deployed qualification.

## Regression updates and failure log

- Replaced only superseded permanent-warning, text-refresh-button, full-address text and old merge-list entry assertions. Pending-history persistence, modal BURN order, fee/re-quote, Unknown, owner/watch and late-hash tests remain.
- Selection-driven tests now select real fixture NFTs before activating actions. The mixed-custody test additionally checks the toolbar stays disabled, then exercises the public request path to retain the SDK remedy/no-wallet regression.
- The original frontend baseline still hashes all unaffected components/styles/columns. Exceptions are narrowly scoped to the explicitly replaced refresh button and Toast function; the original Toast fixture is preserved for comparison. `test/components.mjs:65` remains byte-for-byte unchanged.
- New frontier test initially changed a token level without updating the synthetic artwork metadata. The existing mismatch guard correctly cleared the view. That test attempt was interrupted after tracing the cause; the fixture now waits for initial art caching and supplies the matching new metadata level. Its focused rerun passes. No guard was relaxed and no live request/retry was made.
- No repeated same-reason fix failures occurred in this layout stage. First focused run: 15/15 pass; existing affected browser suites: 113/113 pass. Final complete-suite results follow below.

## Removed/replaced visible strings

- “Pending transactions continue; switching can't cancel them.” (permanent header warning).
- “Your wallet”.
- “Refresh merge plan”.
- “this address owns no Squeeks — it can still run checkpoints”.
- The old holder-hint strings: “Holdings count Unknown; actions remain disabled.”, “view only: connect this wallet to claim or merge”, and the optional “≈… SQK/day at current share”. Unknown/action gates and the watch chip remain.
- The duplicate inner “Squeeks” heading (the main heading remains).
- “Choose which image and token ID survives. Type BURN-<id> to confirm the permanent burn, then review what will happen before opening your wallet.” (replaced by the pair-specific BURN step).
- The initial “Merging burns the donor NFT permanently and raises the survivor one level.” placeholder (replaced by the live merge guidance/pair summary).
- Old “<label> submitted <short hash>…” and “<label> mined in block <block>. Activity tracks confirmations.” notifications (replaced by submitted/confirmed/failed with View; full identity remains in Activity).

## Qualification

- `npm test`: **19/19 offline scripts PASS** (`.cache/layout-offline-final.log`).
- `npm run test:browser -- --max-failures=1`: **227/227 mocked Chromium tests PASS** (`.cache/layout-browser-final.log`).
- Build: **174,543 / 250,000 gzip bytes**, all **12** independently compressed scripts including lazy modules. Breakdown: `data-diet-js-size.json`.
- v6 SDK budget: cold network 22 / warm network 12 / wallet 15; v9: cold/warm network 15/13, cold/warm wallet 20/14 (warm cap 25). These are the existing SDK fixtures, not a new full-page performance claim.
- Twelve new layout/notification screenshots and all twelve wallet/wheel after captures saved; 32-case Squeeks audit also refreshed. The general older gallery is historical.
- `git diff --check` clean. ABI/pins/SDK/MCP/CLI and the protected assertion on line 65 unchanged.

 Offline/mocked only; no test:live, live signing, merge, keeper, paid service or manual deployment. ABI/pins, SDK/MCP/CLI, chain trust checks and both SDK request budgets are unchanged. The wider DATA DIET whole-page comparison and fork execution remain separate outstanding qualification, not claimed here.
