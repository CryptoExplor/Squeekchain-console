# DATA DIET — UI copy removal inventory (2026-11-04)

Scope: user-facing copy changed since `a8eb471`. This lists every removed/replaced static HTML text node plus the dynamic templates, old table vocabulary, and raw diagnostic families no longer presented as general copy. Some phrases remain valid in a different context (for example “Stake SQK” in a preview). Historical reports, SDK messages and protected unused component baselines are not rewritten to pretend their history disappeared. Internal identity pins and ABI signatures remain unchanged.

## Static text nodes removed or replaced

1. `Issued by v9 checkpoints`
2. `Holdings`
3. `Staking and custody`
4. `Action`
5. `Deposit NFTs`
6. `Withdraw NFTs`
7. `Merge staked NFTs`
8. `Claim and stake rewards`
9. `Stake SQK`
10. `Unstake SQK`
11. `Approve one NFT`
12. `Approve ALL NFTs (broad permission)`
13. `Approve exact SQK amount`
14. `NFT IDs`
15. `NFT ID`
16. `Survivor ID`
17. `Donor ID`
18. `Preview action`
19. `Merge plan`
20. `Choose which image and token ID survives. Type the exact BURN-<id> acknowledgement before call construction or simulation; review the simulation before wallet signing.`
21. `Connect a wallet, or inspect an address, to see positions.`
22. `rendered by the DotGrid renderer · shown as an isolated image`
23. `Both Sepolia profiles verify chain ID, graph, implementations, runtime hashes, layout digests, versions, proxy admins, wiring and active collection policy at one block. v6 uses published deployment pins; v9 uses the dated two-peer identity export and official ABI. Proxy slots are rechecked for each operation; v9 also rechecks mutable wiring and paused state. A mismatch stops actions.`
24. `Chain ID`
25. `Implementation and admin slots`
26. `Runtime code hashes`
27. `Layout digests`
28. `Wiring`
29. `Configured peers are availability preferences, not proof that each endpoint served the last snapshot. Two independent peer hashes are checked by the SDK for every snapshot. Immutable artwork integrity remains Unknown where hashes are unpublished.`

## Dynamic copy removed or replaced

| Former text/template | Replacement / location |
|---|---|
| Dated v9 release value from `sdk/deployments.js → identities.release` | Never rendered; network uses `V9 · Sepolia`, Contracts uses `V9 contracts`. Also redacted from displayed technical JSON, including cross-profile tools. The value itself remains an internal pin. |
| `published v6` | `V6 · Sepolia` |
| `no deployment` | `Not deployed` |
| `squeeks-sepolia-core3-mining6-001` | `V6 contracts` |
| `Equal profile: every operation checks the dated identity pins and same-block two-peer agreement. Mismatch stops actions.` | `Test network. Use test funds only.` |
| `Equal profile: every operation checks the published identity pins and same-block two-peer agreement. Mismatch stops actions.` | Same test-funds notice; Trust still exposes a checked/stopped checklist. |
| `Squeekchain has no mainnet deployment — the docs say the contracts live on Sepolia only. Switch to a Sepolia profile; this entry exists so the app says so instead of guessing.` | `Not deployed on Ethereum.`; still no Mainnet reads/actions. |
| `Minted by v6 mining` | `SQK issued` |
| `issuance.state().minted · processed round ${round}. Core settlement alone does not issue SQK.` | Deleted, no replacement source line. |
| `mining.state().minted · on-chain` | Deleted, no replacement source line. |
| `A wallet signing request is already pending` | Inline `Waiting for your wallet…` plus Cancel; no persistent pending banner. |
| `Pinned identities fully verified at block ${fullBlock}; proxy slots checked at ${block}. Two public RPC block hashes agree for this snapshot.` | `Network and contract checks passed at block ${fullBlock}; latest check at block ${block}. Two independent connections agree.` Both block meanings retained. |
| `checkpoint()` | `Checkpoint` Activity label |
| `claim(${count} ids)` | `Claim SQK` Activity label |
| `merge(${survivor} ← ${donor})` | `Merge #${survivor} and #${donor}` Activity label |
| `Fee / maxFee` | `Maximum fee` |
| `Review ${action}` with raw `claimAndStake`, `mergeDeposited`, `approveNft`, `approveAll`, `approveSqk` identifiers | Human labels: Claim and stake, Merge deposited, Approve one Squeek, Approve all Squeeks, Approve SQK. Deposit/Withdraw/Stake/Unstake remain ordinary action words. |
| `${preview.warning ?? action}` with raw action identifiers as fallback | Human action name, never a raw method identifier fallback. |
| Raw action identifier as Activity label | Human label using the same action-name map. |
| Entire uncollapsed preview JSON | Plain Simulation passed/action/amount/IDs/recipient/fee facts; JSON moved behind collapsed Technical details with Copy. |
| `${scope} failed: ${failure.error}. Nothing was signed.` | `Network or contract checks could not be completed. Actions are stopped. Nothing was signed.` Availability retains the existing two-peer/unavailable explanation. |
| `${error.message} → ${revert.name}(${revert.args})`, raw storage/slot/digest/revision/release/runtime/function diagnostics | General UI uses `The network or contract check failed. Actions are stopped. See Info › Developers for technical details.` Developer tools retain technical output. Ordinary actionable errors stay specific. |
| Raw verification-problem list as badge tooltip | `Network or contract checks did not match. Actions are stopped.` |
| Raw API event `type` / activity `kind` (for example `system.mining_checkpointed`) | Known labels such as SQK issuance updated / Round completed / Squeek deposited / Squeek withdrawn; unknown values use Network activity / Account activity, not arbitrary raw identifiers. |

## Replaced holdings-table vocabulary and controls

- Table column labels: `token`, `level`, `power`, `staked`, `pending`, `merge @`, `claimable SQK`, `art`. Replaced by automatically illustrated Squeek cards with Level, Power, Next merge, Custody.
- Row custody/round placeholders: `yes`, `no`, `None`, `r${pendingRound}`. Custody now reads Wallet or Deposited; pending-round internals are not card facts.
- Row art control: `View`; accessible name `View art for Squeek #${id}`. Owned art loads automatically; the separate Art gallery remains available.
- Old aggregate holdings summary labels `Squeeks`, `Power`, `Share`, `Claimable SQK` no longer form a mixed summary panel. Squeeks and SQK are separate sibling workspaces. SQK has Balance, Claimable, Staked, Fresh, Mature; unknown amounts stay Unknown.

## Additional final alignment copy

- `Simulate & claim` → `Claim` in the separate SQK action row (simulation and confirmation remain mandatory).
- ` · Staked` in merge-pair descriptions → ` · Deposited`, matching card custody labels.
- `Merging burns the donor NFT permanently and raises the survivor one level.` → `Merge permanently burns one Squeek and raises the one you keep by one level.`

## PR review display correction

- `ETH balance: Unknown` is no longer displayed for API wallet data that supplies no ETH reading. The menu line is hidden in that case; an actual guarded balance still displays normally. No zero is invented.

## Not removed

- BURN acknowledgement, per-token approval preference, explicit broad approval choice, human confirmation, fresh simulation, canonical inventory, same-block checks and independent-peer guard.
- RPC/unavailable warnings and Unknown distinctions; no live availability claim was substituted for a blocked TLS probe.
- All technical internals in SDK/ABI and developer tooling. The protected `test/components.mjs` remains unchanged.
