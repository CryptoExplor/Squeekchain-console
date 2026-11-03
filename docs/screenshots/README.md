# Equal-profile / subtract-pass mocked Chromium review

**Synthetic fixtures only — not live qualification.** Actual app DOM/CSS/components and bundled local fonts, with injected network/wallet adapters and external requests blocked or explicitly mocked. Verified labels are fixture data. Review captures perform no contract simulation, wallet signature or transaction submission; Merge stops at the typed BURN acknowledgement.

44 captures: Squeeks, Network, Info, Settings, Merge, Mainnet in light/dark × 1280/390, plus eight connected/disconnected header crops and twelve v9 Squeeks/Merge/Unstake captures. Desktop viewport 1280×960; mobile 390×844; header crops use a 900px viewport height, device scale 1. Settings/Merge/Unstake use viewport images; other main states are full-page. Fonts finish loading and animations are disabled. Token #87 deliberately has Unknown fields. Review banners are injected by tests only; they are absent from production.

Header controls are 36px with 8px gaps and 18px theme/refresh/settings glyphs. Geometry and visibility are asserted, including 900/1024px desktop, hash routes and mobile overflow. The old Overview/Wallet gallery was replaced by Network/Squeeks.

| View | Light · 1280px | Dark · 1280px | Light · 390px | Dark · 390px |
|---|---|---|---|---|
| Squeeks | [PNG](squeeks-light-1280.png) | [PNG](squeeks-dark-1280.png) | [PNG](squeeks-light-390.png) | [PNG](squeeks-dark-390.png) |
| Network | [PNG](network-light-1280.png) | [PNG](network-dark-1280.png) | [PNG](network-light-390.png) | [PNG](network-dark-390.png) |
| Info | [PNG](info-light-1280.png) | [PNG](info-dark-1280.png) | [PNG](info-light-390.png) | [PNG](info-dark-390.png) |
| Settings sheet | [PNG](settings-light-1280.png) | [PNG](settings-dark-1280.png) | [PNG](settings-light-390.png) | [PNG](settings-dark-390.png) |
| Merge · typed BURN-42 | [PNG](merge-light-1280.png) | [PNG](merge-dark-1280.png) | [PNG](merge-light-390.png) | [PNG](merge-dark-390.png) |
| Mainnet · not deployed | [PNG](mainnet-light-1280.png) | [PNG](mainnet-dark-1280.png) | [PNG](mainnet-light-390.png) | [PNG](mainnet-dark-390.png) |
| Header · disconnected | [PNG](header-disconnected-light-1280.png) | [PNG](header-disconnected-dark-1280.png) | [PNG](header-disconnected-light-390.png) | [PNG](header-disconnected-dark-390.png) |
| Header · connected | [PNG](header-connected-light-1280.png) | [PNG](header-connected-dark-1280.png) | [PNG](header-connected-light-390.png) | [PNG](header-connected-dark-390.png) |


### v9 actions (synthetic quotes/custody)

| View | Light · 1280px | Dark · 1280px | Light · 390px | Dark · 390px |
|---|---|---|---|---|
| Squeeks · Wallet/Staked | [PNG](v9-squeeks-light-1280.png) | [PNG](v9-squeeks-dark-1280.png) | [PNG](v9-squeeks-light-390.png) | [PNG](v9-squeeks-dark-390.png) |
| Merge · typed burn | [PNG](v9-merge-light-1280.png) | [PNG](v9-merge-dark-1280.png) | [PNG](v9-merge-light-390.png) | [PNG](v9-merge-dark-390.png) |
| Unstake · fee/net/maxFee/deadline | [PNG](v9-unstake-light-1280.png) | [PNG](v9-unstake-dark-1280.png) | [PNG](v9-unstake-light-390.png) | [PNG](v9-unstake-dark-390.png) |

v9 Squeeks uses full-page captures; its Merge stops before simulation and Unstake uses an injected preview, not a contract simulation. Real quotes/ownership/verification cannot be inferred from these images. Action regression tests use a mock wallet that refuses submission; no real wallet signature/transaction occurs.

Explicit regeneration:

```sh
UPDATE_SCREENSHOTS=1 npm run test:browser
```

Ordinary browser tests save captures in ignored `test-results/` without changing these files. Images are review evidence, not cross-platform pixel-diff baselines. The 76-test mocked Chromium suite also covers profile/receipt races, Unknown vs zero, focus and contrast, routing/history, sheet/system theme, wallet menu/Activity, RPC diagnostic/save/remove and browser IndexedDB clear. No `test:live` was run. Historical Phase 0 qualification does not qualify this new head.
