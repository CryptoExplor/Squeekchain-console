# Phase 1 mocked Chromium review

**Synthetic fixtures only — not live qualification.** The captures use the actual Wheelhouse DOM, components, CSS and locally bundled fonts. Network/SDK/wallet adapters are injected by `test/review-fixture.mjs`. External requests are blocked. No contract simulation, wallet submission or signature occurs; merge images show the typed acknowledgement but stop before simulation. “Verified” in these images is fixture data, not a live attestation.

All 16 full-view states were regenerated after the header-only follow-up, alongside eight new header crops. Header controls are 36px with 8px gaps and theme/refresh glyphs are 18px. Header control alignment, hero visibility, labelled card cells below 600px, single Mainnet status and review-ribbon position are asserted. All 24 states are tested by `test/screenshots.spec.mjs`. Light and dark are explicit choices; desktop viewport is **1280 × 960**, mobile is **390 × 844**, device scale 1. Header-only captures use the same widths with a 900px viewport height and crop to the header. Overview, Wallet and Mainnet use full-page images; Merge uses a viewport image to keep the focused dialog readable. Animations are disabled, and local fonts finish loading before capture. Wallet token #87 deliberately has Unknown fields to show unavailable data, rather than fabricated zeroes.

| View | Light · 1280px | Dark · 1280px | Light · 390px | Dark · 390px |
|---|---|---|---|---|
| Overview | [PNG](overview-light-1280.png) | [PNG](overview-dark-1280.png) | [PNG](overview-light-390.png) | [PNG](overview-dark-390.png) |
| Wallet / My Squeeks | [PNG](wallet-light-1280.png) | [PNG](wallet-dark-1280.png) | [PNG](wallet-light-390.png) | [PNG](wallet-dark-390.png) |
| Merge · typed BURN-42 | [PNG](merge-light-1280.png) | [PNG](merge-dark-1280.png) | [PNG](merge-light-390.png) | [PNG](merge-dark-390.png) |
| Header · disconnected | [PNG](header-disconnected-light-1280.png) | [PNG](header-disconnected-dark-1280.png) | [PNG](header-disconnected-light-390.png) | [PNG](header-disconnected-dark-390.png) |
| Header · connected | [PNG](header-connected-light-1280.png) | [PNG](header-connected-dark-1280.png) | [PNG](header-connected-light-390.png) | [PNG](header-connected-dark-390.png) |
| Mainnet · not deployed | [PNG](mainnet-light-1280.png) | [PNG](mainnet-dark-1280.png) | [PNG](mainnet-light-390.png) | [PNG](mainnet-dark-390.png) |

To explicitly regenerate tracked images on a supported local Chromium installation:

```sh
UPDATE_SCREENSHOTS=1 npm run test:browser
```

Ordinary `npm run test:browser` exercises/captures the same states under `test-results/`, **without overwriting these tracked review files**. The images are review evidence, not cross-platform pixel-diff baselines. Additional offline tests cover theme/contrast, cancellation/profile races, Activity persistence, RPC fallback, the shared TokenCard keyboard interaction and isolated artwork image, and typed burn guards. Phase 0 live qualification passed separately on dd0afff in run 41618128325; these images remain mocked. PR #2 is merged; user manual browser review and an opted-in `run-live` rerun for the new header follow-up head remain required before its merge; no sandbox `test:live` is part of this capture process.
