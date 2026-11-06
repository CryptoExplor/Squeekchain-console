# Current status

Wheelhouse is a static Cloudflare Pages app at https://wheel-house.pages.dev. Public display/RPC requests and human-wallet requests run in the browser; no backend, proxy, enabled keeper or closed-tab alerts are provided by the app.

## Support

| Profile | Working capabilities |
| --- | --- |
| Sepolia v6 | Verified network/holdings, wallet-held NFT claims and merges, checkpoint, art, token detail, read-only address views, merge planning and local Activity (remote history/earnings unavailable). No staking or claim-and-stake. |
| Sepolia v9 | Verified network, wallet/deposited NFTs, deposit/withdraw, scoped approvals, wallet/deposited merges, SQK stake/unstake, claim/claim-and-stake, checkpoint, art, token detail, read-only address views, merge planning, Activity and available earnings. |
| Mainnet | Not deployed; no deployment reads or actions. |

Keys are `sepolia-v6`, `sepolia-v9` and `mainnet`. v9 is the default; saved choices and qualified links preserve context. Wallet identity is independent of profile and watch mode. Connect/profile selection requests the wallet network; rejection allows a menu retry. Silent restore, cross-tab hints and watch-only navigation do not request network changes.

Connected pending reads show Loading; failed reads show Unavailable with Retry without reconnecting. A real empty portfolio is distinct from missing data. Account/profile generations reject late reads and simulations. Invalid links recover to owner mode on normal navigation; watched detail scope survives profile changes/reload. Account history excludes ownerless local records and clears pagination on disconnect.

144px cards have filters, Grid/Table and 40-card pages. Explore projects logs with partial browsing/stats and hash-scoped IndexedDB hydration resume. History checks precede 100%; final supply/snapshot checks finish or offer Retry within four seconds. Results include a 30-wallet leaderboard and 48-hour merges. v6 has a pins-scoped frozen cache. Index/API data never authorize actions. The Squeeks strip links official Status; Genesis is display-only. Qualification: draft PR #6.

## Safety and limits

- Both Sepolia profiles require pinned identity checks, fresh canonical ownership/custody and same-snapshot simulation before wallet submission. Missing data remains Unknown. API output is display-only.
- Merge paths only preselect steps; each burn needs separate exact `BURN-<id>` review. No automatic multi-step signing.
- Wallet payloads contain only from/to/data/value. Wallets choose gas and network fees; the SQK unstake fee cap/deadline remain enforced. Changed/lower claims or recipients stop where required; fresh v9 claim increases may be shown and accepted.
- Cancelling in the app cannot close a wallet prompt or cancel a broadcast. A provider-scoped outstanding-request lock and late-hash Activity tracking remain active. Pending network prompts also block signing.
- Indexed/public RPC availability, browser CORS and external API freshness are not guaranteed. Incomplete inventory is unavailable, not an empty account. Earnings gaps and unsupported measurements remain Unknown or hidden.
- Identity checks do not authenticate all serving-RPC state. See [SECURITY](SECURITY.md). No exhaustive security audit, live availability guarantee or fork-execution result is claimed.

## Open items

Live qualification and manual wallet checks remain separate from mocked CI. Fork workflows require explicit loopback setup and suitable holders; discovery is not execution. Accessibility/performance audits beyond the existing mocked checks remain unqualified. Genesis has no launch, claim or refund actions.

Request ceilings live in `test/budgets.json`; build enforces the all-script 500,000-byte gzip cap. Test output goes to ignored `artifacts/` with seven-day CI retention, never into documentation. Current tests and CI—not copied run reports—are the source of validation results. See [CHANGELOG](CHANGELOG.md) for merged PRs.
