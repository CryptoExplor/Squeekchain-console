# Wheelhouse design contract — Phase 1 WIP

Wheelhouse is the independent, browser-first Squeekchain holder console. The repository remains **Squeekchain-console**; the Cloudflare Pages project and opt-in live workflow remain **thewheel**. No repository/project rename or official affiliation is implied.

## Reference and direction

The [official homepage](https://squeekchain.com/) was re-read on 2026-11-03. Its hamster-powered identity and Genesis/Sepolia destinations remain the reference for voice and links. This continues the existing, approved Squeekchain-inspired typography and gold/blue direction, rather than copying its logo or replacing the app architecture. Text retrieval is not a rendered visual comparison; pixel-for-pixel parity with the current official site is not claimed. Final human browser review remains at the end of Phase 1.

## Foundations

- **Light by default**, even when the OS prefers dark. An explicit saved dark selection wins. Theme state is exposed with `aria-pressed` and a destination-specific tooltip. Browser chrome uses the actual surface token; the saved choice is applied before first paint.
- **Type:** local Barlow Condensed for editorial headings, Quicksand for body/voice, IBM Plex Mono for labels/data. No CDN font dependency. Operational captions use a shared 11px token rather than 7–10px overrides; numbers retain tabular figures.
- **Surfaces:** warm light `#fafaf7`, white panels, ink `#292b26`; dark surface `#10120f`, panel `#141418`, ink `#edeee7`. The original editorial spacing, wheel artwork and responsive layout remain intact.
- **Accents:** gold primary controls with dark labels; blue links/focus. Semantic primary-fill/hover/on-primary tokens keep controls consistent. Destructive controls use a separate deep-red fill/hover with white labels in both themes, rather than reusing the brighter dark-theme error-text color.
- **Accessibility:** 44px controls, visible 3px keyboard focus, reduced-motion handling, status text beyond color, mobile-visible wallet/verification, skip link and existing modal focus trap/restore. The palette test checks selected normal-text pairs at **at least 4.5:1**, including primary/danger hover and status chips. This is not a blanket WCAG certification.

## Offline acceptance

`npm run test:browser` uses Chromium with external requests blocked or explicitly mocked. It verifies light/saved theme behavior, 320/390/768/1280px layout without page overflow, wallet/verification visibility, keyboard navigation, profile cancellation and Activity persistence. The design-system test measures computed text/background contrast for secondary text, captions, status chips, primary and danger controls in both themes, checks theme metadata/state, and exercises keyboard focus. These checks are not live RPC qualification.

`npm test` retains capability, trust, simulation, explicit BURN, no-key, no-signing, API hint validation, request-budget and persistence regressions. Presentation changes must never enable v9/mainnet actions, soften snapshot verification or make unavailable values zero. The full approved safety rules remain unchanged.

## Pre-merge review (deferred)

At the end of Phase 1, the user will review the actual app in their browser and re-trigger **run-live** on the intended final PR head. Keep PR #2 open/draft until review and pre-merge live qualification. No sandbox live retry or automatic gate trigger is part of design work.
