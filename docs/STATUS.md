# Wheelhouse — Phase 3 structure ready for draft review

**Date:** 2026-11-03 (Asia/Calcutta). **PR:** [#3](https://github.com/CryptoExplor/Squeekchain-console/pull/3), open/draft. **Branch:** `arena/417b8688-squeekchain-console`. The user explicitly chose to extend the existing draft after being told this session cannot create a separate branch. No main push, merge or deployment.

## Plan

- Phase 0 audit/live gate: historically complete. [Run 41618128325](https://github.com/CryptoExplor/Squeekchain-console/actions/runs/41618128325) qualified `dd0afff7a88250d5d8aca88427ffe449c9e387c4`; [metadata evidence](audit/live-qualification-run-41618128325.json). Artifact contents were not inspected; no block/hash/latency metrics are invented.
- Phase 1 design system: merged in PR #2 at `22263e775461101b7d1dcb24933edd2ccd5a281f`. Its final source `b26f7f94fb0c28601408f4fade93f87bc2f84b1f` also passed [run 41650460910](https://github.com/CryptoExplor/Squeekchain-console/actions/runs/41650460910). These passes do **not** qualify this head.
- Header polish: in PR #3, now extended with Phase 3 at the user's request; PR #3 is not merged.
- Phase 2 data-layer gap audit: not newly completed or claimed by this structural change.
- **Phase 3 structure: implemented for draft review.**
- Phase 4: selection-based actions, planner, per-Squeek pages and expanded holder/watch workflow — next, not implemented here.
- Phase 5: slim Network / Genesis decision later. Phase 6: agent expansion later; existing tools only moved to Info › Developers. Phase 7: Vercel CSP, additional mock-wallet E2E, Lighthouse 90+ and README hardening later; no Lighthouse score claimed.
- Deferred: Cloudflare cron/alerts, push, Telegram, OG. Vercel is the target; alerts remain in-tab. Staking stays **Coming when documented**.

## Phase 3 delivery

- Hash tabs: Squeeks, Art, Network, Info; default Network without an address, Squeeks on wallet connection or watch. Explicit hashes/deep links, back/forward and keyboard tab navigation work. Legacy JavaScript tab names remain aliases for integrations.
- Header status opens Info › Trust. Wallet menu: copy, Activity with pending count, disconnect. When saved Activity exists without a connected wallet, the menu remains reachable and offers connection on deployed profiles. On Mainnet it offers Activity only, never connection or a chain action.
- Settings is a focus-trapped sheet, with Escape/backdrop close and focus restoration. Custom RPC save/test/remove retains browser-local HTTPS validation. Test reads only chainId/block and is explicitly **not** verification. A custom RPC **joins the peer set, never replaces the two-peer check**.
- Cache clear removes only IndexedDB discovery/log records (and their memory fallback), aborting stale loads first. It preserves the current wallet/address and does not clear trust pins or wallet history. Activity clear requires confirmation explaining that clearing does not cancel pending transactions. Receipt monitoring otherwise keeps the same lifecycle and persistence.
- Light/dark/system themes; light remains default without an explicit saved choice. System follows OS changes and is applied before first paint.
- Info sections: deployment-record levels/weights/cooldowns and merge/reward/checkpoint explanation; Trust with snapshot/check time and stop rationale; profile capability status; explorer-linked contracts/release; whole Agent/SDK console plus tools.json and local MCP snippet; About/non-affiliation/source/Genesis referral.
- Trust distinguishes configured peer availability preferences from actual per-read provenance: selected endpoint identities are not exposed by the existing SDK, so the UI does not invent them. Failed reads clear the current snapshot/check time and show stop. v9 remains read-only/unverified.
- Hero, intro, network strip, next-move cards, holdings capability grid and section eyebrows removed. Watch remains at the top of Squeeks as View address, with the existing disconnected/watch behavior. Developers and capabilities are in Info. Activity is a drawer instead of an always-open panel. Mainnet still has no chain panels or owner actions, but Info and saved Activity are available.
- Mocked-review notices are injected only by test fixtures, never by the production page.

## Safety preserved

No changes to snapshot/hash verification, deployment pins, runtime ABI integration, capability authority, owner checks, exact BURN acknowledgement before call construction/simulation, simulation review/fresh verification, wallet-only signing or keeper defaults. Unknown never becomes fabricated zero. Genuine zero remains valid. Reward/frontier/paused messages are driven by live reads, not hardcoded rounds; Core pause stops new issuance, not claims of already-funded SQK. Mainnet remains not deployed; observed v9 never gains transaction paths. Profile switches still abort/clear/isolate stale state, and broadcast Activity survives them. No keys, backend, RPC proxy, remote MCP, closed-tab monitoring or transaction resubmission.

Minimal non-visual plumbing: clear methods on the existing discovery and Activity stores, browser exports for display-only policy and public RPC configuration. The level table was checked against the official [deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json) and [owner-actions guide](https://docs.squeekchain.com/developers/owner-actions.md), re-read 2026-11-03; it never supplies runtime merge eligibility.

## Validation

- `npm test`: all **11 scripts pass**, including original safety/RPC/request-budget regressions and new IndexedDB/memory/Activity clear checks.
- `npm run test:browser`: **48 mocked Chromium tests pass**, covering 24 full-state captures, eight header captures, routing/deep links/history, wallet copy/menu/pending count, Activity after profile switches/reload, confirmed clear/cancel, actual browser IndexedDB clear, diagnostic RPC test/save/remove, system theme and sheet/modal focus. External requests blocked or mocked. No live RPC, contract simulation or signed transaction in review captures.
- Build/static parity and JS budget pass: **150,497 gzip bytes across five scripts**, below 200,000. [Per-file report](audit/phase1-js-size.json); `dist/` remains ignored.
- Request budgets unchanged: **22 cold network / 12 warm network / 15 wallet**, measured through deterministic wire tests. Warm limit stays 25.
- [32 mocked review images](screenshots/README.md): Squeeks, Network, Info, Settings, Merge and Mainnet, light/dark × 1280/390; plus eight connected/disconnected header crops. Old Overview/Wallet captures replaced, not presented as current layout.
- `git diff --check`: pass after whitespace cleanup.

**No `test:live`, live workflow dispatch/label, keeper activation, signing, merge or deployment was performed.** Historical Phase 0 qualification is retained, not transferred to this head. Manual review and any final-head live qualification remain user-controlled.
