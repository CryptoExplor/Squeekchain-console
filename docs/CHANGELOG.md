# Changelog

History and review evidence live in the linked merged PRs. This list records durable changes, not per-run reports.

## Unreleased — Squeek browsing and Explore

Replaced the Network dashboard with shared filterable cards, bounded lazy image loading and a read-only Explore index/leaderboard. Projections resume locally, replay reorgs and suppress aggregates on supply mismatch. Preserved fresh on-chain action checks, typed burn review and display-only Genesis. Rejected identity batches use bounded native calls, and unavailable identity peers may be replaced only at the same agreed snapshot. Info switches one section at a time; plain verification failures keep detailed diagnostics in Developers. Missing presentation values use a dash, never a fabricated zero. Removed the public checkpoint-round list from wallet Activity. The compact strip preserves mobile block height and labels last-good/offline wheel readings. Activity lives in the wallet drawer; browser RPC destinations are explicitly CSP-listed. Network details and exact source diagnostics remain in Developers.

## [PR #4 — Holder workspace and wallet flows](https://github.com/CryptoExplor/Squeekchain-console/pull/4)

Added merge planning, token detail pages, read-only address links, paginated Activity and available earnings. Removed client gas estimates while retaining simulations and the SQK unstake cap. Distinguished connected loading/failure/empty states; added explicit network switching and fixed route/watch/history isolation, with regression coverage.

## [PR #3 — Equal profiles and holder UI](https://github.com/CryptoExplor/Squeekchain-console/pull/3)

Made Sepolia v6/v9 equal guarded profiles with canonical keys, staking/approval flows, batched identity checks, display caching and holder-first controls. Restored the accepted frontend baseline and strengthened wallet lifecycle, RPC, artwork, CSP and cross-origin boundaries.

## [PR #2 — Safety and design foundations](https://github.com/CryptoExplor/Squeekchain-console/pull/2)

Established Wheelhouse's static browser-first UI, profile isolation, deployment identity verification, snapshot-pinned preparation/simulation, typed burn review and unsigned SDK/MCP boundaries.
