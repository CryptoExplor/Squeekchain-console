# Wheelhouse design contract — Phase 3

An independent browser-first holder utility, network second. Repository remains **Squeekchain-console**; deployment target is Vercel. No official affiliation, backend, RPC proxy or architecture restart.

## Foundations

- Light by default; explicit light/dark/system saved preference wins. System follows OS changes. Theme metadata/state, local fonts and pre-paint selection retained.
- Local Barlow Condensed headings, Quicksand body and IBM Plex Mono labels/data. Neutral panels with gold primary controls, blue focus/links, semantic danger colors; readable 11px operational labels and tabular numbers.
- Header controls 36px, common radius and 8px gaps; theme/refresh/gear have authored 18px glyphs. Action/dialog controls remain 44px. Visible 3px focus, reduced motion, skip link, keyboard tab/menu navigation, sheet and confirmation focus traps/restoration.
- Existing selected text/background contrast checks require at least 4.5:1 in light and dark; not a blanket WCAG or Lighthouse certification.

## Structure

Squeeks · Art · Network · Info use URL hashes. Network defaults without a wallet/watch; connecting or viewing an address selects Squeeks. Explicit deep links survive reload/history. No hero, page intro, section eyebrows, network strip or next-move cards. Holdings capability cards move to Info › Status. Watch input sits at the top of Squeeks with its existing read-only inspection behavior. Existing claim/merge inputs remain until Phase 4.

Status opens Info › Trust. Wallet menu has copy, Activity/pending count and disconnect; saved Activity remains reachable across profiles and after disconnection. Mainnet exposes no connection/signing through that menu. Activity drawer and Settings sheet close with Escape/backdrop and restore focus. Activity monitoring remains in-tab.

Settings holds custom HTTPS RPC save/test/remove, discovery-cache clear, confirmed Activity clear and light/dark/system theme. RPC diagnostic chainId/block is not a verification pass. Custom peers join, never replace, two-peer snapshot checks. Cache clear does not erase ownership checks, deployment pins or unrelated storage.

Info anchors: How it works, Trust, Status, Contracts, Developers, About. Policy table is display-only published v6 data. Actual readiness, pauses and cooldown eligibility still come from verified live reads. Trust shows the snapshot/check time, configured peers and mismatch stop rationale without inventing per-read endpoint provenance. The existing tool console, tools.json and local stdio MCP snippet live in Developers; no tool/signing expansion. About retains source/non-affiliation/testnet copy and the user's Genesis referral URL under Discover Genesis.

## Components and safety

Existing Panel, Stat, Table, TokenCard, ConfirmDialog, Toast and Skeleton architecture stays intact. Mobile holdings remain labelled cards from the same table cells; artwork stays an isolated image. Unknown remains visible, known zero stays zero, unavailable readings do not masquerade as live data. Modal BURN-<id>, fresh simulation and wallet-only signing are unchanged. Unpublished v9 transactions, staking and Mainnet actions stay unavailable. Footer non-affiliation remains.

## Acceptance

[32 mocked captures](screenshots/README.md), covering Squeeks/Network/Info/Settings/Merge/Mainnet in light/dark at 1280/390 plus connected/disconnected header crops. Production contains no mocked-review ribbon; fixtures inject it only for review evidence.

11 offline scripts and 48 mocked Chromium checks pass. Build checks static parity and independently gzips all five JS responses: **150,497 bytes**, below 200,000 ([report](audit/phase1-js-size.json)). Fonts/CSS are not JavaScript. Wire budgets remain 22 cold / 12 warm / 15 wallet; no new background RPC polling.

No live rerun or automatic qualification trigger. Phase 0 historical evidence is preserved; it does not qualify this source head. Phase 4 selection/planner/per-token work, later slim Network/Genesis decision, agent expansion and Phase 7 Vercel CSP/Lighthouse work remain deferred.
