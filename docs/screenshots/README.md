# Deployed frontend restoration / equal-profile mocked Chromium review

**Synthetic fixtures only — not live qualification.** The layout/copy baseline is deployed commit `b705683`, with later functional v9/review additions. Actual app DOM/CSS/components and bundled local fonts, with injected network/wallet adapters and external requests blocked or explicitly mocked. Verified labels are fixture data. Review captures perform no contract simulation, wallet signature or transaction submission; Merge stops at the typed BURN acknowledgement.

76 captures: Squeeks, Network, Info, Settings, Merge, Mainnet in light/dark × 1280/390, plus eight connected/disconnected header crops, twelve v9 Squeeks/Merge/Unstake captures, sixteen conditional stall/watch/pending captures, four Fee rose captures, and four full-address Recipient-warning captures, four read-failure banner captures and four per-profile ETH wallet-menu captures. Desktop viewport 1280×960; mobile 390×844; header crops use a 900px viewport height, device scale 1. Settings/Merge/Unstake use viewport images; other main states and Fee rose are full-page. Fonts finish loading and animations are disabled. Token #87 deliberately has Unknown fields. Review banners are injected by tests only; they are absent from production.

The header has one visible verification badge opening Info → Trust; a separate screen-reader-only live region announces status without duplicating the visual chip. Header controls are 36px with 8px gaps and 18px theme/refresh/settings glyphs. Geometry and visibility are asserted, including 900/1024px desktop, hash routes and mobile overflow. The old Overview/Wallet gallery was replaced by Network/Squeeks.

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
| Squeeks · wallet/deposited positions | [PNG](v9-squeeks-light-1280.png) | [PNG](v9-squeeks-dark-1280.png) | [PNG](v9-squeeks-light-390.png) | [PNG](v9-squeeks-dark-390.png) |
| Merge · Keep #41 / burn #42 | [PNG](v9-merge-light-1280.png) | [PNG](v9-merge-dark-1280.png) | [PNG](v9-merge-light-390.png) | [PNG](v9-merge-dark-390.png) |
| Unstake · fee/net/maxFee/deadline | [PNG](v9-unstake-light-1280.png) | [PNG](v9-unstake-dark-1280.png) | [PNG](v9-unstake-light-390.png) | [PNG](v9-unstake-dark-390.png) |
| Recipient · full non-owner address | [PNG](claim-recipient-light-1280.png) | [PNG](claim-recipient-dark-1280.png) | [PNG](claim-recipient-light-390.png) | [PNG](claim-recipient-dark-390.png) |
| Fee rose · fresh quote / one Re-quote | [PNG](fee-rose-light-1280.png) | [PNG](fee-rose-dark-1280.png) | [PNG](fee-rose-light-390.png) | [PNG](fee-rose-dark-390.png) |

v9 Squeeks uses full-page captures; its Merge stops before simulation and Unstake uses an injected preview, not a contract simulation. Real quotes/ownership/verification cannot be inferred from these images. Unstake deadlines use the browser local time zone; a dedicated Asia/Kolkata test proves the conversion. Recipient warnings retain the full address with wrapping on mobile. Action regression tests use a mock wallet that refuses submission; no real wallet signature/transaction occurs.

### Conditional restorations

| View | Light · 1280px | Dark · 1280px | Light · 390px | Dark · 390px |
|---|---|---|---|---|
| Stall · Network (mocked v6 round 1973) | [PNG](stall-network-light-1280.png) | [PNG](stall-network-dark-1280.png) | [PNG](stall-network-light-390.png) | [PNG](stall-network-dark-390.png) |
| Stall · beside Claim | [PNG](stall-squeeks-light-1280.png) | [PNG](stall-squeeks-dark-1280.png) | [PNG](stall-squeeks-light-390.png) | [PNG](stall-squeeks-dark-390.png) |
| Watch mode · connected wallet retained | [PNG](watch-light-1280.png) | [PNG](watch-dark-1280.png) | [PNG](watch-light-390.png) | [PNG](watch-dark-390.png) |
| Pending · selector notice | [PNG](pending-light-1280.png) | [PNG](pending-dark-1280.png) | [PNG](pending-light-390.png) | [PNG](pending-dark-390.png) |

Stall fixtures set Core configuration and snapshot timestamp with checkpoint lag zero; the notice is absent when settlement is current. Watch captures keep the connected wallet chip while inspecting another address. Pending fixtures are browser-local synthetic records, not submitted transactions. Info captures also show the compact Trust checklist and corrected Developers table.

Explicit regeneration:

```sh
UPDATE_SCREENSHOTS=1 npm run test:browser
```

Ordinary browser tests save captures in ignored `test-results/` without changing these files. Images are review evidence, not cross-platform pixel-diff baselines. The 148-test mocked Chromium suite also covers profile/receipt races, Unknown vs zero, focus and contrast, routing/history, sheet/system theme, wallet menu/Activity, RPC diagnostic/save/remove and browser IndexedDB clear. No `test:live` was run. Historical Phase 0 qualification does not qualify this new head.

### Manual-preview corrections (synthetic only)

- Failure banners below the header in [light desktop](read-failure-light-1280.png), [dark desktop](read-failure-dark-1280.png), [light mobile](read-failure-light-390.png), [dark mobile](read-failure-dark-390.png). The displayed hash mismatch is injected test data, **not a claim that the user's live error was a hash mismatch**. Tests separately exercise network availability, banner recovery and scroll/resize geometry.
- v6 ETH menu: [desktop](wallet-menu-sepolia-v6-1280.png), [390px](wallet-menu-sepolia-v6-390.png).
- v9 ETH menu: [desktop](wallet-menu-sepolia-v9-1280.png), [390px](wallet-menu-sepolia-v9-390.png).

All header captures have one visible verification chip and only the wallet button's address. Network captures label the actual issuance source and use natural round plurals. The v6 production SDK now reads NFT totalSupply on-chain; screenshot adapters still inject synthetic supply counts, not live chain data.
