# Changelog

History and review evidence live in the linked merged PRs. This list records durable changes, not per-run reports.

## Unreleased — Network and Genesis

Slimmed Network to wheel, chain and separate SQK supply/issuance/staking facts; moved checkpoint controls to Developers and event history to Activity. Added a lazy seven-day chart with explicit gaps, frozen v6 status and schema-v2 read-only Genesis inventory/wallet counts. Kept launch actions absent, mainnet reads disabled and exact API identity/fallback diagnostics in Developers. Existing wheel polling drives updates; no new polling timer.

## [PR #4 — Holder workspace and wallet flows](https://github.com/CryptoExplor/Squeekchain-console/pull/4)

Added merge planning, token detail pages, read-only address links, paginated Activity and available earnings. Removed client gas estimates while retaining simulations and the SQK unstake cap. Distinguished connected loading/failure/empty states; added explicit network switching and fixed route/watch/history isolation, with regression coverage.

## [PR #3 — Equal profiles and holder UI](https://github.com/CryptoExplor/Squeekchain-console/pull/3)

Made Sepolia v6/v9 equal guarded profiles with canonical keys, staking/approval flows, batched identity checks, display caching and holder-first controls. Restored the accepted frontend baseline and strengthened wallet lifecycle, RPC, artwork, CSP and cross-origin boundaries.

## [PR #2 — Safety and design foundations](https://github.com/CryptoExplor/Squeekchain-console/pull/2)

Established Wheelhouse's static browser-first UI, profile isolation, deployment identity verification, snapshot-pinned preparation/simulation, typed burn review and unsigned SDK/MCP boundaries.
