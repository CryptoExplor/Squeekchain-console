# Wheelhouse design contract

Browser-first Squeekchain holder utility. Preserve `sdk/`, `mcp/`, `src/`, `test/`, `build.mjs`, `wrangler.toml`; no architecture restart or RPC backend. Vercel target; `thewheel` workflow and repository name unchanged.

## Equal profiles

**Sepolia v6 / Sepolia v9** are equal user choices. Canonical keys: `sepolia-v6` / `sepolia-v9`. Legacy `sepolia` migrates only at hash, saved-storage and MCP input boundaries; adapters and caches never receive it. Default v9, then saved choice. Hashes include profile. Connect probes both collection balances: one held selects it, both held shows counts/choice, neither retains selection; Unknown never silently selects another profile. Mainnet is Not deployed.

Every operation uses the same fail-closed chain/snapshot/identity/slot/runtime/layout/version/wiring protection. Verification or stopped badges reflect runtime checks, not version policy. v9 expected identities come from the exact dated two-peer export, not an API configuration feed. Official-dApp-derived `sdk/abi-v9.js` is unchanged. Staking admin is a storage-slot check, not an invented ABI method; staking.launch zero is normal.

## Subtract standard

Remove taglines, helper copy and secondary labels where layout or behavior can carry the information. Keep operational states, irreversible-action warnings, meaningful labels and Unknown. The footer has one non-affiliation/testnet/advice line. Checkpoint explains itself once in How it works; its card shows state/button. Art provenance lives in How it works and Contracts, not a gallery paragraph.

Data panels use small chain/API icons with accessible names/tooltips. Trust is one verification/block/age line plus peers with Agreed/Not sampled states; never imply all configured endpoints served a read. A local age timer performs no RPC. Policy comes from the active profile's on-chain reads and clears to Unknown on failure/switch. Cooldowns are labelled in blocks. Pause explanation renders only for a true pause; mining-live requires observed round advancement.

Squeeks empty state has connection and watch-address controls, not instructions. Staking action fields appear only when relevant. Approval scope is explicit, with one-NFT approval preferred and all-current/future approval a separate choice. RPC-secret warnings appear inline only for key-like URL paths/queries. Activity rows retain their own receipt state and originating canonical profile across navigation.

## Safety and agents

Both wallet and staked merges require exact BURN-<donorId> before construction/simulation. The input's label gives the instruction; the dialog retains the permanent-burn safety line. Fresh simulation precedes every wallet prompt. Claims re-preview actual payout and recipient; changed outcomes stop. Unstake uses a labelled amount/fee-maxFee/net/deadline/gas review, and reuses the reviewed cap/deadline on re-preview. Agents read or prepare unsigned calls only: the same registry in `sdk/tools.js` drives generated JSON, local stdio MCP and browser tools. Human UI owns wallet prompts; there are no agent wallet-popup tools or owner keys.

## Structure and accessibility

Squeeks · Art · Network · Info, profile-qualified hash routes, back/deep-link support. Info contains How it works, Trust, Status, Contracts, Developers and About; Contracts exposes both address graphs and source provenance. Wallet menu: copy, Activity and disconnect. Settings: HTTPS RPC save/test/remove, discovery-cache clear, confirmed Activity clear, light/dark/system. Developers and Settings code stay lazy-loaded.

Light default; saved light/dark/system override. Local Barlow Condensed, Quicksand, IBM Plex Mono; warm panels, gold primary and blue focus/links. Header controls remain 36px/common radius/8px gap/18px glyphs; body/dialog action controls 44px. Visible 3px focus, keyboard tab/menu navigation, modal/sheet traps and focus restoration, reduced motion and skip link. Artwork remains an isolated image. Unknown is not an invented zero.

## Evidence

See [STATUS](STATUS.md) for exact current results and limits, [44 mocked captures](screenshots/README.md), [gzip report](audit/phase2-js-size.json), and both request-budget reports. Total external JavaScript is **152,951 bytes / 250,000 cap**, independently gzipped including lazy scripts. Offline tests are not live qualification. No live suite, signing, workflow dispatch, keeper, merge or deploy was run. Phase 4 planner/per-token redesign remains deferred.
