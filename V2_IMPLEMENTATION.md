# V2 premium sharing — implementation and audit notes

## PR resolution

- PR #21 merged into `phase15-share-card` after its code CI passed: merge `6e07737` (run `42467402451`).
- Combined PR #20 passed code CI (run `42467968753`), was marked ready, then merged into `main`: merge `633f868`.
- Development stays on `arena/e471d655-squeekchain-console`; V2 is a follow-up PR to main, not an unreviewed second merge.
- Vercel's account-level deployment block is separate from code checks. Cloudflare deployment checks passed for the merged revisions.

## Architecture verified against this repository

The dashboard is vanilla JavaScript, not an existing React application. Its RPC layer already has cancellation/generation checks, failover, guarded wallet state and read error handling. The original share studio uses canvas/Three.js, not DOM-to-image. Therefore the original plan's blanket coupling, missing error handling and DOM-export diagnoses are hypotheses, not established audit findings.

This implementation adds a lazy React island for premium sharing without replacing the dashboard, wallet controller, data-fetching state, CLI or SDK:

- `ShareCard.tsx`: memoized, pure presentational component.
- `ShareModal.tsx`: preview scaling, privacy state, focus trap/return, export state, PNG/image clipboard/X actions and visible errors.
- `useSqueekMetrics.ts`: frozen snapshot view state, no additional RPCs or wallet subscriptions.
- `export.ts`: local font embedding, 2x PNG generation, object URL cleanup.
- `index.tsx`: isolated React root and render error boundary.
- `tailwind.config.js`: Obsidian/Cyan tokens; prefixed utilities with preflight disabled. No changes to the restored main-page theme.

The existing Flip/Night/Classic renderers remain intentionally available. They are not deprecated CSS modules and removing them would delete working animation/video features that the supplied PNG-only replacement does not implement. The new premium card is reached via **Premium card** next to **Share card** in the holder view.

No unused Tailwind config or unmounted TSX samples: build.mjs bundles the actual lazy entry and CSS into the static output. CI checks generated asset drift, focused lint, TypeScript, offline tests and browser tests. The production JavaScript budget remains 500,000 gzip bytes; this build uses approximately 458 KB including the lazy module.

## Truthfulness, privacy and safety

- Real Squeek count, account power, claimable, lifetime claimed and lifetime compounded values replace invented PnL/rank/score/tier defaults.
- No unconditional 'verified-on-chain', return/ROI or ranking claims.
- Unknown values remain unknown, not fabricated zero.
- Address hidden by default in preview/export and omitted from anonymous X links. Enabling identity is explicit.
- X opens a draft only, with noopener/noreferrer. It does not upload an image automatically; attach the exported/copied PNG yourself.
- Sharing never signs or sends a wallet transaction.
- No third-party avatars/icons are fetched: icons are bundled SVGs and identity is procedural. Local bundled fonts are explicitly embedded for export; failures are visible and retryable. No wildcard CORS proxy or relaxed CSP.
- Close during PNG generation suppresses a late download/state update. Clipboard permission failures suggest PNG download. Privacy controls are locked while exporting.

## Confirmed audit bugs fixed

1. Known 18-decimal SDK power values below one unit were formatted as raw integers. New `formatStakingPower` handles explicit units, zero, sub-unit values, large values and missing input, without changing legacy whole-power formatting.
2. Original video-format disclosure disappeared on style/option changes. It now lives in a persistent export-format element separate from transient status.
3. New premium opener initially lost focus after closing because its busy state disabled it during mount. Explicit close callback restores focus to the actual opener.

## Validation and remaining qualifications

- Production build, focused source lint/strict TypeScript, `npm run typecheck`, and the complete offline `npm test` chain passed locally.
- Main browser + original studio + initial premium suite: 24 passed before the final extra clipboard/error tests. Final premium + legacy studio run: 19 passed (1 minute), including all added clipboard/error and persistent-format checks.
- Actual 1200 × 680 PNG generated under the existing CSP and visually inspected; local export fonts embedded, no remote images.
- Mobile 320px scaling, address privacy/X URL behavior, keyboard focus, clipboard rejection, real image copying, missing fonts and lazy-module failure have dedicated browser tests.
- New premium export is PNG only; legacy styles retain video exports. Physical-device/Safari/Firefox export qualification is still outstanding.
- Existing high-severity Zod advisory remains. Production audit did not identify an advisory in the new React/export packages. The proposed npm audit fix includes a breaking Hardhat major change, so no forced dependency downgrade was applied.
- `npm run lint` is a focused source/syntax/read-only/strict-TypeScript gate, not a claim that the entire legacy JavaScript codebase has been ESLint-migrated.
