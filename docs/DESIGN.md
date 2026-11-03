# Wheelhouse design contract — header-polish follow-up

Wheelhouse is the independent, browser-first Squeekchain holder console. The repository remains **Squeekchain-console**; the Cloudflare Pages project and opt-in live workflow remain **thewheel**. No repository/project rename or official affiliation is implied.

## Reference and direction

The [official homepage](https://squeekchain.com/) was re-read on 2026-11-03. Its hamster-powered identity and Genesis/Sepolia destinations remain the reference for voice and links. This continues the existing, approved Squeekchain-inspired typography and gold/blue direction, rather than copying its logo or replacing the app architecture. Text retrieval is not a rendered visual comparison; pixel-for-pixel parity with the current official site is not claimed. Final human browser review remains at the end of Phase 1.

## Foundations

- **Light by default**, even when the OS prefers dark. An explicit saved dark selection wins. Theme state is exposed with `aria-pressed` and a destination-specific tooltip. Browser chrome uses the actual surface token; the saved choice is applied before first paint.
- **Type:** local Barlow Condensed for editorial headings, Quicksand for body/voice, IBM Plex Mono for labels/data. No CDN font dependency. Operational captions use a shared 11px token rather than 7–10px overrides; numbers retain tabular figures.
- **Surfaces:** warm light `#fafaf7`, white panels, ink `#292b26`; dark surface `#10120f`, panel `#141418`, ink `#edeee7`. The original editorial spacing, wheel artwork and responsive layout remain intact.
- **Accents:** gold primary controls with dark labels; blue links/focus. Semantic primary-fill/hover/on-primary tokens keep controls consistent. Destructive controls use a separate deep-red fill/hover with white labels in both themes, rather than reusing the brighter dark-theme error-text color.
- **Accessibility:** 36px header controls (explicit follow-up requirement), 44px action/dialog controls, visible 3px keyboard focus, reduced-motion handling, status text beyond color, mobile-visible wallet/verification, skip link and existing modal focus trap/restore. The palette test checks selected normal-text pairs at **at least 4.5:1**, including primary/danger hover and status chips. This is not a blanket WCAG certification.

## Shared components

`web/components.js` keeps the existing vanilla-DOM/static architecture and theme tokens. None of these components reads RPC, grants capabilities, constructs transactions or signs anything.

| Component | Use and contract |
|---|---|
| Panel | Enhances existing panels with labelled regions and explicit busy state; retains known readings while refreshing. |
| Stat | Centralizes display formatting; null, absent, invalid or unavailable values become **Unknown**, while a genuine zero remains zero. |
| Table | Wallet holdings with an accessible caption, scoped headers and labelled per-token cards below 600px, with every cell visible; desktop retains the table. Missing cells show Unknown. |
| TokenCard | Native button/keyboard interaction for gallery items; isolated `<img>`, never parsed SVG/metadata markup. |
| ConfirmDialog | Shared confirmation/art focus trap and restoration. Merge requires exact typed BURN-<id> acknowledgement before building/simulating; subsequent simulation review/fresh verification/wallet-only signing remain unchanged. |
| Toast | Text-only status/error notifications with status/alert semantics; long hashes wrap inside the mobile viewport. |
| Skeleton | Loading treatment for Unknown values; does not hide known readings or replace missing readings with zero. Background-only pulse retains text contrast and respects reduced motion. |

The header keeps live verification separate from the profile's support badge. Both header/footer carry the Wheelhouse wordmark; the footer explicitly states that this is an independent community console **not affiliated with Squeekchain**.

## Offline acceptance

[The committed review gallery](screenshots/README.md) contains 24 captures: 16 light/dark × desktop/mobile × Overview/Wallet/Merge/Mainnet views plus eight connected/disconnected header crops from the mocked suite.

`npm run test:browser` uses Chromium with external requests blocked or explicitly mocked. It verifies light/saved theme behavior, 320/390/768/1280px layout without page overflow, wallet/verification visibility, keyboard navigation, profile cancellation and Activity persistence. The design-system test measures computed text/background contrast for secondary text, captions, status chips, primary and danger controls in both themes, checks theme metadata/state, and exercises keyboard focus. These checks are not live RPC qualification.

`npm test` retains capability, trust, simulation, explicit BURN, no-key, no-signing, API hint validation, request-budget and persistence regressions. Presentation changes must never enable v9/mainnet actions, soften snapshot verification or make unavailable values zero. The full approved safety rules remain unchanged.

## Distribution budget

`npm run build` checks static parity (including the components module) and writes ignored `dist/js-size.json`. It independently gzips every dist JS response with Node's default gzip level and sums the result: **147,354 bytes**, under the **200,000-byte** budget. The build fails if this budget is reached/exceeded. Fonts/CSS are not counted as JavaScript. See the committed [per-file report](audit/phase1-js-size.json).

## Pre-merge review (polish-head rerun pending)

Phase 0 qualification passed in run 41618128325 on dd0afff. PR #2 subsequently merged at `22263e775461101b7d1dcb24933edd2ccd5a281f`; this header follow-up is a separate draft against main. It is not live-qualified. The user reviews the actual app and triggers **run-live** on the intended final head before merge. No sandbox live retry or automatic gate trigger is part of design work.

## Screenshot-review layout refinements

The profile select occupies a full mobile row; badges share the next row, then wallet/theme/refresh controls align on a single row. Only Overview shows the full hero; body copy wraps naturally. Mainnet keeps one support badge and one status panel, without repeating the hero or deployment message. Mobile holdings below 600px use labelled token cards derived from the same table cells, not a second data/action source. Screenshot-only review ribbons sit below the header. These are presentation changes only; transaction/cancellation/verification rules remain intact.

## Header-only follow-up

Disconnected wallets have no redundant status chip; connected wallets retain address/balance. Select, badges and wallet buttons are 36px tall with a common radius, 11px text/14px line height and 8px group gaps. Theme/refresh are 36×36px with authored 18px SVGs, accessible labels and the existing visible focus rings. At widths ≥900px the brand and right-aligned controls share one row, with Squeekchain/Docs before the select; at 390px the stacked layout remains. The support and verification badges remain separate. Compact-desktop read-only/unverified text is checked for clipping. Body/action/dialog controls and all safety paths are unchanged.
